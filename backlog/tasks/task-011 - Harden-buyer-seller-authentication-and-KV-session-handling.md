---
id: TASK-011
title: Harden buyer/seller authentication and KV session handling
status: To Do
assignee: []
created_date: '2026-07-22 22:32'
updated_date: '2026-07-24 04:18'
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-24 04:18
---
Superseded scope: original task targeted magic-link hardening. Magic-link is being replaced entirely by email+password auth (see plan executed in this session). AC rewritten to match the new system — see apps/api/src/lib/password.ts and lib/rate-limit.ts once implemented.
---
<!-- COMMENTS:END -->
