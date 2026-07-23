---
id: TASK-005
title: Validate end-to-end Stripe transaction flow in test mode
status: Done
assignee: []
created_date: '2026-07-22 22:31'
updated_date: '2026-07-23 03:22'
labels:
  - 'epic:e2e-validation'
  - spike
milestone: m-0
dependencies:
  - TASK-004
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once checkout is un-mocked and pointed at a live (test-mode) Stripe Connect setup, the full transactional core (inventory reservation Durable Object, checkout, idempotent webhooks, post-payment Workflow) needs to be exercised end-to-end for the first time with real Stripe test-mode traffic. This is the closing criterion for Phase 2 per the roadmap: 'a reliable real end-to-end transaction, including failed payment and retried webhook.'
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Happy path: successful test-mode payment completes, order confirmed, inventory decremented via post-payment Workflow (apps/api/src/workflows/post-payment.ts)
- [x] #2 Failed payment tested with Stripe test card 4000000000000002; order and inventory state verified correct (no false confirmation)
- [x] #3 Webhook retried manually (e.g. via Stripe CLI resend) confirmed idempotent — no double inventory decrement, using webhook_events table
- [x] #4 Reservation TTL confirmed to release the single (inventory-reservation.ts Durable Object) when payment is never completed
- [x] #5 Results and any issues found documented in docs/ingenieria/ (e.g. estado-actual.md or a new validation note)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validado en local con wrangler dev + stripe listen; resultados completos en docs/ingenieria/validacion-e2e-task-005.md. AC#5 surfacio un bug real: pago exitoso tras retry en la misma Checkout Session (despues de un decline) se pierde -- orden queda cancelled, inventario no se decrementa, pese a cobro real de Stripe. Trackeado como TASK-013 (bug, high priority, bloqueante para checklist-go-live-real.md).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Validacion E2E completa del nucleo transaccional contra Stripe test-mode en local (wrangler dev + stripe listen):

- AC#1 (happy path): reconfirmado con una segunda compra real (Mother of Runes) -- checkout.session.completed -> payment_intent.succeeded -> charge.succeeded -> application_fee.created, orden paid, inventario decrementado, workflow post-pago corrido.
- AC#2 (pago fallido, tarjeta 4000000000000002): confirmado -- payment_intent.payment_failed -> releaseAndCancel -> orden cancelled, hold liberado. Sin confirmacion falsa en el decline en si.
- AC#3 (idempotencia de webhook): confirmado replicando manualmente la firma HMAC-SHA256 de un evento real (stripe events resend no aplica a eventos Connect entregados via endpoint connect=true) y reenviandolo -- respuesta {duplicate:true}, sin doble decremento de inventario ni doble ejecucion del workflow post-pago (PK de webhook_events).
- AC#4 (TTL de reserva): confirmado reduciendo temporalmente RESERVATION_TTL_MS a 15s (revertido despues, sin diff neto en el archivo) -- una segunda orden por el mismo stock agotado rebota con 409 insufficient; tras expirar el TTL, la misma orden se reserva con exito.
- AC#5 (documentacion): docs/ingenieria/validacion-e2e-task-005.md creado con el detalle completo de las 5 AC; README.md y estado-actual.md enlazan el nuevo doc.

Hallazgo critico durante AC#2: si el comprador reintenta pagar en la MISMA Checkout Session despues de un rechazo, Stripe cobra de verdad (charge.succeeded + application_fee.created reales) pero nuestro backend ya habia cancelado la orden en el primer decline (guard `status !== 'pending'` en post-payment.ts settle-order) -- la orden queda cancelled para siempre y el inventario nunca se decrementa. Verificado en vivo (orden ddae665f-6764-467f-9d5b-b75e630a5637, 2026-07-23). Causa raiz: payment_intent.payment_failed cancela la orden inmediatamente, pero Stripe Checkout permite reintentar la misma sesion tras un rechazo -- la cancelacion deberia esperar a checkout.session.expired. Creado TASK-013 (bug, high priority) para el fix; agregado como bloqueante en checklist-go-live-real.md seccion 4.

Cierra el criterio de validacion E2E de Fase 2 del roadmap.
<!-- SECTION:FINAL_SUMMARY:END -->
