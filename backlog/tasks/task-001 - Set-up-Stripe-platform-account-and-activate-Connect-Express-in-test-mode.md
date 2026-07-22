---
id: TASK-001
title: Set up Stripe platform account and activate Connect (Express) in test mode
status: To Do
assignee: []
created_date: '2026-07-22 22:31'
labels:
  - 'epic:stripe-platform'
  - ops
milestone: m-0
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Pub Market needs a Stripe platform account with Connect enabled before any seller can onboard or any real checkout can run. This is the first step to closing Phase 2 (currently code-complete but blocked on live Stripe config — see docs/ingenieria/handoff.md). Non-custodial constraint: funds must never land in a platform-controlled balance; this account setup is purely the container for direct/destination charges with application_fee, not a money-holding account.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Stripe platform account created (test mode)
- [ ] #2 Stripe Connect activated with Express account type enabled
- [ ] #3 Platform branding and application fee configuration recorded for reference
- [ ] #4 No live/production Stripe keys used at this stage — test mode only
- [ ] #5 Setup steps and account details documented in docs/ingenieria/ for handoff
<!-- AC:END -->
