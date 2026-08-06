---
id: TASK-022
title: 'Webhook processing can silently lose events: make delivery at-least-once'
status: In Progress
assignee:
  - claude
created_date: '2026-08-03 04:03'
updated_date: '2026-08-06 06:45'
labels:
  - api
  - stripe
  - payments
  - webhooks
  - needs-verification
  - blocked
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
priority: low
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
- [x] #1 A webhook delivery whose processing fails is answered with an error status so Stripe retries it; the signature-failure 400 path is unchanged
- [x] #2 A redelivered event whose earlier processing never completed is processed again instead of being discarded as duplicate
- [x] #3 A redelivered event whose processing already completed is discarded without re-executing any effect
- [ ] #4 A real failure creating the post-payment Workflow instance is not swallowed: only the instance-already-exists case is tolerated, anything else surfaces as a processing failure
- [x] #5 Every handled event type is safe to re-run and safe under concurrent duplicate delivery, and that contract is stated in the handler so future additions (e.g. TASK-017 emails) preserve it
- [x] #6 Unprocessed or failing events are observable from D1 (event id, type, attempts, last error), with the diagnostic query documented in docs/ingenieria/
- [x] #7 The schema change is a D1-safe additive migration and all pre-existing webhook_events rows are treated as already processed, so deploying does not re-run history
- [x] #8 Verified locally with stripe listen: a forced processing failure converges after Stripe's retry, and a duplicate delivery of a processed event does not repeat effects
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Design approved by the user (2026-08-02, see comment #1 for full rationale and alternatives). Execution steps:

1. **Migration 0009** — additive `ALTER TABLE webhook_events`: `status` (default 'received'), `processed_at`, `attempts` (default 0), `last_error`; then `UPDATE ... SET status='processed', processed_at=unixepoch()` so history never re-runs (AC#7). Match the hand-written 0007/0008 pattern if that's how they were made (verify migrations dir first).
2. **`packages/db/src/schema.ts`** — add the four columns to `webhookEvents`.
3. **`apps/api/src/routes/webhooks.ts`** — claim → work → mark processed:
   - INSERT claim (`attempts: 1`). On conflict, read row: `processed` → `{received, duplicate}`; `received` → `attempts+1`, fall through and re-run. Row unreadable → 500 (do NOT answer duplicate on an unverified conflict).
   - Wrap the switch: success → `status='processed', processed_at`; throw → record `last_error`, log, return 500 so Stripe retries. Unknown event types are trivially processed.
   - `checkout.session.completed`: replace `.catch(() => {})` — on `create()` error, `POST_PAYMENT.get(orderId)`; instance exists → race lost, fine; get throws → rethrow the original create error into the 500 path.
   - Header comment: state the at-least-once contract — every case must stay idempotent AND concurrent-safe; dedupe is an optimization, not the guarantee.
4. **Verify locally (AC#8)** — `wrangler d1 migrations apply --local`, `wrangler dev` + `stripe listen`; force a temporary throw in one case, `stripe trigger payment_intent.payment_failed` → expect 500 + row `received` with `last_error`; revert throw, `stripe events resend evt_…` → 200 + row `processed`; resend again → `duplicate: true`, no re-execution.
5. **Docs (AC#6)** — section in `docs/ingenieria/pagos.md`: the at-least-once model, the dead-letter query over `status='received'`, what to do with a poisoned event.
6. **Prod rollout** — needs BOTH `wrangler d1 migrations apply thepubmarket-db --remote` and `wrangler deploy`; deploy is blocked for the agent by the permission classifier, so hand both commands to the user (same deploy also closes TASK-021 AC#7).

Non-custodial check: no change to fund flow; reliability of bookkeeping/settlement only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented and verified locally.** Migration `0009_elite_wind_dancer.sql` (drizzle-kit generated + hand-appended history UPDATE), `webhookEvents` gains status/processed_at/attempts/last_error, `webhooks.ts` rewritten to claim → work → mark processed with the switch extracted into `processEvent()` that throws on real failure. Conflict path: row unreadable → 500 (answering 'duplicate' on an unverified conflict would lose the event); `processed` → duplicate; `received` → attempts+1 and re-run. Workflow creation tolerates only verified already-exists via `POST_PAYMENT.get()`. Typecheck, biome, 71 lib tests green.

**AC#8 evidence (local, wrangler dev + stripe listen):** temporary forced throw in the `payment_intent.payment_failed` case → `stripe trigger` → delivery answered **500**, row `evt_3U0DGCKpkJAI3F8V1ZETH92h` stayed `received` attempts=1 with `last_error` recorded. Removed the throw → `stripe events resend` → **200**, row converged to `processed` attempts=2, handler effect logged exactly once. Third delivery of the now-processed event → **200 duplicate**, attempts unchanged at 2, effect NOT re-executed (no second log line). Migration applied locally marked all 45 pre-existing rows `processed` (AC#7: history never re-runs).

**AC#4 left unchecked on purpose:** a real Workflows create() failure cannot be produced on demand; the rethrow branch is code-level only so far. Will check it once the prod test payment (same one that closes TASK-021 AC#7) exercises the rewritten happy path end to end.

**Pending — prod rollout (plan step 6):** `wrangler d1 migrations apply thepubmarket-db --remote` then `wrangler deploy`, both handed to the user because deploy is blocked for the agent by the permission classifier. Task stays In Progress until that ships; status must reflect what is actually deployed.

**Committed** on branch `fix/task-021-022-payments-reliability` as `e0a6f6d` (migration 0009, schema, the `webhooks.ts` rewrite and the at-least-once section of `pagos.md`), on top of TASK-021's `c73e599`. Also corrected a stale line in `pagos.md` §2: it described the dedupe-before-work handler in the present tense, which this task removes.

Still pending, unchanged: `wrangler d1 migrations apply thepubmarket-db --remote` + `wrangler deploy`, then the test payment that also closes TASK-021 AC#7 and exercises AC#4's rewritten happy path.

**Prod rollout shipped 2026-08-05.** `wrangler d1 migrations apply thepubmarket-db --remote` → 0009 applied (6 commands), then `wrangler deploy` → version `1a8dacbe-ece7-4d5b-86dc-3be3325ad7a7`. Migration before deploy on purpose: the new handler reads `status`/`attempts`, so against the old schema every delivery would have fallen into the 500 path.

Post-deploy checks against the deployed API: `/health` 200; webhook with no signature still answers `400 missing_signature` (AC#1's unchanged-400 half). D1: all 21 pre-existing `webhook_events` rows are `processed` with a non-NULL `processed_at` (AC#7 confirmed in prod, not just locally), and the dead-letter query `WHERE status='received'` returns empty.

Still open: AC#4, which needs the prod test payment to exercise the rewritten `checkout.session.completed` happy path end to end.

**Downgraded from High to Low + `needs-verification` (2026-08-05).** The High priority was about the defect — events being lost silently — and that is fixed, merged to `main` and live in prod. AC#1–#3 and #5–#8 are verified, including AC#7 against the remote DB. What remains is AC#4 alone: the rethrow branch on a real Workflows `create()` failure, which cannot be forced on demand and is code-level only.

To close it: the next test-mode payment exercises the rewritten `checkout.session.completed` happy path. Check `SELECT id, type, status, attempts, last_error FROM webhook_events ORDER BY created_at DESC LIMIT 3` — the event must land `processed` with `attempts=1` and no `last_error`.

Worth noting: if this branch is ever wrong, the symptom is loud rather than silent (a 500 and a stuck `received` row in the dead-letter query), which is the opposite of the failure mode this task fixed. That asymmetry is why Low is honest here.

**Labeled `blocked` by dispatch-loop (2026-08-06).** Only AC#4 remains; it is exercised by the same human test-mode payment that closes TASK-021 AC#7. After that payment, verify the webhook_events row lands processed/attempts=1 with no last_error and mark Done.
<!-- SECTION:NOTES:END -->

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
