---
id: TASK-008
title: Show read-only seller payout status/history in the seller portal (/panel)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-22 22:32'
updated_date: '2026-07-25 00:14'
labels:
  - 'epic:connect-onboarding'
  - feature
milestone: m-1
dependencies:
  - TASK-007
priority: medium
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sellers using the self-service portal at /panel (apps/web/src/app/[locale]/panel/) currently have no visibility into their Stripe payouts. Since the platform never custodies funds, this must be a read-only view sourced live from Stripe (via the seller's Connect account), never a balance stored or computed on the platform side. Depends on generalized Connect onboarding existing so any seller (not just the anchor) has a real connect_account_id to query.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Seller portal /panel shows payout status and recent payout history for the logged-in seller
- [x] #2 Data is read directly from Stripe (via the seller's Connect account), not stored/aggregated as a platform-side balance
- [x] #3 Platform never holds, redirects, or has authority to move the seller's funds — this view is observational only
- [x] #4 Gracefully handles sellers still mid-onboarding (no connect_account_id yet)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Research findings:
- TASK-007 already built `apps/api/src/routes/seller-connect.ts` (POST /seller/connect/onboarding-link, GET /seller/connect/status returning {status, chargesEnabled, detailsSubmitted}) behind `sellerConnectAuth` (allows invited|active). No frontend code consumes any of this yet — no client-api functions, no panel page, no nav item. The onboarding Account Link's refresh_url/return_url point at /panel/connect/refresh and /panel/connect/return, which don't exist yet either.
- Panel pattern: PanelShell (nav+guard) / PanelProvider (shared inventory+orders state) / per-view components that either read PanelProvider or self-fetch (e.g. AddCardFlow does its own Scryfall fetches). A payments view is independent of inventory/orders, so it will self-fetch rather than extend PanelProvider.
- Stripe account object exposes `payouts_enabled`; `stripe.payouts.list(..., {stripeAccount})` gives real payout history (id, amount, currency, status, arrival_date, created) — all read-only, no transfers/balance mutation anywhere.

Plan:
1. packages/shared/src/index.ts: add `payoutsEnabled: boolean | null` to ConnectStatusResponse; add `ConnectPayout` {id, amountCents, currency, status, arrivalDate, createdAt} and `ConnectPayoutsResponse { items: ConnectPayout[] }`.
2. apps/api/src/routes/seller-connect.ts:
   - GET /status: include `payoutsEnabled: account.payouts_enabled` (null branch when no account yet).
   - New GET /payouts: no `stripeConnectAccountId` → `{ items: [] }`; else `stripe.payouts.list({ limit: 20 }, { stripeAccount: accountId })` mapped to ConnectPayout. Purely read-only Stripe calls, no writes.
3. apps/web/src/lib/client-api.ts: add fetchConnectStatus(token), fetchConnectPayouts(token), requestOnboardingLink(token) (POST, returns url|null).
4. New apps/web/src/components/panel/PagosView.tsx: self-fetches status+payouts on mount.
   - No account yet / onboarding incomplete: onboarding-status card + CTA button that calls requestOnboardingLink and redirects (AC#4).
   - Onboarded: status badges (charges/payouts enabled) + table of recent payouts (amount, arrival date, status), empty state if no payouts yet.
5. New page apps/web/src/app/[locale]/panel/pagos/page.tsx rendering PagosView.
6. Two thin redirect pages apps/web/src/app/[locale]/panel/connect/return/page.tsx and .../refresh/page.tsx — both just router.replace('/panel/pagos') client-side, so the Account Link's return_url/refresh_url resolve to something instead of 404 (closes a gap the onboarding-link flow already depends on).
7. PanelShell.tsx: add "Pagos" nav item + PanelTopbar eyebrow/title case.
8. messages/es.json + en.json: add panel.navPagos/titlePagos/eyebrowPagos and PagosView copy strings (site is bilingual, matches existing full es/en parity for every other panel string).
9. Verify: pnpm typecheck + pnpm lint across workspaces; curl GET /seller/connect/payouts and /status against local wrangler dev with a seeded test seller (no browser testing per standing preference).

Out of scope: onboarding button/CTA on other panel pages, changing sellerAuth to require active for /panel/pagos itself (page will handle invited-status sellers gracefully per AC#4 using the existing sellerConnectAuth-gated /seller/connect/* endpoints — panel's own /seller/me still needs active status per existing sellerAuth gate on the rest of /seller/*, which is pre-existing behavior not touched by this task).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified against local wrangler dev + local D1 with a real registered test user linked to a test seller row:
- GET /seller/connect/status and /payouts on a seller with no stripeConnectAccountId → {status:'invited', chargesEnabled:null, detailsSubmitted:null, payoutsEnabled:null} and {items:[]} — confirms AC#4 (graceful mid-onboarding state), not just a code-path assumption.
- Called POST /seller/connect/onboarding-link to create a REAL Stripe test Express account, then re-hit /status and /payouts against that live account: chargesEnabled/detailsSubmitted/payoutsEnabled all came back `false` (not null) and payouts.list round-tripped to Stripe returning {items:[]} without error — confirms the live-Stripe-read (AC#2) actually works, not just typechecks.
- Test seller row reverted to original state (user_id/status/stripe_connect_account_id) and the synthetic Stripe test account deleted via the Accounts API afterward; test user row deleted. No leftover state.
- pnpm typecheck (5 packages) and pnpm lint (biome) clean.
- No browser pass — the onboarding CTA's actual redirect-to-Stripe-hosted-form and the return/refresh pages' client-side redirect were not clicked through in a browser, per standing preference. Verified via reading the component logic and confirming the underlying API calls work.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built the read-only "Pagos" (Payments) view in the seller panel, showing live Stripe Connect onboarding/payout status and payout history — nothing is stored or aggregated platform-side.

**Shared types** (`packages/shared/src/index.ts`): `ConnectStatusResponse` gains `payoutsEnabled`; new `ConnectPayout`/`ConnectPayoutsResponse`.

**API** (`apps/api/src/routes/seller-connect.ts`):
- `GET /status` now also returns `payoutsEnabled` (from `account.payouts_enabled`).
- New `GET /payouts` — no account yet → `{items: []}`; otherwise `stripe.payouts.list(..., {stripeAccount})` mapped to `ConnectPayout[]`. Purely read-only Stripe calls; no transfers, no balance mutation, no platform-side storage of amounts.

**Frontend:**
- `apps/web/src/lib/client-api.ts`: `fetchConnectStatus`, `fetchConnectPayouts`, `requestOnboardingLink`.
- New `PagosView.tsx`: onboarding-pending banner + CTA (calls the existing onboarding-link endpoint and redirects) when charges/details aren't both confirmed; status badges (charges/details/payouts); payout history list with amount/date/status; footnote reiterating the non-custodial model.
- New `/panel/pagos` page + nav item; new thin `/panel/connect/return` and `/panel/connect/refresh` pages so the Account Link's `return_url`/`refresh_url` (already referenced by the TASK-007 onboarding endpoint) resolve to something instead of 404ing, closing a gap the existing onboarding flow already depended on.
- `panel.status.ts` gains `PAYOUT_STATUS_HEX`/`payoutStatusKey` mirroring the existing order-status pattern.
- Full es/en string parity added (site is bilingual via next-intl).

**Tests:** `pnpm typecheck` (5 packages) and `pnpm lint` (biome) clean. Manually verified both new/extended endpoints against local `wrangler dev` + local D1 with a real registered test user/seller and a real (then-deleted) Stripe test Express account — confirmed both the "no account yet" branch and the live-Stripe-read branch return correct, non-null data. No browser click-through per standing no-browser-testing preference.

**Non-custodial compliance:** no code path here creates payouts, transfers, or reads/writes a platform-side balance — every value shown is a live, unmodified read from the seller's own Connect account.
<!-- SECTION:FINAL_SUMMARY:END -->
