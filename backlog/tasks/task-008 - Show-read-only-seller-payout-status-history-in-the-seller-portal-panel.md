---
id: TASK-008
title: Show read-only seller payout status/history in the seller portal (/panel)
status: To Do
assignee: []
created_date: '2026-07-22 22:32'
updated_date: '2026-07-22 22:32'
labels:
  - 'epic:connect-onboarding'
  - feature
milestone: m-1
dependencies:
  - TASK-007
priority: medium
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sellers using the self-service portal at /panel (apps/web/src/app/[locale]/panel/) currently have no visibility into their Stripe payouts. Since the platform never custodies funds, this must be a read-only view sourced live from Stripe (via the seller's Connect account), never a balance stored or computed on the platform side. Depends on generalized Connect onboarding existing so any seller (not just the anchor) has a real connect_account_id to query.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Seller portal /panel shows payout status and recent payout history for the logged-in seller
- [ ] #2 Data is read directly from Stripe (via the seller's Connect account), not stored/aggregated as a platform-side balance
- [ ] #3 Platform never holds, redirects, or has authority to move the seller's funds — this view is observational only
- [ ] #4 Gracefully handles sellers still mid-onboarding (no connect_account_id yet)
<!-- AC:END -->
