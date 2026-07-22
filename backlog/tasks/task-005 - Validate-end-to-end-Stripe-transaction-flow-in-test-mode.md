---
id: TASK-005
title: Validate end-to-end Stripe transaction flow in test mode
status: To Do
assignee: []
created_date: '2026-07-22 22:31'
updated_date: '2026-07-22 22:32'
labels:
  - 'epic:e2e-validation'
  - spike
milestone: m-0
dependencies:
  - TASK-004
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once checkout is un-mocked and pointed at a live (test-mode) Stripe Connect setup, the full transactional core (inventory reservation Durable Object, checkout, idempotent webhooks, post-payment Workflow) needs to be exercised end-to-end for the first time with real Stripe test-mode traffic. This is the closing criterion for Phase 2 per the roadmap: 'a reliable real end-to-end transaction, including failed payment and retried webhook.'
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Happy path: successful test-mode payment completes, order confirmed, inventory decremented via post-payment Workflow (apps/api/src/workflows/post-payment.ts)
- [ ] #2 Failed payment tested with Stripe test card 4000000000000002; order and inventory state verified correct (no false confirmation)
- [ ] #3 Webhook retried manually (e.g. via Stripe CLI resend) confirmed idempotent — no double inventory decrement, using webhook_events table
- [ ] #4 Reservation TTL confirmed to release the single (inventory-reservation.ts Durable Object) when payment is never completed
- [ ] #5 Results and any issues found documented in docs/ingenieria/ (e.g. estado-actual.md or a new validation note)
<!-- AC:END -->
