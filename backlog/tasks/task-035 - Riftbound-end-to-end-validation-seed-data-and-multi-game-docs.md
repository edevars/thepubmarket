---
id: TASK-035
title: 'Riftbound end-to-end validation, seed data, and multi-game docs'
status: To Do
assignee: []
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 02:20'
labels:
  - 'epic:riftbound'
milestone: m-3
dependencies:
  - TASK-032
  - TASK-033
references:
  - scripts/load-inventory.mjs
  - scripts/inventory-seed.json
  - docs/ingenieria/
documentation:
  - 'https://riftcodex.com/docs/'
priority: medium
type: task
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Close out epic:riftbound with proof the full flow works plus updated tooling and docs. The inventory seed tooling (scripts/load-inventory.mjs + scripts/inventory-seed.json, run via `pnpm inventory:load:local`) resolves entries only through the admin Scryfall search today; extend it to support Riftbound entries. Then validate the complete journey: a seller creates a Riftbound listing in the panel, it appears in the store filtered by game, the detail page renders, and a test-mode Stripe checkout completes (checkout is real Stripe test-mode; the non-custodial model — direct charges + application fee — is untouched by this epic). Document the multi-game catalog architecture in docs/ingenieria/ (Spanish, per existing docs practice): providers, snapshot contract, and how to add the next TCG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The seed script can load Riftbound entries by card name against the local environment
- [ ] #2 The MTG seed path has no regressions
- [ ] #3 Validation confirms panel → catalog → detail → test-mode checkout for a Riftbound listing, verified via curl/typecheck per project practice (no browser automation)
- [ ] #4 docs/ingenieria/ documents the multi-game catalog architecture: providers, snapshot contract, and steps to add the next TCG
<!-- AC:END -->
