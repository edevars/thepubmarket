---
id: TASK-015
title: Replace magic-link auth with email+password
status: To Do
assignee: []
created_date: '2026-07-24 04:18'
labels:
  - 'epic:identity'
  - feature
milestone: m-1
dependencies: []
references:
  - /Users/codevars/.claude/plans/sprightly-churning-diffie.md
priority: high
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Magic-link passwordless auth (apps/api/src/routes/auth.ts, lib/auth.ts) is being replaced entirely with email+password for both buyers and sellers, per explicit product decision. Full plan: PBKDF2-HMAC-SHA256 password hashing (crypto.subtle, zero new deps), nullable users.password_hash column, legacy-user transition via password_not_set login response, register/login/forgot/reset endpoints, KV-based interim rate limiting, packages/shared auth types, and frontend login/register/forgot-password/reset-password pages replacing the old login/verify pages. No fund-flow / Ley Fintech implication — pure login mechanism change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 users.password_hash column added via Drizzle migration (nullable), migration applied locally
- [ ] #2 POST /auth/register, POST /auth/login, POST /auth/password/forgot, POST /auth/password/reset implemented in apps/api/src/routes/auth.ts; /auth/magic-link and /auth/verify removed
- [ ] #3 apps/api/src/lib/password.ts implements PBKDF2-HMAC-SHA256 hashPassword/verifyPassword with constant-time compare
- [ ] #4 apps/api/src/lib/rate-limit.ts implements KV-based rate limiting on all four new auth endpoints
- [ ] #5 Legacy magic-link-only users (password_hash IS NULL) get password_not_set on login and can set a password via the reset flow
- [ ] #6 apps/web login/register/forgot-password/reset-password pages implemented; auth/verify page removed
- [ ] #7 buyer-auth.ts, seller-auth.ts, admin-auth.ts, checkout.ts unchanged (verified no regressions)
- [ ] #8 pnpm typecheck and pnpm lint pass across the monorepo
- [ ] #9 TASK-011 and TASK-012 scope updated to reference the new password-based system (done)
<!-- AC:END -->
