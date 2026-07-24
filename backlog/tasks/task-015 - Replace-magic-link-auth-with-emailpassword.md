---
id: TASK-015
title: Replace magic-link auth with email+password
status: Done
assignee: []
created_date: '2026-07-24 04:18'
updated_date: '2026-07-24 04:40'
labels:
  - 'epic:identity'
  - feature
milestone: m-1
dependencies: []
references:
  - /Users/codevars/.claude/plans/sprightly-churning-diffie.md
modified_files:
  - apps/api/src/lib/password.ts
  - apps/api/src/lib/rate-limit.ts
  - apps/api/src/lib/auth.ts
  - apps/api/src/lib/email.ts
  - apps/api/src/routes/auth.ts
  - apps/api/src/types.ts
  - apps/api/src/index.ts
  - packages/db/src/schema.ts
  - apps/api/migrations/0005_nice_sleeper.sql
  - packages/shared/src/index.ts
  - apps/web/src/lib/session.ts
  - 'apps/web/src/app/[locale]/login/page.tsx'
  - 'apps/web/src/app/[locale]/register/page.tsx'
  - 'apps/web/src/app/[locale]/auth/forgot-password/page.tsx'
  - 'apps/web/src/app/[locale]/auth/reset-password/page.tsx'
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - docs/ingenieria/estado-actual.md
priority: high
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Magic-link passwordless auth (apps/api/src/routes/auth.ts, lib/auth.ts) is being replaced entirely with email+password for both buyers and sellers, per explicit product decision. Full plan: PBKDF2-HMAC-SHA256 password hashing (crypto.subtle, zero new deps), nullable users.password_hash column, legacy-user transition via password_not_set login response, register/login/forgot/reset endpoints, KV-based interim rate limiting, packages/shared auth types, and frontend login/register/forgot-password/reset-password pages replacing the old login/verify pages. No fund-flow / Ley Fintech implication — pure login mechanism change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 users.password_hash column added via Drizzle migration (nullable), migration applied locally
- [x] #2 POST /auth/register, POST /auth/login, POST /auth/password/forgot, POST /auth/password/reset implemented in apps/api/src/routes/auth.ts; /auth/magic-link and /auth/verify removed
- [x] #3 apps/api/src/lib/password.ts implements PBKDF2-HMAC-SHA256 hashPassword/verifyPassword with constant-time compare
- [x] #4 apps/api/src/lib/rate-limit.ts implements KV-based rate limiting on all four new auth endpoints
- [x] #5 Legacy magic-link-only users (password_hash IS NULL) get password_not_set on login and can set a password via the reset flow
- [x] #6 apps/web login/register/forgot-password/reset-password pages implemented; auth/verify page removed
- [x] #7 buyer-auth.ts, seller-auth.ts, admin-auth.ts, checkout.ts unchanged (verified no regressions)
- [x] #8 pnpm typecheck and pnpm lint pass across the monorepo
- [x] #9 TASK-011 and TASK-012 scope updated to reference the new password-based system (done)
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-24 04:32
---
Follow-up: added a confirm-password field to the register page (client-side match check before submit) — apps/web/src/app/[locale]/register/page.tsx, plus confirmPasswordPlaceholder/errorPasswordMismatch i18n keys in es.json/en.json. No API change needed.
---

created: 2026-07-24 04:40
---
Follow-up: added live client-side validation feedback across all four auth pages (login, register, forgot-password, reset-password). Email fields show an inline error + red border once touched/blurred if the format is invalid (new apps/web/src/lib/auth-validation.ts, shared isValidEmail/isPasswordLongEnough helpers mirroring the API's zod rules). Password fields on register/reset-password show a live green checkmark once the 10-char minimum is met; the register confirm-password field shows live red/green match feedback. Verified interactively in the browser (invalid email → red message, valid email → clears; short password → muted hint, valid → green check; mismatched confirm → red, matching → green). New i18n keys errorInvalidEmail/passwordHintOk/passwordsMatch in es.json/en.json. pnpm typecheck and pnpm lint pass.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced magic-link passwordless auth with email+password for buyers and sellers, per explicit product decision. Password hashing via PBKDF2-HMAC-SHA256 through native crypto.subtle (zero new dependencies), stored in a new nullable users.password_hash column. New endpoints: POST /auth/register, /auth/login, /auth/password/forgot, /auth/password/reset; /auth/magic-link and /auth/verify removed. Legacy magic-link-only accounts are detected at login (password_not_set) and routed through the reset flow to set a password — no bulk migration. Added KV-based interim rate limiting on all four endpoints pending Turnstile (TASK-012). Frontend: rewrote login page, added register/forgot-password/reset-password pages, removed the old verify page. buyer-auth.ts, seller-auth.ts, admin-auth.ts, and checkout.ts were confirmed unchanged — they only depend on session tokens, not on how the session was created.

Verified end-to-end locally via curl + local D1: register → session → /auth/me, duplicate-email rejection (409), login with wrong password tripping the per-email rate limit (429), a seeded legacy account returning password_not_set (403) → forgot-password → reset (single-use token, reuse correctly rejected) → login with the new password, checkout completing (201 + Stripe test URL) with a password-auth session, and GET /seller/me resolving correctly after claiming a legacy seller-linked account via register. pnpm typecheck and pnpm lint both pass clean across the monorepo. TASK-011 and TASK-012 scope updated to reference the new system.
<!-- SECTION:FINAL_SUMMARY:END -->
