# Validación E2E — TASK-005 (2026-07-23)

> Resultados de correr el núcleo transaccional completo (reserva DO, checkout,
> webhooks idempotentes, workflow post-pago) contra Stripe en modo test, en
> local (`wrangler dev` + `stripe listen`). Cierra el criterio de Fase 2:
> "una transacción real end-to-end confiable, incluyendo pago fallido y
> webhook reintentado".

## Entorno

- API local (`wrangler dev`, D1/KV/DO locales) + `stripe listen --forward-to
  localhost:8787/webhooks/stripe`.
- Cuenta plataforma `acct_1Tw8ybKpkJAI3F8V`, seller ancla (Connect Express)
  `acct_1TwA3pKpkJIW4eIn` — únicos con `stripe_connect_account_id` poblado en
  local.
- Auth por magic link (Bearer token), checkout disparado directo por `curl`
  contra `POST /checkout`, pago real en la página hospedada de Stripe Checkout
  vía navegador (Claude in Chrome).

## AC#1 — Happy path

**✅ Confirmado** (ya validado en la sesión previa, TASK-003/004): pago exitoso
con tarjeta `4242 4242 4242 4242`, orden pasa a `paid`, workflow post-pago
decrementa inventario y libera el hold. Reconfirmado en esta sesión con una
segunda compra (Mother of Runes, orden `91781e22-...`): `checkout.session.completed`
→ `payment_intent.succeeded` → `charge.succeeded` → `application_fee.created`,
orden `paid`, inventario `5→4`, log `[post-payment] orden ... liquidada`.

## AC#2 — Pago fallido (tarjeta `4000000000000002`)

**✅ Confirmado, con hallazgo importante (ver "Problema encontrado" abajo).**

Orden `ddae665f-...` (Path to Exile x1). Al pagar con la tarjeta de rechazo
genérico, Stripe muestra "Se rechazó tu tarjeta de crédito" y mantiene la
Checkout Session **abierta para reintentar** (comportamiento estándar de
Stripe Checkout). Nuestro webhook recibió `payment_intent.payment_failed` →
`releaseAndCancel` → orden pasó a `cancelled`, hold liberado. Sin confirmación
falsa en este punto: correcto.

## AC#3 — Reintento de webhook (idempotencia)

**✅ Confirmado.** `stripe events resend` no aplica a eventos Connect entregados
por un endpoint `connect=true` (CLI los trata como "notification" de cuenta
conectada y rechaza reconfigurar el endpoint). Se replicó manualmente: se
recuperó el evento real `checkout.session.completed`
(`evt_1TwD5mKpkJIW4eInOa9fz2Ef`) vía API con `Stripe-Account`, se firmó de
nuevo con el mismo `STRIPE_WEBHOOK_SECRET` (HMAC-SHA256 sobre
`{timestamp}.{body}`) y se reenvió a `POST /webhooks/stripe`.

Resultado: `{"received":true,"duplicate":true}` — el insert en `webhook_events`
chocó con la PK (`id` del evento) y el efecto NO se re-ejecutó:
- `inventory.quantity` de Mother of Runes se mantuvo en `4` (sin doble
  decremento).
- `webhook_events` tiene exactamente 1 fila para ese `event.id`.
- No hubo segunda línea `[post-payment] orden ... liquidada` en el log.

## AC#4 — TTL de reserva (Durable Object)

**✅ Confirmado.** Se redujo temporalmente `RESERVATION_TTL_MS` a 15s
(`apps/api/src/durable-objects/inventory-reservation.ts`, revertido a 15 min
inmediatamente después de la prueba — sin diff neto en el archivo).

- Orden A reservó las 2 unidades de Tarmogoyf (stock total = 2).
- Orden B, inmediatamente después, con la misma cantidad → `409
  reservation_failed / insufficient` (correcto: sin sobreventa).
- Tras esperar >15s sin pagar la orden A, Orden B reintentada → `201 Created`
  (el hold expiró y se liberó; nueva reserva exitosa).

## AC#5 — Problema encontrado (crítico) — ✅ Resuelto 2026-07-23 (TASK-013)

**Un pago exitoso tras un rechazo previo en la misma Checkout Session se
pierde: dinero real (test-mode) se cobra pero la orden queda `cancelled` y el
inventario nunca se decrementa.**

**Reproducción:**
1. Comprador inicia checkout, tarjeta rechazada (`4000000000000002`).
   `payment_intent.payment_failed` → `releaseAndCancel` → orden `cancelled`,
   hold liberado. Stripe mantiene la misma Checkout Session abierta para
   reintentar (comportamiento normal de Stripe, no es un bug de Stripe).
2. El comprador reintenta en la MISMA sesión con una tarjeta válida
   (`4242...`). Stripe cobra de verdad: `checkout.session.completed` →
   `payment_intent.succeeded` → `charge.succeeded` →
   `application_fee.created`. El frontend redirige a `/checkout/success`
   como si todo hubiera salido bien.
3. Pero en nuestro backend: `post-payment.ts` → `settle-order` tiene el guard
   `if (order.status !== 'pending') return` — como el status ya es
   `cancelled` (no `pending`), el step es un no-op. Orden queda `cancelled`
   para siempre, inventario nunca se decrementa.

Verificado en vivo (orden `ddae665f-6764-467f-9d5b-b75e630a5637`, 2026-07-23):
tras el reintento pagado, `orders.status` siguió en `cancelled` e
`inventory.quantity` de Path to Exile siguió en `10` (sin decrementar), pese a
que Stripe registró el cobro y la application fee completos.

**Por qué importa:** el dinero sí se movió (al connected account del seller +
fee a la plataforma) pero el sistema no tiene registro de la venta — el
comprador pagó y no tiene una orden visible en "Mis compras" reflejando el
pago real, el inventario sigue disponible para otro comprador (riesgo de
doble venta del mismo single), y no hay reconciliación automática entre el
ledger de Stripe y D1.

**Causa raíz:** `payment_intent.payment_failed` en `webhooks.ts` cancela la
orden inmediatamente, pero Stripe Checkout permite reintentar la MISMA sesión
tras un rechazo — la cancelación es prematura. La cancelación real solo
debería ocurrir en `checkout.session.expired` (cuando la sesión ya no admite
reintentos), no en el primer intento fallido de PaymentIntent.

**Seguimiento:** creado **TASK-013** (bug, alta prioridad) para corregir esto
antes de ir a modo live — ver `checklist-go-live-real.md` sección 4
(producto/operación), este es un bloqueante de facto para el go-live real
aunque no esté aún en esa lista explícitamente.

### Fix aplicado (2026-07-23)

**Estrategia:** `payment_intent.payment_failed` ya NO cancela la orden ni
libera el hold — solo se loguea (`console.warn`) para observabilidad. La
cancelación real (liberar hold + `orders.status = 'cancelled'`) ocurre
**únicamente** en `checkout.session.expired`, que es el único evento en el que
Stripe confirma que la Checkout Session ya no admite más intentos. Como el
guard `if (order.status !== 'pending') return` de `settle-order` en
`post-payment.ts` ya existía, con la orden permaneciendo `pending` tras el
rechazo, un pago exitoso posterior en la misma sesión la liquida con el
camino normal (sin tocar `post-payment.ts`).

Cambios en `apps/api/src/routes/webhooks.ts`: el caso
`payment_intent.payment_failed` deja de llamar a `releaseAndCancel`.

**Verificado con reproducción sintética de eventos firmados (misma técnica de
AC#3, dado que `stripe events resend` no soporta eventos Connect):**
- Orden `e3ab7c8a-...` (Path to Exile x1): `payment_intent.payment_failed`
  sintético → orden se mantuvo `pending` (antes: `cancelled`). Luego
  `checkout.session.completed` sintético → orden pasó a `paid`, inventario
  `10→9`, log `[post-payment] orden ... liquidada`. Sin doble reserva.
- Orden `5a6840de-...` (caso normal, AC#4 de TASK-013): `payment_intent.payment_failed`
  sintético (sin retry) seguido de `checkout.session.expired` sintético →
  orden pasó a `cancelled` correctamente, inventario sin cambios (`9`, sin
  doble decremento). Confirma que el camino de cancelación real sigue
  funcionando igual que antes.

## Resumen

| AC | Resultado |
|---|---|
| #1 Happy path | ✅ |
| #2 Pago fallido | ✅ (orden/inventario correctos en el rechazo en sí) |
| #3 Idempotencia de webhook | ✅ |
| #4 TTL de reserva | ✅ |
| #5 Documentación | ✅ (este documento) + hallazgo crítico → TASK-013 (✅ resuelto 2026-07-23) |

Cierra el criterio de Fase 2 de validación E2E. El bug real descubierto
(TASK-013) fue corregido y verificado el mismo día.
