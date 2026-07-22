---
id: TASK-011
title: Harden buyer/seller authentication and KV session handling
status: To Do
assignee: []
created_date: '2026-07-22 22:32'
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
Buyer and seller auth both rely on magic links + KV sessions (apps/api/src/lib/auth.ts, middleware/buyer-auth.ts, middleware/seller-auth.ts). As the marketplace moves to multi-seller with real money flowing, session and magic-link hygiene needs a deliberate review and hardening pass: this is not new functionality but closing gaps before scaling seller count.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Session expiry and rotation behavior reviewed and made explicit/consistent across buyer and seller sessions
- [ ] #2 Explicit logout capability confirmed to work for both buyer and seller sessions
- [ ] #3 Magic-link TTL and single-use enforcement reviewed across lib/auth.ts and both auth middlewares
- [ ] #4 No regressions to existing login, /panel, or /compras flows — verified via build/typecheck and manual pass
<!-- AC:END -->
