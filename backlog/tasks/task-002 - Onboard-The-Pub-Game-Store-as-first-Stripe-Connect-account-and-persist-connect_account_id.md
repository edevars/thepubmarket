---
id: TASK-002
title: >-
  Onboard The Pub Game Store as first Stripe Connect account and persist
  connect_account_id
status: To Do
assignee: []
created_date: '2026-07-22 22:31'
labels:
  - 'epic:stripe-platform'
  - ops
milestone: m-0
dependencies: []
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Pub Game Store is the anchor seller and must complete Stripe Connect Express onboarding so checkout can route direct charges to it. Today sellers.stripe_connect_account_id is null/placeholder. The checkout route (apps/api/src/routes/checkout.ts) calls lib/stripe.ts createCheckoutSession with a connectedAccountId used as Stripe's { stripeAccount } param for a direct charge — this must resolve to a real, onboarded Connect account id. Non-custodial: this MUST remain a direct charge (stripeAccount header) with application_fee_amount — never separate charges & transfers, never a platform-side balance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Pub Game Store completes Stripe Express onboarding in test mode
- [ ] #2 sellers.stripe_connect_account_id column is populated with the real Connect account id for the anchor seller
- [ ] #3 apps/api/src/lib/stripe.ts and routes/checkout.ts confirmed to read/use this id correctly for the direct charge
- [ ] #4 Verified the charge still uses { stripeAccount: connectedAccountId } + application_fee_amount (no custody of funds)
<!-- AC:END -->
