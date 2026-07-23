---
id: TASK-003
title: Configure real Stripe secrets and webhook endpoint (local and prod)
status: Done
assignee: []
created_date: '2026-07-22 22:31'
updated_date: '2026-07-23 01:18'
labels:
  - 'epic:stripe-platform'
  - ops
milestone: m-0
dependencies: []
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Checkout and webhook handling (apps/api/src/routes/webhooks.ts, apps/api/src/routes/checkout.ts) currently have no real Stripe credentials wired. Need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET set for both local dev and production so signature verification and idempotent webhook processing (webhook_events table) can actually run against real Stripe test-mode events.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET set in apps/api/.dev.vars for local dev
- [x] #2 Same secrets set in production via `wrangler secret put`
- [x] #3 `stripe listen --forward-to <local-api>/webhooks/stripe` (or the real route in routes/webhooks.ts) successfully forwards test events locally
- [x] #4 Webhook signature verification passes against real Stripe test-mode events
- [x] #5 Idempotency via webhook_events table confirmed to still work with real event ids
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verificado E2E en local: llave secreta correcta identificada (sk_test_...oPOJJG, cuenta plataforma acct_1Tw8ybKpkJAI3F8V) tras detectar que la primera llave pegada pertenecía a la cuenta conectada del seller (acct_1TwA3pKpkJIW4eIn) — confirmado repitiendo la llamada de checkout.sessions.create con curl directo a Stripe: con la llave de la cuenta conectada, Stripe rechaza application_fee_amount ('parameter_missing'); con la llave de plataforma, funciona.

stripe listen --forward-to localhost:8787/webhooks/stripe reenvió 6 eventos reales (charge.succeeded, payment_intent.succeeded, checkout.session.completed, payment_intent.created, charge.updated, application_fee.created), todos 200. D1 local: orders.status paso a 'paid' (subtotal_cents 9000, platform_fee_cents 900 = 10%); webhook_events tiene las 6 filas con los event_id reales de Stripe (id, type, created_at).

AC#2: creado webhook endpoint en Stripe (we_1TwBD2KpkJAI3F8VdvRptxjn, connect=true, eventos checkout.session.completed/expired + payment_intent.payment_failed) apuntando al Worker desplegado (https://thepubmarket-api.enrique-devars-cee.workers.dev/webhooks/stripe). STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET subidos al Worker de prod via `wrangler secret put`. IMPORTANTE: son credenciales de modo TEST — lo desplegado no mueve dinero real todavía. Checklist de go-live real en docs/ingenieria/checklist-go-live-real.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Stripe Connect wired end-to-end for local dev and the deployed Worker, all in test mode. STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET set in .dev.vars (after correcting an initial mistake: the first key pasted belonged to the connected account, not the platform — confirmed via direct Stripe API calls) and via `wrangler secret put` on prod. A Connect webhook endpoint (connect=true, 3 relevant event types) was created in Stripe pointing at the deployed API. Verified E2E locally: stripe listen forwarded 6 real events (all 200), order flipped to 'paid', webhook_events recorded all event ids, application_fee.created confirmed the 10% platform fee was actually charged on the direct charge. Remote D1 sellers.stripe_connect_account_id was also populated (was only set locally before) so the deployed environment can process checkout too. Documented clearly in docs/ingenieria/estado-actual.md and a new docs/ingenieria/checklist-go-live-real.md that this is all still TEST MODE — going live for real money needs separate Stripe live-mode onboarding, domain, email, Access, and legal review.
<!-- SECTION:FINAL_SUMMARY:END -->
