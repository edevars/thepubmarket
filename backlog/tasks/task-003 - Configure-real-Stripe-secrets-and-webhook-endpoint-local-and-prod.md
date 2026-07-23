---
id: TASK-003
title: Configure real Stripe secrets and webhook endpoint (local and prod)
status: In Progress
assignee: []
created_date: '2026-07-22 22:31'
updated_date: '2026-07-23 00:33'
labels:
  - 'epic:stripe-platform'
  - ops
milestone: m-0
dependencies: []
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Checkout and webhook handling (apps/api/src/routes/webhooks.ts, apps/api/src/routes/checkout.ts) currently have no real Stripe credentials wired. Need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET set for both local dev and production so signature verification and idempotent webhook processing (webhook_events table) can actually run against real Stripe test-mode events.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET set in apps/api/.dev.vars for local dev
- [ ] #2 Same secrets set in production via `wrangler secret put`
- [ ] #3 `stripe listen --forward-to <local-api>/webhooks/stripe` (or the real route in routes/webhooks.ts) successfully forwards test events locally
- [ ] #4 Webhook signature verification passes against real Stripe test-mode events
- [ ] #5 Idempotency via webhook_events table confirmed to still work with real event ids
<!-- AC:END -->
