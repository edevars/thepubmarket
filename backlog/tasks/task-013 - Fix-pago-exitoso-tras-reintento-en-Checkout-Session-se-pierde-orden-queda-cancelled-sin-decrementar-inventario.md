---
id: TASK-013
title: >-
  Fix: pago exitoso tras reintento en Checkout Session se pierde (orden queda
  cancelled, sin decrementar inventario)
status: Done
assignee: []
created_date: '2026-07-23 03:21'
updated_date: '2026-07-23 06:22'
labels:
  - 'epic:e2e-validation'
  - stripe
  - checkout
milestone: m-0
dependencies:
  - TASK-005
modified_files:
  - apps/api/src/routes/webhooks.ts
  - docs/ingenieria/validacion-e2e-task-005.md
  - docs/ingenieria/estado-actual.md
  - docs/ingenieria/checklist-go-live-real.md
priority: high
type: bug
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Descubierto durante la validación E2E de TASK-005 (ver `docs/ingenieria/validacion-e2e-task-005.md`, sección AC#5).

Reproducción:
1. Comprador inicia checkout, tarjeta rechazada (test card 4000000000000002). Nuestro webhook recibe `payment_intent.payment_failed` -> `releaseAndCancel` en `apps/api/src/routes/webhooks.ts` -> la orden pasa a `cancelled` y se libera el hold de reserva. Stripe deja la MISMA Checkout Session abierta para reintentar (comportamiento estándar de Stripe, no es un bug de Stripe).
2. El comprador reintenta en esa misma sesión con una tarjeta válida (4242...). Stripe cobra de verdad: `checkout.session.completed` -> `payment_intent.succeeded` -> `charge.succeeded` -> `application_fee.created`. El frontend redirige a `/checkout/success` como si todo hubiera salido bien.
3. En nuestro backend, `apps/api/src/workflows/post-payment.ts` (`settle-order` step) tiene el guard `if (order.status !== 'pending') return`. Como el status ya es `cancelled` (no `pending`), el step es un no-op: la orden queda `cancelled` para siempre y el inventario nunca se decrementa.

Verificado en vivo en local el 2026-07-23 (orden `ddae665f-6764-467f-9d5b-b75e630a5637`): tras el reintento pagado, `orders.status` siguió en `cancelled` e `inventory.quantity` de Path to Exile siguió en 10 (sin decrementar), pese a que Stripe registró el cobro y la application fee completos.

Por qué importa: el dinero sí se movió (charge al connected account del seller + application fee a la plataforma) pero el sistema no tiene registro de la venta. El comprador pagó y no ve una orden reflejando ese pago en "Mis compras"; el inventario sigue disponible para otro comprador (riesgo de doble venta del mismo single); no hay reconciliación automática entre el ledger de Stripe y D1.

Causa raíz: `payment_intent.payment_failed` cancela la orden inmediatamente, pero Stripe Checkout permite reintentar la MISMA sesión tras un rechazo de tarjeta -- la cancelación es prematura. La cancelación "de verdad" (ya no hay forma de que este pago se complete) solo debería dispararse en `checkout.session.expired`, no en el primer intento fallido de PaymentIntent dentro de una sesión que sigue abierta.

Bloqueante de facto para ir a modo live (ver `docs/ingenieria/checklist-go-live-real.md`) aunque no estaba en esa lista al momento de escribirla.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Definir y documentar la estrategia correcta: ¿dejar de cancelar/liberar el hold en payment_intent.payment_failed (solo loggear/alertar) y cancelar de verdad solo en checkout.session.expired? ¿o revertir un cancelled->pending si llega un pago exitoso posterior para la misma orden/sesión?
- [x] #2 Implementar el fix en apps/api/src/routes/webhooks.ts y/o apps/api/src/workflows/post-payment.ts según la estrategia elegida, preservando la propiedad de no-custodia (CLAUDE.md) y la idempotencia existente
- [x] #3 Test E2E: reproducir el escenario (decline con 4000000000000002 seguido de retry exitoso con 4242... en la misma Checkout Session) y confirmar que la orden termina paid, el inventario se decrementa correctamente y no hay doble reserva/venta
- [x] #4 Confirmar que el caso normal (decline sin retry, sesión expira) sigue liberando el hold y cancelando la orden como antes
- [x] #5 Actualizar docs/ingenieria/validacion-e2e-task-005.md o estado-actual.md marcando este hallazgo como resuelto, con fecha
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Estrategia elegida (AC#1): `payment_intent.payment_failed` deja de cancelar/liberar el hold, solo se loguea (console.warn) para observabilidad. La cancelación real (release + status='cancelled') ocurre únicamente en `checkout.session.expired`. El guard existente `if (order.status !== 'pending') return` en post-payment.ts ya cubre el caso de éxito posterior sin más cambios: al no cancelar en el rechazo, la orden sigue pending y un pago exitoso subsecuente en la misma sesión se liquida por el camino normal.

Implementación (AC#2): único cambio en apps/api/src/routes/webhooks.ts — el caso payment_intent.payment_failed ya no llama a releaseAndCancel, solo loguea un console.warn. checkout.session.expired queda intacto (sigue siendo el único trigger real de cancelación).

Verificación E2E (AC#3 y AC#4) vía reproducción sintética de eventos Stripe firmados manualmente (misma técnica de TASK-005 AC#3, ya que stripe events resend no soporta eventos Connect): Orden e3ab7c8a-... (Path to Exile x1) — payment_intent.payment_failed sintético → orden se mantuvo pending (antes del fix habría quedado cancelled); checkout.session.completed sintético inmediatamente después → orden pasó a paid, inventory.quantity 10→9, log '[post-payment] orden ... liquidada'. Sin doble reserva/venta. Orden 5a6840de-... (caso normal AC#4) — payment_intent.payment_failed sintético (sin retry) → checkout.session.expired sintético → orden pasó a cancelled correctamente, inventory sin cambios (9, sin doble decremento).

typecheck y lint (pnpm -F @thepubmarket/api typecheck, pnpm lint) limpios.

Docs actualizados (AC#5): validacion-e2e-task-005.md (sección AC#5 marcada resuelta + subsección 'Fix aplicado'), estado-actual.md (item 2 de 'Lo que falta' marcado resuelto), checklist-go-live-real.md (bullet de TASK-013 en sección 4 marcado [x]).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Se corrigió el bug de TASK-013: un pago exitoso al reintentar en la misma Checkout Session tras un rechazo previo ya no se pierde. Cambio mínimo en apps/api/src/routes/webhooks.ts: payment_intent.payment_failed dejó de cancelar la orden/liberar el hold (solo loguea para observabilidad); la cancelación real sigue ocurriendo únicamente en checkout.session.expired. El guard pending existente en post-payment.ts ya resolvía el resto sin tocarlo. Verificado con reproducción sintética de eventos Stripe firmados: escenario decline→retry-success ahora liquida la orden y decrementa inventario correctamente; escenario decline→expira (sin retry) sigue cancelando como antes, sin doble decremento. Docs actualizados: validacion-e2e-task-005.md, estado-actual.md, checklist-go-live-real.md.
<!-- SECTION:FINAL_SUMMARY:END -->
