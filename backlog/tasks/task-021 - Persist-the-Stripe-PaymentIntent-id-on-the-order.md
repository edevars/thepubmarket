---
id: TASK-021
title: Persist the Stripe PaymentIntent id on the order
status: In Progress
assignee:
  - claude
created_date: '2026-08-03 01:12'
updated_date: '2026-08-06 06:45'
labels:
  - api
  - stripe
  - orders
  - payments
  - needs-verification
  - blocked
milestone: m-2
dependencies: []
references:
  - apps/api/src/routes/checkout.ts
  - apps/api/src/routes/webhooks.ts
  - apps/api/src/workflows/post-payment.ts
  - packages/db/src/schema.ts
documentation:
  - docs/ingenieria/entrega.md
priority: low
type: bug
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`orders.stripe_payment_intent_id` is NULL on every order in production, including ones whose PaymentIntents demonstrably exist in Stripe.

`checkout.ts` reads `session.payment_intent` immediately after creating the Checkout Session. In `mode: payment` Stripe does not create the PaymentIntent until the buyer starts paying, so that field is always null at creation time. Nothing backfills it afterwards: the `checkout.session.completed` webhook only starts the post-payment Workflow, and the Workflow only moves the order `pending → paid` and decrements inventory.

Why it matters:

- **Refunds and disputes.** Going from an order to its payment requires first fetching the stored Checkout Session from Stripe to read its `payment_intent`. Recoverable, so this is degraded rather than broken — but every refund path pays that round trip, and a dispute webhook arrives carrying a PaymentIntent id that matches no row.
- **The unique index is inert.** `idx_orders_stripe_payment_intent_id` is a unique index over a column that is NULL everywhere, and SQLite permits unlimited NULLs in a unique index. It provides none of the idempotency guarantee its name implies.

The id is already available where it is needed: `checkout.session.completed` carries `session.payment_intent`, and `payment_intent.payment_failed` already reads `pi.id` for logging.

Non-custodial invariant is untouched by this: it is a bookkeeping link, not a change to how money moves.

Found while verifying TASK-020 in production. Not caused by it — this has been true since checkout was first wired up.

Code, comments and docs in English.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A newly paid order has its PaymentIntent id persisted on the order row by the time the post-payment flow finishes
- [x] #2 The dead read of session.payment_intent at Checkout Session creation is removed or documented as always-null, so nobody reintroduces it
- [x] #3 Persisting the id is idempotent: a redelivered or duplicate webhook does not fail the request or overwrite the row with a different value
- [x] #4 An order that is never paid keeps a NULL PaymentIntent id rather than a placeholder
- [x] #5 The five existing production orders with NULL ids are either backfilled from their stored checkout sessions or explicitly left alone with the reason recorded
- [x] #6 docs/ingenieria/ states where the id comes from and why it cannot be read at session-creation time
- [ ] #7 Verified against the deployed API in Stripe test mode with one real payment: the order row carries the same PaymentIntent id Stripe reports
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

The id only exists once the buyer starts paying, so the only honest source is the
`checkout.session.completed` event. Persist it from the **durable** path, not from
the webhook handler: the webhook dedupes by `event.id` before doing any work, so a
write that fails there is swallowed on redelivery. The Workflow retries per step.

## Steps

1. **`lib/stripe.ts`** — add pure helper `paymentIntentIdFrom(session)` that
   normalizes `string | Stripe.PaymentIntent | null` to `string | null`. Unit-testable
   without a Workers runtime (the only kind of test this package runs).
2. **`routes/checkout.ts`** — drop the dead `session.payment_intent` read; persist only
   `stripe_checkout_session_id`. Leave a comment stating the field is always null at
   session-creation time in `mode: payment` and pointing at the webhook. (AC#2, AC#4:
   an unpaid order simply never gets the column written.)
3. **`routes/webhooks.ts`** — on `checkout.session.completed`, extract the id with the
   helper and pass it into the Workflow params.
4. **`workflows/post-payment.ts`** — `PostPaymentParams` gains optional
   `paymentIntentId`. New step `link-payment-intent` placed **after** `settle-order`:
   bookkeeping must never block the money path. The write is
   `UPDATE orders SET stripe_payment_intent_id = ?, updated_at = unixepoch()
    WHERE id = ? AND stripe_payment_intent_id IS NULL` — idempotent, never overwrites a
   different value (AC#3). Missing param → no-op + warn, so the column stays NULL
   rather than gaining a placeholder (AC#4). If the existing value differs, log it.
5. **Backfill (AC#5)** — 7 orders in prod, all with `stripe_payment_intent_id` NULL:
   4 `fulfilled` (paid, so a PaymentIntent exists) and 3 `cancelled` (session expired
   without payment → correctly NULL, leave alone and record why). Retrieve each of the
   4 sessions from Stripe **with `Stripe-Account`** (direct charges live in the
   seller's connected account), then a guarded `UPDATE ... WHERE
   stripe_payment_intent_id IS NULL` per row against `--remote`.
6. **Docs (AC#6)** — new `docs/ingenieria/pagos.md`: which Stripe id exists at which
   moment, where each is stored, why `payment_intent` is null at creation, and how to
   go from an order to its payment (and back, for disputes). Index row in
   `docs/ingenieria/README.md`.
7. **Verify (AC#7)** — deploy, pay one order end to end in Stripe test mode, then
   compare the persisted id against what Stripe reports for that session.

## Non-custodial check

Bookkeeping only: no change to who is charged, where the charge is created, or how the
application fee is computed. The platform still never touches the funds.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Code (AC#1–#4) — done.** `paymentIntentIdFrom()` added to `lib/stripe.ts` with unit tests covering the plain-id, expanded-object and null cases. `checkout.ts` no longer reads `session.payment_intent`; it writes only the session id and carries a comment naming TASK-021 so the read is not reintroduced. `webhooks.ts` extracts the id on `checkout.session.completed` and passes it into the Workflow (warns when the event carries none). `post-payment.ts` gained step `link-payment-intent`, placed after `settle-order` so a bookkeeping failure can never block settlement; the write is guarded with `AND stripe_payment_intent_id IS NULL` and logs an `error` if a different id arrives for an order that already has one. Typecheck, biome and the 71 lib tests pass.

**Backfill (AC#5) — done, and the count in the description was off: there were 7 orders in prod, not 5.** Every one had a NULL id. Retrieved each Checkout Session from Stripe with `--stripe-account acct_1TwA3pKpkJIW4eIn` (direct charges live in the seller's account; without the flag Stripe answers `resource_missing`, which reads as 'does not exist' when it means 'not mine'):

| Order | Session status | Action |
|---|---|---|
| 8f60e606 | complete / paid | `pi_3U07dzKpkJIW4eIn0swzP1KX` |
| 80bcdf12 | complete / paid | `pi_3U07cvKpkJIW4eIn10fcpOz9` |
| ae466740 | complete / paid | `pi_3TylczKpkJIW4eIn0zTEaf5C` |
| 5f943f0e | complete / paid | `pi_3TwDwVKpkJIW4eIn0xcJyxL1` |
| 24374651, cfeaaf10, f5fb98a8 | expired / unpaid | **left NULL on purpose** — no PaymentIntent ever existed |

Applied to `--remote` with four `UPDATE ... WHERE id = ? AND stripe_payment_intent_id IS NULL`, one row changed each. Re-read confirms the four paid orders carry their id and the three cancelled ones stay NULL.

**Docs (AC#6) — done.** New `docs/ingenieria/pagos.md`: the three Stripe objects and when each exists, why `payment_intent` is always null at session creation, why the write lives in the Workflow rather than the webhook handler, order↔payment lookups (both directions, for disputes), why the unique index was inert and is not anymore, the backfill record, and a diagnosis table. Indexed in `docs/ingenieria/README.md` (added the missing `entrega.md` row while there).

**Committed** on branch `fix/task-021-022-payments-reliability` as `c73e599` (TASK-021 only; TASK-022 is a separate commit on the same branch). The commit carries the pre-TASK-022 shape of `webhooks.ts` — the PaymentIntent extraction on top of the old dedupe handler — so each commit stands on its own: typecheck, biome and the 71 tests pass at `c73e599`. AC#1–#6 checked; AC#7 still needs the prod deploy plus one test payment.

**Deployed 2026-08-05** as part of the shared rollout (version `1a8dacbe-ece7-4d5b-86dc-3be3325ad7a7`, see TASK-022 for the migration/deploy record). AC#7 is the only thing left and it needs a human: a hosted Checkout Session can only be completed by entering a test card on Stripe's page, so it cannot be driven from here.

**Downgraded to Low + `needs-verification` (2026-08-05).** The code is merged to `main` and deployed; nothing is left to build. The only open item is AC#7, a verification that happens on its own the next time anyone pays a test order — no separate work needed, just someone to check the row afterwards.

To close it: after any test-mode payment, `SELECT id, status, stripe_payment_intent_id FROM orders WHERE id='<orderId>'` against `--remote` must return the same `pi_…` Stripe reports for that session (retrieve it with `--stripe-account`, the charge lives in the seller's account).

**Labeled `blocked` by dispatch-loop (2026-08-06).** Only AC#7 remains and it needs a human test-mode payment through the hosted Checkout page (cannot be driven headless). Code is merged and deployed. After any test payment, compare orders.stripe_payment_intent_id against Stripe's pi_… for that session and mark Done.
<!-- SECTION:NOTES:END -->
