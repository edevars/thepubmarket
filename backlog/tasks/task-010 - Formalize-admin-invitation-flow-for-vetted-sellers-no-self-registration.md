---
id: TASK-010
title: Formalize admin invitation flow for vetted sellers (no self-registration)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-22 22:32'
updated_date: '2026-07-26 03:12'
labels:
  - 'epic:identity'
  - feature
milestone: m-1
dependencies: []
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today, linking a seller account to a login email happens via a raw internal endpoint (POST /admin/sellers/:id/link with an x-admin-key header, see docs/ingenieria/estado-actual.md). This is functional but not a proper, auditable admin workflow. Per CLAUDE.md's 'vetted sellers / no self-registration' rule, this must remain admin-invite-only — this task formalizes that into a real, auditable flow (not necessarily a full UI, but at minimum logging/audit trail and guardrails), and must explicitly prevent any path to public self-registration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Admin invite-and-link action (building on POST /admin/sellers/:id/link) is auditable — who invited whom, when, recorded
- [ ] #2 Explicit safeguards confirmed preventing any public self-registration path for sellers
- [ ] #3 Documented process for how a new vetted seller gets invited end-to-end (admin action -> seller receives access)
- [ ] #4 x-admin-key protection reviewed and confirmed adequate, or upgraded if found insufficient
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan (recorded 2026-07-25)

Research findings that shape the plan:
- `POST /admin/sellers/:id/link` (apps/api/src/routes/admin.ts:89) is the only invite mechanism. It creates the user if missing, sets `sellers.user_id`, and records nothing. No caller in the repo (scripts/load-inventory.mjs only hits `POST /admin/inventory`), so adding a required actor header breaks nothing.
- `adminAuth` (apps/api/src/middleware/admin-auth.ts) is fail-closed but compares the key with `!==` (non-constant-time) and has no throttling on failed attempts.
- Seller identity = a row in `sellers` with `user_id`. `POST /auth/register` hardcodes `role: 'buyer'` and zod strips unknown fields, so no public path can mint a seller. No public route inserts into `sellers`.

### 1. AC#1 — auditable invite (D1 append-only table)
- `packages/db/src/schema.ts`: new `seller_invitations` table — `id`, `seller_id` (FK cascade), `email`, `user_id` (FK set null), `invited_by`, `ip`, `note`, `created_at`. Append-only: every link/re-link writes a row, never updates. Export row types from `packages/db/src/index.ts`.
- Generate migration `0006_*` with `pnpm -F @thepubmarket/api db:generate` (drizzle-kit), apply locally.
- `POST /admin/sellers/:id/link`: require an `x-admin-actor` header (validated as email) = who performed the invite; write the audit row in the same handler; return the invitation id.
- New `GET /admin/sellers/:id/invitations` — reading back the trail is what makes it auditable.
- Honest limitation to document: with a shared key, `x-admin-actor` is attribution *by convention*, not cryptographic. Cryptographic attribution needs Access service tokens on `/admin/*` (follow-up, needs dashboard).

### 2. AC#4 — admin-key hardening
- Constant-time comparison (fixed-work XOR over the encoded bytes) to remove the timing oracle.
- KV rate limit on failed admin auth by IP, reusing `checkRateLimit` (`lib/rate-limit.ts`, SESSIONS binding) → 429 after N failures/window. Successful requests don't consume budget.
- `console.warn` (not fail-closed) when `ADMIN_API_KEY` is shorter than 32 chars — failing closed on a weak key would lock the operator out of prod admin.
- Write the review verdict in the runbook: adequate as interim for a single operator; the durable fix is Access service tokens.

### 3. AC#2 — safeguards against self-registration
- Review-and-record, plus curl probes proving it: unauthenticated and buyer-session calls to every seller-touching path fail; `/auth/register` can't set `role` or create a `sellers` row.
- Reinforce with explicit code comments where the invariant lives (schema `sellers`, `auth.ts` register).

### 4. AC#3 — end-to-end runbook
- `docs/ingenieria/invitacion-sellers.md` (Spanish, matching its siblings in docs/ingenieria): full path from "we decided to invite store X" → create the `sellers` row → link the email → seller registers a password → Stripe Connect onboarding (TASK-007) → `status='active'` via `account.updated` webhook → `/panel`. Includes the audit query and the AC#2 verification matrix.
- Cross-link from `estado-actual.md`, `handoff.md`, `checklist-go-live-real.md`.

### Verification
`pnpm -F @thepubmarket/api typecheck`, `pnpm lint`, `pnpm -F @thepubmarket/api build`, plus live curl against local `wrangler dev` with a migrated local D1 (invite → audit row → read-back → rate limit → self-registration probes). No browser testing.

### Non-goals
Admin UI, changes to `POST /admin/inventory`, Access service tokens in the dashboard (needs Cloudflare account access — same blocker as TASK-009).
<!-- SECTION:PLAN:END -->
