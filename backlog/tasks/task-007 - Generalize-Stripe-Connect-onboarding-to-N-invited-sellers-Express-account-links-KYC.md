---
id: TASK-007
title: >-
  Generalize Stripe Connect onboarding to N invited sellers (Express account
  links + KYC)
status: Done
assignee:
  - claude
created_date: '2026-07-22 22:31'
updated_date: '2026-07-24 05:16'
labels:
  - 'epic:connect-onboarding'
  - feature
milestone: m-1
dependencies:
  - TASK-002
modified_files:
  - apps/api/src/middleware/seller-connect-auth.ts
  - apps/api/src/routes/seller-connect.ts
  - apps/api/src/index.ts
  - apps/api/src/routes/webhooks.ts
  - packages/shared/src/index.ts
priority: high
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 2 establishes a single hardcoded Connect onboarding for the anchor seller (The Pub Game Store). Phase 3 requires a reusable flow so any admin-invited, vetted seller can be onboarded onto Stripe Connect Express (which handles KYC and Mexican tax obligations), without opening the platform to self-registration. This depends on the Phase 2 anchor-seller Connect onboarding task (same account-link pattern, generalized) — do NOT start until that task's account-link/persistence pattern exists as a reference. Non-custodial constraint: every onboarded seller must end up on the same direct-charge + application_fee model, never a platform-side balance or separate charges & transfers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reusable server-side flow generates a Stripe Connect Express account + hosted onboarding link for any invited seller
- [x] #2 Resulting stripe_connect_account_id persisted to that seller's row on completion
- [x] #3 Onboarding-incomplete state handled gracefully (seller can resume, checkout for their inventory is blocked/hidden until complete)
- [x] #4 KYC and Mexican tax obligations confirmed to be handled by Stripe Express, not custom platform logic
- [x] #5 Non-custodial invariant (direct charge + application_fee_amount, same as anchor seller) preserved for every onboarded seller
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Backend-only scope (AC talks about "server-side flow"; panel UI for invited sellers is a follow-up, not blocking these AC).

Current state found in code:
- `sellers.status` enum already `invited|active|suspended` (default invited), `stripeConnectAccountId` nullable+unique (packages/db/src/schema.ts).
- `sellerAuth` middleware (apps/api/src/middleware/seller-auth.ts) only allows `status = 'active'` — an invited seller gets 403 on all `/seller/*` routes today, so there's no way for them to reach a self-service onboarding endpoint yet.
- `checkout.ts` already blocks checkout when `seller.stripeConnectAccountId` is null (`seller_not_payable`), and public `sellersRoutes`/`catalog` only ever surface `status='active'` sellers/their stock — so an incomplete seller is already invisible/unpayable by construction (AC#3 mostly falls out of existing code).
- `webhooks.ts` already runs on the Connect-scoped endpoint (per TASK-003 notes: `we_1TwBD2Kp...`, connect=true) but is only subscribed to checkout/payment_intent events — no `account.updated` yet.
- Anchor seller onboarding (TASK-002) was done manually via Stripe Dashboard, not through app code — no existing account-creation/account-link code to reuse; this task builds it fresh.

Plan:
1. New middleware `apps/api/src/middleware/seller-connect-auth.ts`: same session resolution as `sellerAuth`, but allows `status IN ('invited','active')` (excludes `suspended`). Sets `user`/`seller` on context.
2. New router `apps/api/src/routes/seller-connect.ts`, mounted at `/seller/connect` behind the new middleware:
   - `POST /onboarding-link`: if `seller.stripeConnectAccountId` is null, create a Stripe Express account (`accounts.create`, country `MX`, email = session user's email) and persist the id immediately (so it's never lost even if the seller abandons onboarding). Then always create a fresh `accountLinks.create` (`type: account_onboarding`, refresh_url/return_url under `WEB_BASE_URL`) and return `{ url }` — safe to call repeatedly, which is how "resume" works (Stripe account links expire quickly).
   - `GET /status`: retrieve the live account from Stripe and return `{ status, chargesEnabled, detailsSubmitted }` for a future panel page to render.
3. `webhooks.ts`: add `case 'account.updated'` — look up the seller by `stripeConnectAccountId`, and if `charges_enabled && details_submitted` flip `status: 'invited' -> 'active'`. This is the authoritative completion signal (return_url redirect is just UX, not trusted).
4. Ops: add `account.updated` to the existing Connect webhook endpoint's subscribed events in Stripe (dashboard or API) — required for step 3 to fire.
5. Confirm with compliance lens: Express account, direct charge model unchanged, only capabilities required for a *direct* charge + application_fee are requested (verify exact capability set against Stripe docs — no `transfers` capability request unless actually needed for direct charges, to avoid overprovisioning). No transfers.create, no platform balance touched anywhere in this flow.
6. Verify via curl against local `wrangler dev` + `stripe listen` (no browser testing per standing preference): create a second test seller row (status invited, no stripeConnectAccountId), hit `/seller/connect/onboarding-link`, complete Express test onboarding, confirm `account.updated` flips status to active and checkout unblocks for that seller's inventory.

Out of scope (follow-ups): panel UI button for onboarding (natural fit for TASK-008), formal admin "create new seller row + invite" flow (TASK-010).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementación (2026-07-23/24)

Archivos nuevos:
- apps/api/src/middleware/seller-connect-auth.ts — sellerConnectAuth (permite status invited|active, excluye suspended).
- apps/api/src/routes/seller-connect.ts — POST /seller/connect/onboarding-link, GET /seller/connect/status.

Archivos modificados:
- apps/api/src/index.ts — monta sellerConnectAuth + sellerConnect en /seller/connect/* ANTES del sellerAuth general de /seller/*, para que las rutas de connect no queden bloqueadas por el status='active' que exige sellerAuth.
- apps/api/src/routes/webhooks.ts — nuevo case 'account.updated': flip invited->active cuando charges_enabled && details_submitted. No reactiva 'suspended'. Import `sellers`, `and`.
- packages/shared/src/index.ts — nuevos tipos ConnectOnboardingLinkResponse, ConnectStatusResponse.

## HALLAZGO DE COMPLIANCE — requiere sign-off antes de sellers reales

Al crear la cuenta con `controller.stripe_dashboard.type = 'express'`, Stripe API RECHAZA cualquier combinación de fees.payer/losses.payments que no sea 'application'/'application':

  "When `stripe_dashboard[type]=express`, your platform must collect fees and
  be liable for negative balances or refunds and chargebacks."

Verificado en vivo contra la API (no es interpretación de docs). Esto significa que TODO seller Express queda con:
  - fees.payer = 'application' → la plataforma paga las fees de Stripe del direct charge (no el seller).
  - losses.payments = 'application' → si la cuenta del seller no puede cubrir un saldo negativo (reembolso post-payout, contracargo), Stripe lo cobra del balance de LA PLATAFORMA, no del seller.

Esto NO rompe la no-custodia de fondos del comprador (el direct charge sigue liquidando 100% en la cuenta del seller; sin transfers; sin balance de plataforma en el flujo de pago). PERO sí es una exposición financiera real de la plataforma a nivel de disputas/contracargos que el texto de la política de "Disputes" (dispute liability sits with the seller) no contemplaba — es un hard constraint del producto Express de Stripe, no una elección de este código.

Comparé contra la cuenta ancla (acct_1TwA3pKpkJIW4eIn, TASK-002, onboarded manual vía Dashboard): esa cuenta terminó siendo Standard-equivalente (`stripe_dashboard.type: 'full'`, `fees.payer: 'account'`, `losses.payments: 'stripe'`) — CERO exposición de la plataforma. O sea, el ancla y los nuevos sellers de este task NO están en el mismo modelo de riesgo. Alternativas a decidir:
  (a) Aceptar la exposición de Express (comportamiento estándar/esperado del producto; mitigado por el modelo de sellers vetted por invitación) — requiere sign-off.
  (b) Cambiar el flujo a stripe_dashboard.type='full' (Standard-equivalente, igual que el ancla) para exposición cero — pierde el Dashboard de autoservicio "Express" que pedía el plan; UX ligeramente distinta pero funcionalmente equivalente (Account Link + KYC por Stripe igual).

No tomé esta decisión unilateralmente — dejé el código en (a) porque es literalmente lo que pide el AC#1/título del task ("Express account links"), pero está señalado en comentarios de código y aquí para revisión de compliance-auditor antes de onboardear sellers reales (no de prueba).

## Capabilities solicitadas en accounts.create

`card_payments` + `transfers` (ambas, `requested: true`). Verificado en docs.stripe.com/connect/account-capabilities: "Para que una Account pueda tener la funcionalidad card_payments, debes solicitar card_payments Y transfers" — es un par acoplado en la API, no dos capabilities independientes. NO se solicitó ninguna otra capability (ni métodos de pago alternativos, ni tax_reporting, etc.) — mínimo necesario para direct charge + application_fee en MXN/MX. El código NUNCA llama `stripe.transfers.create` en ningún punto (grep confirma cero usos); la capability `transfers` es solo el prerequisito técnico de card_payments, no se usa para mover fondos.

## Verificación manual (sin browser)

wrangler dev + stripe listen contra Stripe test mode:
- POST /seller/connect/onboarding-link: creó cuenta Express real en Stripe (MX, controller verificado con curl contra /v1/accounts/{id}), persistió stripe_connect_account_id EN LA MISMA request (antes de que el seller complete nada), devolvió Account Link válido (https://connect.stripe.com/setup/e/...). Llamado 2 veces: mismo account id ambas veces (no duplica cuentas), URL de link distinta cada vez (fresca).
- GET /seller/connect/status: refleja en vivo charges_enabled/details_submitted desde Stripe (false antes de onboarding).
- sellerConnectAuth: confirmado que permite 'invited' (que sellerAuth rechazaría con 403) y rechaza 'suspended' con 403 not_a_seller, en ambos endpoints.
- Webhook account.updated: NO pude completar el onboarding hospedado real (browser-only — Stripe rechaza rellenar KYC vía API cuando requirement_collection='stripe': "This application does not have the required permissions for the parameters 'business_type','individual','tos_acceptance'", confirmado con curl). Verifiqué el pipe completo en dos niveles:
  1. `stripe trigger account.updated` (evento real firmado por Stripe, forwarded via `stripe listen`) → 200 OK, sin errores (cuenta sintética del fixture, sin seller asociado localmente → warning log, comportamiento esperado).
  2. Evento account.updated auto-firmado (mismo algoritmo HMAC que usa Stripe, timestamp+payload con STRIPE_WEBHOOK_SECRET) apuntando al account_id real de mi seller de prueba con charges_enabled=details_submitted=true → sellers.status pasó de 'invited' a 'active' en D1; reenviar el MISMO event id devolvió {"duplicate":true} sin reprocesar; un account.updated equivalente contra un seller 'suspended' NO lo reactivó (guard `eq(sellers.status,'invited')` funcionó).
- AC#3 (onboarding-incomplete invisible/unpayable): confirmé por lectura de código que sellers.ts/catalog.ts ya filtran status='active' — no re-probé E2E porque no requería cambios aquí.
- Endpoint de webhook existente (we_1TwBD2KpkJAI3F8VdvRptxjn, el mismo referenciado en notas de TASK-003) actualizado con `enabled_events` para incluir `account.updated`, vía API directa con la STRIPE_SECRET_KEY de test — NO se creó un endpoint duplicado.
- pnpm typecheck (root, turbo) y pnpm lint (biome) verdes en los 5 paquetes tras los cambios.
- Test data (sellers/users/webhook_events sintéticos, cuenta Stripe de prueba) limpiada al terminar.

No pude verificar con un usuario que complete el formulario hospedado real de Stripe (Account Link) porque eso requiere navegador — está fuera del harness disponible (preferencia explícita de no manejar browser). El resto del flujo (creación de cuenta, persistencia, link fresco, status live, webhook idempotente, flip de status, guard de suspended) sí quedó verificado end-to-end.

User sign-off (2026-07-24): keep Express as implemented for now (test mode only); revisit the platform fee/chargeback-liability exposure before onboarding real (non-test) sellers. Documented as a required item under section 1 of docs/ingenieria/checklist-go-live-real.md, alongside updating that doc's webhook event list from 3 to 4 events (account.updated added).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built a reusable, self-service Stripe Connect Express onboarding flow so any admin-invited seller (not just the hardcoded anchor from Phase 2) can create/resume their own Connect account.

**New:** `middleware/seller-connect-auth.ts` (allows `sellers.status IN ('invited','active')`, unlike `sellerAuth` which requires `active`) and `routes/seller-connect.ts` mounted at `/seller/connect`:
- `POST /onboarding-link` — idempotently creates a Stripe Express account (`controller.stripe_dashboard.type: 'express'`, `requirement_collection: 'stripe'`, `card_payments`+`transfers` capabilities — the minimal coupled pair Stripe requires) on first call, persists `stripe_connect_account_id` immediately (before onboarding completes), and always returns a fresh Account Link — safe to call repeatedly, which is how a seller resumes.
- `GET /status` — live `charges_enabled`/`details_submitted` from Stripe for a future panel UI.

**Modified:** `webhooks.ts` gained `case 'account.updated'` — the authoritative signal (not the `return_url` redirect) that flips `sellers.status` `invited → active` once `charges_enabled && details_submitted`; guarded to never touch `active` (idempotent) or `suspended` (admin-suspended) rows. The existing Connect webhook endpoint from TASK-003 was updated (not duplicated) to subscribe to this new event. `index.ts` mounts the new router/middleware ahead of the general `/seller/*` mount so invited sellers aren't blocked by `sellerAuth`. `checkout.ts` / `lib/stripe.ts` (direct charge + application_fee) were untouched.

**Compliance finding, resolved by user decision (2026-07-24):** Stripe's API hard-requires `fees.payer`/`losses.payments = 'application'` for any Express-dashboard-type account — the platform absorbs Stripe fees and chargeback/negative-balance risk for every Express seller (does NOT touch buyer-fund custody: direct charge still settles 100% to the seller, no transfers, no platform balance in the payment path). This differs from the anchor seller (TASK-002), which ended up Standard-equivalent with zero platform exposure. User decided: keep Express as implemented (matches this task's AC), since everything is still Stripe test mode; added as an explicit required sign-off in `docs/ingenieria/checklist-go-live-real.md` before onboarding real sellers.

**Verified (no browser, per standing preference):** live `curl` against Stripe test API confirms real account creation, idempotent reuse, fresh links, live status; `sellerConnectAuth` allows invited/blocks suspended; `account.updated` webhook verified via `stripe trigger` + a manually HMAC-signed synthetic event — confirmed `invited→active` flip, idempotent replay (`duplicate: true`), and suspended sellers are not reactivated. `pnpm typecheck`/`pnpm lint` clean across all packages. Could not click through Stripe's actual hosted onboarding form (requires a browser; Stripe rejects programmatic KYC field writes when `requirement_collection: 'stripe'`) — everything else in the pipe was verified end-to-end.

**Follow-ups (not created as tasks — flagging for user):** panel UI for the onboarding button/status (natural fit alongside TASK-008), and the Standard-vs-Express go-live decision tracked in the checklist doc.
<!-- SECTION:FINAL_SUMMARY:END -->
