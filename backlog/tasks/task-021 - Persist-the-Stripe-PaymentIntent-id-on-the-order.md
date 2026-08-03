---
id: TASK-021
title: Persist the Stripe PaymentIntent id on the order
status: In Progress
assignee:
  - claude
created_date: '2026-08-03 01:12'
updated_date: '2026-08-03 01:18'
labels:
  - api
  - stripe
  - orders
  - payments
milestone: m-2
dependencies: []
references:
  - apps/api/src/routes/checkout.ts
  - apps/api/src/routes/webhooks.ts
  - apps/api/src/workflows/post-payment.ts
  - packages/db/src/schema.ts
documentation:
  - docs/ingenieria/entrega.md
priority: medium
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
- [ ] #1 A newly paid order has its PaymentIntent id persisted on the order row by the time the post-payment flow finishes
- [ ] #2 The dead read of session.payment_intent at Checkout Session creation is removed or documented as always-null, so nobody reintroduces it
- [ ] #3 Persisting the id is idempotent: a redelivered or duplicate webhook does not fail the request or overwrite the row with a different value
- [ ] #4 An order that is never paid keeps a NULL PaymentIntent id rather than a placeholder
- [ ] #5 The five existing production orders with NULL ids are either backfilled from their stored checkout sessions or explicitly left alone with the reason recorded
- [ ] #6 docs/ingenieria/ states where the id comes from and why it cannot be read at session-creation time
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
