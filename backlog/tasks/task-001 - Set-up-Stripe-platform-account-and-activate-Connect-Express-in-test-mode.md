---
id: TASK-001
title: Set up Stripe platform account and activate Connect (Express) in test mode
status: Done
assignee: []
created_date: '2026-07-22 22:31'
updated_date: '2026-07-22 23:44'
labels:
  - 'epic:stripe-platform'
  - ops
milestone: m-0
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Pub Market needs a Stripe platform account with Connect enabled before any seller can onboard or any real checkout can run. This is the first step to closing Phase 2 (currently code-complete but blocked on live Stripe config — see docs/ingenieria/handoff.md). Non-custodial constraint: funds must never land in a platform-controlled balance; this account setup is purely the container for direct/destination charges with application_fee, not a money-holding account.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Stripe platform account created (test mode)
- [x] #2 Stripe Connect activated with Express account type enabled
- [x] #3 Platform branding and application fee configuration recorded for reference
- [x] #4 No live/production Stripe keys used at this stage — test mode only
- [x] #5 Setup steps and account details documented in docs/ingenieria/ for handoff
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cuenta de plataforma Stripe creada en modo test; Connect activado tipo Express; branding configurado en el dashboard (confirmado por el usuario). Fee de plataforma fijado en 10% via PLATFORM_FEE_BPS=1000 en apps/api/wrangler.jsonc (antes 800/8%). Documentado en docs/ingenieria/estado-actual.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cuenta de plataforma Stripe creada y Connect (Express) activado en modo test. Branding configurado en el dashboard. Comisión de la plataforma fijada en 10% (`PLATFORM_FEE_BPS=1000` en `apps/api/wrangler.jsonc`), consumida vía `application_fee_amount` sobre direct charges en `checkout.ts`/`lib/stripe.ts` — sin custodia de fondos. Estado registrado en `docs/ingenieria/estado-actual.md` para handoff. No se generaron ni usaron claves live; solo test keys (`pk_test_`/`sk_test_`), guardadas por el usuario fuera del repo — su configuración en el código queda para TASK-003.\n\nSiguiente paso natural: TASK-002 (onboarding del seller ancla y poblar `sellers.stripe_connect_account_id`).
<!-- SECTION:FINAL_SUMMARY:END -->
