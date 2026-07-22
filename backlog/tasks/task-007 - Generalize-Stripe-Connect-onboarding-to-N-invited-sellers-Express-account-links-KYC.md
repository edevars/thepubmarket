---
id: TASK-007
title: >-
  Generalize Stripe Connect onboarding to N invited sellers (Express account
  links + KYC)
status: To Do
assignee: []
created_date: '2026-07-22 22:31'
updated_date: '2026-07-22 22:32'
labels:
  - 'epic:connect-onboarding'
  - feature
milestone: m-1
dependencies:
  - TASK-002
priority: high
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 2 establishes a single hardcoded Connect onboarding for the anchor seller (The Pub Game Store). Phase 3 requires a reusable flow so any admin-invited, vetted seller can be onboarded onto Stripe Connect Express (which handles KYC and Mexican tax obligations), without opening the platform to self-registration. This depends on the Phase 2 anchor-seller Connect onboarding task (same account-link pattern, generalized) — do NOT start until that task's account-link/persistence pattern exists as a reference. Non-custodial constraint: every onboarded seller must end up on the same direct-charge + application_fee model, never a platform-side balance or separate charges & transfers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reusable server-side flow generates a Stripe Connect Express account + hosted onboarding link for any invited seller
- [ ] #2 Resulting stripe_connect_account_id persisted to that seller's row on completion
- [ ] #3 Onboarding-incomplete state handled gracefully (seller can resume, checkout for their inventory is blocked/hidden until complete)
- [ ] #4 KYC and Mexican tax obligations confirmed to be handled by Stripe Express, not custom platform logic
- [ ] #5 Non-custodial invariant (direct charge + application_fee_amount, same as anchor seller) preserved for every onboarded seller
<!-- AC:END -->
