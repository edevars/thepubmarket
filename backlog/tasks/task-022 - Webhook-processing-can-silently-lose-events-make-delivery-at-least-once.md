---
id: TASK-022
title: 'Webhook processing can silently lose events: make delivery at-least-once'
status: To Do
assignee: []
created_date: '2026-08-03 04:03'
updated_date: '2026-08-03 04:04'
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
Two failure modes in `webhooks.ts` can lose a Stripe event permanently even though Stripe retries deliveries:

1. **Dedupe-before-work.** The handler inserts `event.id` into `webhook_events` *before* executing effects. If anything kills the request after that insert commits and before the work finishes (transient D1 error, isolate eviction/deploy, uncaught exception, Stripe-side timeout), the retry hits the dedupe and is discarded as duplicate. The effect is lost forever — there is no second event carrying the same id. This dedupe shape gives at-most-once, but a recoverable side effect needs at-least-once.

2. **Swallowed Workflow creation failure.** `POST_PAYMENT.create(...).catch(() => {})` conflates "instance already exists" (fine) with "creation failed" (order stuck). If creation truly fails, the handler still answers 200: the buyer paid, the order stays `pending` forever, inventory is never decremented, and nothing detects it — there is no cron/sweeper in the Worker.

A cross-system transaction is impossible here (effects span D1, Workflows, Durable Objects), so the fix is convergence, not atomicity: answer Stripe with an error when processing fails so it retries, re-run redelivered events whose processing never completed, and keep every handler idempotent and concurrent-safe (they already are — that contract must be made explicit so it survives future edits, e.g. TASK-017 adding email sends).

Found while working TASK-021 (which moved the PaymentIntent write into the Workflow for exactly this reason). Non-custodial invariant untouched: reliability of bookkeeping and order settlement, no change to how money moves.

Code, comments and docs in English.
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

## Comments

<!-- COMMENTS:BEGIN -->
author: claude
created: 2026-08-03 04:04
---
**Design proposal (pending approval — recorded here so it survives the session; the executing agent should re-verify against the then-current code before adopting it as the plan).**

## Principle

No transaction can span D1 + Workflows + Durable Objects, so the design goal is **convergence**: Stripe's retry loop is the queue, `webhook_events` becomes a processing ledger instead of a discard list, and handler idempotency — not dedupe — is the correctness guarantee. Dedupe remains only an optimization for the already-processed case.

## Mechanism: claim → work → mark processed

Migration (additive, D1-safe, mirrors 0007/0008 pattern):

```sql
ALTER TABLE webhook_events ADD COLUMN status TEXT NOT NULL DEFAULT 'received';
ALTER TABLE webhook_events ADD COLUMN processed_at INTEGER;
ALTER TABLE webhook_events ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhook_events ADD COLUMN last_error TEXT;
UPDATE webhook_events SET status = 'processed', processed_at = unixepoch(); -- history: never re-run (AC#7)
```

Handler flow:
1. Verify signature (unchanged, 400).
2. INSERT claim (`status='received'`, `attempts=1`). On PK conflict, read the row: `processed` → return `{received, duplicate}` (AC#3); `received` → increment `attempts`, fall through and re-run (AC#2).
3. Run the `switch`. Unknown event types count as trivially processed.
4. Success → `UPDATE status='processed', processed_at`. Failure → record `last_error`, return **500** so Stripe retries (AC#1).

Poison events self-limit: Stripe backs off and gives up (~3 days live mode); the row stays `received` with its error. `SELECT id, type, attempts, last_error FROM webhook_events WHERE status='received' AND created_at < unixepoch()-900` is the dead-letter view (AC#6, goes in docs).

## Workflow-creation failure (AC#4)

Replace `.catch(() => {})` with: on `create()` error, call `POST_PAYMENT.get(orderId)` — instance exists → earlier delivery won the race, fine; `get` also throws → real failure, propagate to the 500 path. Verifying existence avoids matching on error-message strings.

## Idempotency/concurrency audit (why re-run and concurrent duplicates are safe today — AC#5 makes this a stated contract in the handler header)

| Event | Guard |
|---|---|
| `checkout.session.completed` | Workflow instance id = orderId; each step guarded (`pending→paid` WHERE, `IS NULL` on pi link) |
| `checkout.session.expired` | `releaseAndCancel` no-ops unless `status='pending'`; DO release idempotent |
| `payment_intent.payment_failed` | log only |
| `account.updated` | UPDATE guarded by `status='invited'` |

## Alternatives considered

- **Dedupe after work (no claim row):** simpler, but loses the failure ledger — an event that keeps dying leaves no trace queryable in D1.
- **Cloudflare Queues:** a second queue in front of Stripe's own retry queue; new primitive, new failure modes, unjustified for one maintainer.
- **Store raw payload + cron self-sweeper:** covers outages longer than Stripe's retry window, at the cost of retaining PII payloads and a reconciler to maintain. Deferred; if ever needed, a reconciler comparing `orders.status='pending'` older than the 24h session lifetime against Stripe is the better shape (no payload retention). Out of scope here.

## Verification (AC#8)

Local `wrangler dev` + `stripe listen`: force a throw inside one case, pay a test order, watch the 500 → CLI redelivers → converges to `processed`; then resend nothing and confirm a processed duplicate short-circuits. Connect events can't use `stripe events resend` (see validacion-e2e-task-005.md) — the CLI's automatic retry on 500 covers redelivery instead.

Estimated footprint: migration 0009 + schema.ts + ~60 lines in webhooks.ts + doc section. Non-custodial: untouched.
---
<!-- COMMENTS:END -->
