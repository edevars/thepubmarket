# Checklist — de "producción de prueba" a producción real

> Qué falta para que el dinero que se mueva en The Pub Market sea dinero real.
> Hasta que este checklist esté cerrado, **todo lo desplegado en Cloudflare
> ("producción") corre con Stripe en modo TEST** — ver aviso en
> [`estado-actual.md`](./estado-actual.md).

**Creado:** 2026-07-23, al cerrar TASK-003/TASK-004 (Stripe Connect + checkout
E2E funcionando en modo test, tanto local como en el Worker desplegado).

---

## Por qué existe este documento

El 2026-07-23 se subieron a los Workers desplegados (`thepubmarket-api`,
`thepubmarket-web`) llaves y webhook de Stripe **en modo test**
(`wrangler secret put`), y se pobló `sellers.stripe_connect_account_id` en el
D1 **remoto** con una cuenta Connect de prueba. Esto hace que el flujo de
checkout funcione end-to-end en el entorno desplegado — pero sigue sin tocar
un peso real. Es fácil confundir "ya está en producción" con "ya se puede
cobrar de verdad": no es lo mismo. Este checklist es la lista explícita de lo
que falta para cruzar esa línea.

---

## 1. Stripe — modo live

- [ ] **Activar la cuenta de plataforma en modo live.** Requiere verificación de
      negocio real ante Stripe (RFC/persona moral, dirección, representante
      legal, cuenta bancaria de la plataforma para recibir el application fee).
- [ ] **Onboarding de The Pub Game Store (ancla) en modo live.** El onboarding
      de test (TASK-002, `acct_1TwA3pKpkJIW4eIn`) **no se traslada** a live —
      Stripe trata test y live como cuentas completamente separadas. Hay que
      repetir el Express onboarding con documentos y cuenta bancaria reales.
- [ ] **Onboarding en modo live de cualquier seller adicional** invitado
      (recordar: modelo vetted, no auto-registro — ver `CLAUDE.md`).
- [ ] **Nuevo webhook endpoint en modo live** (`stripe.webhook_endpoints.create`
      o Dashboard, con `connect=true` y los 4 eventos que procesa
      `apps/api/src/routes/webhooks.ts`: `checkout.session.completed`,
      `checkout.session.expired`, `payment_intent.payment_failed`,
      `account.updated` (TASK-007). El `whsec_` de live es distinto al de test.
- [ ] **Sign-off explícito: modelo Express de sellers (TASK-007).** Crear una
      cuenta Connect Express (`controller.stripe_dashboard.type: 'express'`)
      exige por API que la plataforma sea `fees.payer` y `losses.payments =
      'application'` — la plataforma absorbe las comisiones de Stripe y queda
      expuesta a saldos negativos/contracargos que la cuenta del seller no
      alcance a cubrir (verificado en vivo contra la API; no es una elección
      del código, es un hard constraint de Stripe). NO es custodia de fondos
      del comprador (el direct charge sigue liquidando 100% en la cuenta del
      seller — ver `apps/api/src/routes/seller-connect.ts`), pero SÍ es
      exposición financiera real de la plataforma. El seller ancla (TASK-002,
      `acct_1TwA3pKpkJIW4eIn`) quedó en un modelo Standard-equivalente
      (`fees.payer: 'account'`, `losses.payments: 'stripe'`, cero exposición) —
      decidir antes de onboardear sellers reales adicionales si se mantiene
      Express (fricción de onboarding menor, exposición de plataforma) o se
      cambia a Standard (cero exposición, seller usa su propio Dashboard
      completo de Stripe). Decisión pendiente — confirmada explícitamente el
      2026-07-23: por ahora se queda en Express en modo test; revisar antes de
      invitar sellers reales.
- [ ] **Reemplazar secrets en el Worker de prod** con las llaves `sk_live_...` /
      `whsec_...` de live vía `wrangler secret put` (mismo mecanismo que hoy,
      solo cambian los valores).
- [ ] **Revisar el MCC / giro del negocio** en el Dashboard de Stripe — hoy es
      genérico; confirmar que corresponde a marketplace de TCG.
- [ ] Confirmar que Stripe no requiere una **revisión adicional de la
      plataforma Connect** para el volumen/tipo de application fee que se va a
      cobrar (algunos modelos de Connect piden revisión manual antes de
      procesar pagos reales).

## 2. Infraestructura / dominio

- [ ] **Dominio propio** para `apps/web` y `apps/api` (hoy son subdominios
      `*.workers.dev`). Actualizar `WEB_BASE_URL` en `apps/api/wrangler.jsonc` y
      `NEXT_PUBLIC_API_URL` en `apps/web/.env`/config de Pages.
- [ ] **Envío real de magic links.** Hoy `apps/api/src/lib/email.ts` solo hace
      `console.log` del link (ver comentario en el archivo). Antes de live hay
      que integrar Cloudflare Email Service (o proveedor) con dominio + SPF/DKIM.
- [ ] **Cloudflare Access / Zero Trust** para el admin de carga y panel — hoy
      protegido por `ADMIN_API_KEY` de texto plano (TODO ya marcado en
      `wrangler.jsonc`). Reemplazar antes de invitar sellers reales.
- [ ] **Turnstile** activo en registro/checkout (mencionado en `CLAUDE.md` como
      parte del stack; confirmar que está realmente wireado, no solo planeado).
- [ ] **WAF + rate limiting** confirmados activos en el dashboard de Cloudflare
      para los Workers de prod (no solo "disponibles por default").
- [ ] **Monitoreo/alertas:** algo que avise si un webhook falla, si
      `webhook_events` deja de recibir eventos, o si el Workflow post-pago
      queda atorado (hoy no hay alerting, solo `console.error`).
- [ ] **Backups de D1** (export periódico) — pérdida de `orders`/`sellers` en
      producción real es pérdida de dinero de terceros, no solo de catálogo.

## 3. Legal / regulatorio (México)

> Recordatorio: lo siguiente es orientación técnica, **no asesoría legal ni
> fiscal formal** — confirmar con un abogado/contador antes de operar con
> dinero real.

- [ ] Confirmar que el modelo direct charge + application fee sigue vigente tal
      cual está implementado (no debe cambiar a separate charges/transfers ni a
      destination charges que dejen saldo en la plataforma — ver regla no
      negociable en `CLAUDE.md`).
- [ ] Revisar con asesoría si The Pub Market necesita algún tipo de aviso o
      registro adicional (más allá de quedar fuera de IFPE) para operar como
      facilitador de pagos de terceros en México.
- [ ] Aclarar el esquema de facturación (CFDI): cada seller factura directo al
      comprador (dado que el cargo ocurre en su propia cuenta Connect); confirmar
      que esto queda claro en Términos y Condiciones.
- [ ] Publicar **Términos y Condiciones, Política de Privacidad y Política de
      reembolsos/disputas** antes de aceptar pagos reales.
- [ ] Definir proceso de soporte para contracargos (chargebacks) y disputas —
      quién responde, con qué evidencia, en qué plazo (Stripe se los cobra al
      Connect account del seller en un direct charge, no a la plataforma, pero
      el usuario final se queja con The Pub Market).

## 4. Producto / operación

- [x] **TASK-013 (resuelto 2026-07-23):** un pago exitoso al reintentar en la
      misma Checkout Session tras un rechazo previo se perdía (orden quedaba
      `cancelled`, inventario no se decrementaba, pese a cobro real).
      Encontrado en TASK-005 (2026-07-23), corregido el mismo día — ver
      [`validacion-e2e-task-005.md`](./validacion-e2e-task-005.md).
- [ ] Confirmar que **TASK-005** (o la que valide el flujo E2E completo) se
      corrió también en modo live antes de anunciar públicamente.
- [ ] Definir un **plan de rollback**: si algo falla en las primeras
      transacciones reales, cómo se pausa el checkout sin dejar seller/comprador
      colgado (flag simple, o desactivar el botón de pago en el front).
- [ ] Confirmar que el 10% de `PLATFORM_FEE_BPS` sigue siendo la comisión
      deseada para el lanzamiento real (fue una decisión rápida en TASK-001; se
      puede revisar antes de ir live).

---

## Estado

Ninguno de los puntos anteriores está resuelto todavía. Este documento se
actualiza según se vaya avanzando; no borrar líneas ya resueltas, marcarlas
`[x]` con fecha.
