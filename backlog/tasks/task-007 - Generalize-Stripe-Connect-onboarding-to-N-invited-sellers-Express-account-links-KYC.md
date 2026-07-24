---
id: TASK-007
title: >-
  Generalize Stripe Connect onboarding to N invited sellers (Express account
  links + KYC)
status: In Progress
assignee:
  - claude
created_date: '2026-07-22 22:31'
updated_date: '2026-07-24 04:57'
labels:
  - 'epic:connect-onboarding'
  - feature
milestone: m-1
dependencies:
  - TASK-002
priority: high
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 2 establishes a single hardcoded Connect onboarding for the anchor seller (The Pub Game Store). Phase 3 requires a reusable flow so any admin-invited, vetted seller can be onboarded onto Stripe Connect Express (which handles KYC and Mexican tax obligations), without opening the platform to self-registration. This depends on the Phase 2 anchor-seller Connect onboarding task (same account-link pattern, generalized) — do NOT start until that task's account-link/persistence pattern exists as a reference. Non-custodial constraint: every onboarded seller must end up on the same direct-charge + application_fee model, never a platform-side balance or separate charges & transfers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reusable server-side flow generates a Stripe Connect Express account + hosted onboarding link for any invited seller
- [ ] #2 Resulting stripe_connect_account_id persisted to that seller's row on completion
- [ ] #3 Onboarding-incomplete state handled gracefully (seller can resume, checkout for their inventory is blocked/hidden until complete)
- [ ] #4 KYC and Mexican tax obligations confirmed to be handled by Stripe Express, not custom platform logic
- [ ] #5 Non-custodial invariant (direct charge + application_fee_amount, same as anchor seller) preserved for every onboarded seller
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
