---
id: TASK-017
title: >-
  Order lifecycle emails: buyer confirmation, seller new-order notice, shipping
  notification
status: In Progress
assignee:
  - Claude
created_date: '2026-07-29 01:59'
updated_date: '2026-08-06 03:52'
labels:
  - 'epic:transactional-email'
  - api
  - orders
milestone: m-2
dependencies:
  - TASK-016
  - TASK-019
  - TASK-020
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
- [x] #1 Buyer receives a confirmation email after a successful payment containing order reference, items with condition/set, total paid, the selling store, and how the order will arrive (shipping address or pickup store)
- [x] #2 Selling store receives a notification of the new paid order with what to pull from stock, the delivery method with its address or destination store, and a pointer to the seller panel
- [x] #3 Buyer receives a shipping email when a shipping order is marked shipped, including the tracking number and carrier as entered in the panel
- [x] #4 Buyer receives a ready-for-pickup email when a pickup order is marked ready, naming the store, its address and hours
- [x] #5 A redelivered webhook or a retried post-payment workflow run does not send duplicate confirmation or seller-notice emails for the same order, verified by replaying the event
- [x] #6 An email provider failure leaves the order fully processed: inventory decremented, order state correct, failure logged, and no error surfaced to the buyer or seller
- [x] #7 Buyer-facing emails contain no application fee, commission, or platform balance information
- [ ] #8 Emails render correctly in at least one major web client and remain readable as plain text
- [ ] #9 Verified end to end in Stripe test mode against the deployed API: pay a shipping order and a pickup order, confirm both confirmation and seller-notice emails arrive, then drive each to shipped / ready from /panel and confirm the buyer email arrives
- [x] #10 docs/ingenieria/ documents which events send which email, to whom, and where to look when one does not arrive
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Four Spanish templates as pure functions, one loader that assembles an order's email data, and two trigger points that already give idempotency for free.

**Idempotency without new machinery.** Confirmation + seller notice run as two separate `step.do` calls in the post-payment Workflow: Workflows checkpoint completed steps, the instance id is the orderId, and the webhook layer is at-least-once with its own ledger (TASK-022). Shipped / ready ride the existing guarded UPDATEs in the panel (`isNull(shippedAt)`, `readyAt IS NULL`), which already return 409 on a second call — so a second send is impossible without inventing a flag.

**Never fail an order for an email.** `sendEmail` already never throws; the order-email helpers additionally catch their own data-loading errors and log. A notify step that cannot throw cannot retry, which is also what keeps AC#5 true.

## Steps

1. **`apps/api/src/lib/email-templates.ts`** — four templates reusing the existing `layout()`: buyer confirmation, seller new-order notice, shipped, ready-for-pickup. Buyer-facing copy carries subtotal / shipping / total only — never `platformFeeCents`, never anything implying the platform holds funds (AC#7). Seller notice shows what to pull from stock, the delivery destination and a link to `/panel`.
2. **`apps/api/src/lib/order-emails.ts`** (new) — loads order + items (joined to inventory for set/condition) + buyer email + seller + pickup store, then sends via the single `sendEmail` path. Exposes `sendOrderConfirmation`, `sendSellerNewOrderNotice`, `sendOrderShipped`, `sendOrderReady`. Every one returns void and never throws. A seller with no linked user (`sellers.user_id IS NULL`) logs and skips rather than erroring.
3. **`apps/api/src/workflows/post-payment.ts`** — replace the `notify` stub with `notify-buyer` and `notify-seller` steps (separate so one failing never resends the other).
4. **`apps/api/src/routes/seller-panel.ts`** — after a successful `/ship` and `/ready`, fire the buyer email through `executionCtx.waitUntil` so the panel response is not blocked on the provider.
5. **Tests** — template purity tests: buyer emails contain no fee/commission wording (AC#7), both `html` and `text` are always produced (AC#8's plain-text half), shipping vs pickup render their own delivery block, carrier omitted when absent, and HTML escaping of user-supplied values (recipient name, store address).
6. **`docs/ingenieria/email.md`** — a section mapping event → email → recipient → trigger point, plus where to look when one does not arrive (`EMAIL_MODE`, the `[email]` log lines, the webhook ledger).
7. **Validate** — suites, typecheck, lint, and a local run with `EMAIL_MODE` in log mode to read the four rendered messages end to end.

## What I cannot close alone
- **AC#8** (renders in a real web client) and **AC#9** (emails actually arrive in an inbox, test-mode payment against the deployed API) need the user's own mailbox and eyes. I will prepare everything and hand back exact steps; these two stay unchecked until confirmed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Idempotency reuses what already existed instead of adding a sent-flag column: the two paid-order emails run as separate `step.do` calls in the post-payment Workflow (Workflows checkpoints completed steps; instance id = orderId; the webhook ledger from TASK-022 sits in front), and shipped/ready ride the guarded UPDATEs in the panel (`shipped_at IS NULL` / `ready_at IS NULL`) that already answer 409 on a second call. Two separate steps rather than one so a retry of the buyer send can never resend the seller notice. Because the order-email helpers never throw, a notify step cannot fail, so it cannot retry, so it cannot duplicate.

Live verification against wrangler dev in EMAIL_MODE=log, reading the rendered messages out of the log: signed a real `checkout.session.completed` webhook by HMAC and delivered it TWICE. Exactly 4 emails were produced across the whole run, not 6 — confirmation (#TPM-7468, correct address block, correct totals) and seller notice on the first delivery, nothing on the redelivery (answered `duplicate: true`). Separately: /ready produced the pickup email and a second /ready returned 409 with no second email; /ship produced the tracking email with carrier. Notably the ready email named the PICKUP store (The Pub Game Store) and not the SELLING store (Eldrazi Corner) — they differ, and that distinction is the reason sendOrderReady reads the delivery block rather than the order's seller.

AC#6 evidence, being precise about what was and was not proven: the live run confirmed the order reached `paid` and inventory decremented from 5 to 4 while the emails were dispatched. It did NOT prove the provider-failure branch — a `wrangler dev` run with EMAIL_MODE=send only SIMULATES the send (Miniflare), which docs/ingenieria/email.md already warned about at §2, and indeed no send/failure log line appeared. The failure branch is instead covered by a new unit test (`email.test.ts`): a provider that throws yields `{ok:false, reason}` with no exception escaping, and the message body is never written to the log. Real-provider failure remains unobservable outside the deployed Worker.

AC#8 and AC#9 are intentionally left unchecked: both need a human mailbox and eyes. AC#8 is 'renders in a real web client'; AC#9 is a test-mode payment against the DEPLOYED API with confirmation that mail actually arrives. Everything is in place for them — see the final summary for the exact steps to run.

Copy decisions worth keeping: buyer emails state 'Le compras directo a <tienda>; The Pub Market solo conecta la venta', which is the non-custodial model in the buyer's own words. A regression test fails if any buyer-facing template mentions comisión / fee / saldo, so AC#7 cannot rot silently. Store hours render 'Domingo: cerrado' rather than dropping the row, and the carrier line disappears entirely when the seller left it blank rather than printing an empty label.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-31 00:57
---
Scope amended before starting: the original criteria assumed data the product does not have. Verified in code — `checkout.ts` never requests a shipping address from Stripe, `orders` has no address columns, and `shipSchema` accepts only a tracking number. So 'the buyer's shipping details' and 'carrier' had nothing behind them.

Rather than invent that data here, the delivery model itself became TASK-019 (buyer chooses shipping at MXN 200 flat or free pickup at an allied store in the same city) and TASK-020 (fulfilment paths, carrier, ready-for-pickup state). This task now depends on both and gained a fourth email: ready for pickup, which is the event a pickup buyer is actually waiting on. Sending order emails before the delivery model exists would mean writing copy we would rewrite immediately.
---
<!-- COMMENTS:END -->
