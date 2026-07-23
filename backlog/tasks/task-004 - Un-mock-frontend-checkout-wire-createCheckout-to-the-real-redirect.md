---
id: TASK-004
title: 'Un-mock frontend checkout: wire createCheckout to the real redirect'
status: In Progress
assignee: []
created_date: '2026-07-22 22:31'
updated_date: '2026-07-23 00:53'
labels:
  - 'epic:checkout-golive'
  - feature
milestone: m-0
dependencies:
  - TASK-002
  - TASK-003
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/web/src/app/[locale]/cart/page.tsx currently mocks checkout: the startCheckout() function (near the `// Mock de checkout` comment, ~line 34) simulates a 1.8s delay then redirects to /checkout/success without calling Stripe or touching funds. The real createCheckout function already exists intact in apps/web/src/lib/client-api.ts and calls the real checkout API. This task replaces the mock with the real call now that Stripe Connect is live (depends on platform setup + secrets).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 startCheckout() in cart/page.tsx calls the real createCheckout from lib/client-api.ts instead of simulating a redirect
- [ ] #2 On success, browser redirects to res.data.url returned by the API (the real Stripe Checkout session URL)
- [ ] #3 The simulated ~1.8s mock redirect and mock comment are removed
- [ ] #4 NEXT_PUBLIC_API_URL confirmed to point at the correct (working) API for the target environment
- [ ] #5 `pnpm -F @thepubmarket/web typecheck` and `pnpm -F @thepubmarket/web build` pass
<!-- AC:END -->
