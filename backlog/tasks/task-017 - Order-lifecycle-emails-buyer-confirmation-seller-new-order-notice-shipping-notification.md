---
id: TASK-017
title: >-
  Order lifecycle emails: buyer confirmation, seller new-order notice, shipping
  notification
status: To Do
assignee: []
created_date: '2026-07-29 01:59'
labels:
  - 'epic:transactional-email'
  - api
  - orders
milestone: m-2
dependencies:
  - TASK-016
references:
  - apps/api/src/workflows/post-payment.ts
  - apps/api/src/routes/webhooks.ts
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/routes/orders.ts
documentation:
  - docs/ingenieria/estado-actual.md
  - docs/ingenieria/validacion-e2e-task-005.md
priority: medium
type: feature
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today a completed purchase is silent: the buyer only learns the order exists by visiting /compras, and the seller only by opening /panel. Nobody is told when an order is paid or shipped. For a marketplace whose sellers are physical stores fulfilling by hand, that gap is what makes orders get missed.

Wire the three emails that carry the order through its life:
- buyer receives a purchase confirmation once payment is confirmed,
- the selling store is notified there is a new paid order to fulfill,
- buyer is notified when the seller marks the order shipped, including the tracking number.

Depends on TASK-016, which provides the authenticated sender domain and the shared sending helper this task consumes. Do not add a second path to the email provider.

Constraints:
- Confirmation and seller notice must be triggered from the durable post-payment path so they inherit its retries and idempotency: an order must not produce duplicate emails when a webhook is redelivered or the workflow retries.
- An email send failure must never fail or roll back the order: the order is the source of truth, the email is best-effort.
- Emails carry no commission or application-fee figures to the buyer, and no platform-level financial data to the seller beyond what the seller portal already shows. Nothing in these emails may imply the platform holds funds.
- User-facing email copy in Spanish; code, comments and docs in English.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Buyer receives a confirmation email after a successful payment containing order reference, items with condition/set, total paid, and the selling store
- [ ] #2 Selling store receives a notification of the new paid order with what to pull from stock and the buyer's shipping details, and a pointer to the seller panel
- [ ] #3 Buyer receives a shipping email when the seller marks the order shipped, including the tracking number and carrier as entered in the panel
- [ ] #4 A redelivered webhook or a retried post-payment workflow run does not send duplicate confirmation or seller-notice emails for the same order, verified by replaying the event
- [ ] #5 An email provider failure leaves the order fully processed: inventory decremented, order state correct, failure logged, and no error surfaced to the buyer or seller
- [ ] #6 Buyer-facing emails contain no application fee, commission, or platform balance information
- [ ] #7 Emails render correctly in at least one major web client and remain readable as plain text
- [ ] #8 Verified end to end in Stripe test mode against the deployed API: pay an order, confirm both emails arrive, mark it shipped from /panel, confirm the shipping email arrives
- [ ] #9 docs/ingenieria/ documents which events send which email, to whom, and where to look when one does not arrive
<!-- AC:END -->
