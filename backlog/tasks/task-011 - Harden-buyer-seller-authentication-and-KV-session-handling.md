---
id: TASK-011
title: Harden buyer/seller authentication and KV session handling
status: In Progress
assignee:
  - claude
created_date: '2026-07-22 22:32'
updated_date: '2026-07-28 17:49'
labels:
  - 'epic:identity'
  - chore
milestone: m-1
dependencies: []
priority: medium
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buyer and seller auth are moving from magic-link to email+password (see TASK-013+ implementation work replacing apps/api/src/routes/auth.ts and lib/auth.ts). This task now covers hardening the password-based system instead of magic-link: hashing parameters, KV rate limiting on auth endpoints, reset-token hygiene, and session handling — closing gaps before scaling seller count and real money flowing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Session expiry and rotation behavior reviewed and made explicit/consistent across buyer and seller sessions
- [ ] #2 Explicit logout capability confirmed to work for both buyer and seller sessions
- [ ] #3 Password-reset token TTL and single-use enforcement reviewed (lib/auth.ts createResetToken/consumeResetToken) and password hashing parameters (PBKDF2 iteration count) reviewed against current OWASP guidance
- [ ] #4 KV-based rate limiting on /auth/login, /auth/register, /auth/password/forgot, /auth/password/reset reviewed for correctness and threshold tuning
- [ ] #5 No regressions to login, register, password reset, /panel, or /compras flows — verified via build/typecheck and manual pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Findings (review pass over current code)

Reviewed: `apps/api/src/lib/{auth,password,rate-limit}.ts`, `routes/auth.ts`,
`middleware/{buyer,seller}-auth.ts`, `apps/web/src/lib/session.ts`,
`components/auth/AuthProvider.tsx`.

**AC#1 sessions** — One shared session model for buyer and seller (KV `sess:<token>`,
7-day absolute TTL, no sliding renewal, no rotation). Seller identity is resolved live
from the `sellers` row, not baked into the token — good, already consistent.
Gap: no user→sessions reverse index, so a credential change cannot revoke sibling
sessions (documented as a known limitation in `routes/auth.ts:180`).

**AC#2 logout** — `POST /auth/logout` deletes the KV session; `AuthProvider.signOut()`
calls it and clears localStorage. Works for both roles (same session). Gap: it leaves
the reverse-index entry once that index exists.

**AC#3 hashing / reset tokens** — Reset tokens: 256-bit random, 15-min TTL, single-use
(delete-on-read). Correct. Password hashing: PBKDF2-HMAC-SHA256 @ **210,000** iterations.
That is OWASP's number for **SHA-512**, not SHA-256 — current OWASP guidance for
PBKDF2-HMAC-SHA256 is **600,000**. Stored format is self-describing
(`pbkdf2-sha256$<iters>$<salt>$<hash>`) so the count can be raised without a migration,
but there is no rehash-on-login path.
Measured cost (native WebCrypto, M-series): 210k SHA-256 ≈ 25 ms, 600k SHA-256 ≈ 71 ms,
210k SHA-512 ≈ 48 ms.

**AC#3 login enumeration/timing** — `POST /auth/login` returns `403 password_not_set` for
legacy passwordless accounts, which is an account-existence oracle (the web login page
uses it to redirect legacy users to forgot-password). Also, an unknown email returns
before any PBKDF2 work, so response timing distinguishes existing from non-existing
accounts.

**AC#4 rate limiting** — Fixed-window KV counters on register/login/forgot/reset; buckets
and thresholds are sane. Two real issues: (a) `checkRateLimit` increments on **every**
attempt, so a legitimate user's successful logins burn the same 8/10-min email budget an
attacker does; (b) KV is not atomic, so concurrent bursts under-count — already
documented and accepted pending Turnstile (TASK-012).

## Plan

1. `lib/password.ts` — raise iterations to the OWASP SHA-256 figure; add `needsRehash()`;
   fix the stale "OWASP 2023 minimum" docblock. Old hashes keep verifying (self-describing format).
2. `routes/auth.ts` login — opportunistic rehash on successful login when the stored
   iteration count is below current; add a dummy verify on unknown-email so timing does
   not leak account existence.
3. `lib/auth.ts` — add `usess:<userId>:<token>` reverse index (same TTL as the session);
   `deleteSession` cleans both keys; new `deleteAllUserSessions(kv, userId)`.
4. `routes/auth.ts` password reset — revoke all of the user's existing sessions before
   issuing the new one (closes the documented limitation = real rotation on credential change).
5. `lib/rate-limit.ts` — split into a read-only `isRateLimited()` and `recordAttempt()`;
   login records against the email bucket only on **failure**, so successful logins never
   throttle a real user while the attacker budget stays at 8/10 min. IP buckets keep
   counting all attempts.
6. Tests — bootstrap vitest for `apps/api` (mirrors the `apps/web` config added in TASK-009);
   cover password hash/verify/rehash, session create/get/delete/delete-all against a fake KV,
   and rate-limit windowing + failure-only counting. Wire `test` into `turbo.json`.
7. Docs — `docs/ingenieria/auth-hardening.md` (EN): session model, thresholds, hashing
   params and rationale, remaining known limitations.

No fund-flow surface is touched: this is identity/session only, no Stripe, no balances.

## Open decisions (asked before implementing steps 1–2)

- Workers plan / CPU budget → picks the KDF parameters (step 1).
- Whether to close the `password_not_set` enumeration oracle at the cost of the legacy-user
  redirect UX (step 2). Local DB has 5 of 8 users still passwordless.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-24 04:18
---
Superseded scope: original task targeted magic-link hardening. Magic-link is being replaced entirely by email+password auth (see plan executed in this session). AC rewritten to match the new system — see apps/api/src/lib/password.ts and lib/rate-limit.ts once implemented.
---
<!-- COMMENTS:END -->
