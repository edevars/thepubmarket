---
id: TASK-012
title: Add Cloudflare Turnstile to login and checkout entry points
status: To Do
assignee: []
created_date: '2026-07-22 22:32'
labels:
  - 'epic:anti-bot'
  - feature
milestone: m-1
dependencies: []
priority: medium
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CLAUDE.md specifies Turnstile as the anti-bot layer for registration and checkout. As the marketplace opens to more sellers and real transactions, both the magic-link login request and checkout entry need bot protection. The 'turnstile-spin' Claude Code skill may be useful for scaffolding this end-to-end (widget + managed siteverify Worker).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Turnstile widget added to the magic-link login/request form
- [ ] #2 Turnstile widget added to checkout entry point
- [ ] #3 Server-side siteverify check enforced in the Worker before accepting login/checkout requests
- [ ] #4 Turnstile site/secret keys managed via Cloudflare secrets, not hardcoded
- [ ] #5 Graceful failure UX in place (Spanish copy) if Turnstile verification fails
<!-- AC:END -->
