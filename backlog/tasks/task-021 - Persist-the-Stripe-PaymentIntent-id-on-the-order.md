---
id: TASK-021
title: Persist the Stripe PaymentIntent id on the order
status: To Do
assignee: []
created_date: '2026-08-03 01:12'
updated_date: '2026-08-03 01:12'
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
