---
id: TASK-022
title: 'Webhook processing can silently lose events: make delivery at-least-once'
status: To Do
assignee: []
created_date: '2026-08-03 04:03'
labels:
  - api
  - stripe
  - payments
  - webhooks
milestone: m-2
dependencies: []
references:
  - apps/api/src/routes/webhooks.ts
  - packages/db/src/schema.ts
  - apps/api/src/workflows/post-payment.ts
  - apps/api/migrations/
documentation:
  - docs/ingenieria/pagos.md
  - docs/ingenieria/validacion-e2e-task-005.md
priority: high
type: bug
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two failure modes in `webhooks.ts` can lose a Stripe event permanently even though Stripe retries deliveries:\n\n1. **Dedupe-before-work.** The handler inserts `event.id` into `webhook_events` *before* executing effects. If anything kills the request after that insert commits and before the work finishes (transient D1 error, isolate eviction/deploy, uncaught exception, Stripe-side timeout), the retry hits the dedupe and is discarded as duplicate. The effect is lost forever — there is no second event carrying the same id. This dedupe shape gives at-most-once, but a recoverable side effect needs at-least-once.\n\n2. **Swallowed Workflow creation failure.** `POST_PAYMENT.create(...).catch(() => {})` conflates "instance already exists" (fine) with "creation failed" (order stuck). If creation truly fails, the handler still answers 200: the buyer paid, the order stays `pending` forever, inventory is never decremented, and nothing detects it — there is no cron/sweeper in the Worker.\n\nA cross-system transaction is impossible here (effects span D1, Workflows, Durable Objects), so the fix is convergence, not atomicity: answer Stripe with an error when processing fails so it retries, re-run redelivered events whose processing never completed, and keep every handler idempotent and concurrent-safe (they already are — that contract must be made explicit so it survives future edits, e.g. TASK-017 adding email sends).\n\nFound while working TASK-021 (which moved the PaymentIntent write into the Workflow for exactly this reason). Non-custodial invariant untouched: reliability of bookkeeping and order settlement, no change to how money moves.\n\nCode, comments and docs in English.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A webhook delivery whose processing fails is answered with an error status so Stripe retries it; the signature-failure 400 path is unchanged
- [ ] #2 A redelivered event whose earlier processing never completed is processed again instead of being discarded as duplicate
- [ ] #3 A redelivered event whose processing already completed is discarded without re-executing any effect
- [ ] #4 A real failure creating the post-payment Workflow instance is not swallowed: only the instance-already-exists case is tolerated, anything else surfaces as a processing failure
- [ ] #5 Every handled event type is safe to re-run and safe under concurrent duplicate delivery, and that contract is stated in the handler so future additions (e.g. TASK-017 emails) preserve it
- [ ] #6 Unprocessed or failing events are observable from D1 (event id, type, attempts, last error), with the diagnostic query documented in docs/ingenieria/
- [ ] #7 The schema change is a D1-safe additive migration and all pre-existing webhook_events rows are treated as already processed, so deploying does not re-run history
- [ ] #8 Verified locally with stripe listen: a forced processing failure converges after Stripe's retry, and a duplicate delivery of a processed event does not repeat effects
<!-- AC:END -->
