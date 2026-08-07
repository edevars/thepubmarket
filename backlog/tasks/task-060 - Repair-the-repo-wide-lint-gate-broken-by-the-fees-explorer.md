---
id: TASK-060
title: Repair the repo-wide lint gate broken by the fees explorer
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 22:08'
labels:
  - chore
  - pitch
milestone: m-3
dependencies:
  - TASK-058
references:
  - apps/pitch/public/fees/fees.js
  - apps/pitch/public/fees/index.html
  - scripts/fee-model.mjs
  - biome.json
priority: high
type: chore
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`pnpm lint` fails on main, so the standard verification gate is red for every task that follows. The failures all come from the fee-analysis explorer landed in TASK-058: the static assets under apps/pitch/public/fees and the scripts/fee-model.mjs generator were never run through Biome.

Fourteen findings across formatting, string concatenation that should be template literals, iterable callbacks that do not return consistently, and non-semantic elements carrying ARIA roles in the fees markup.

A red lint gate is corrosive beyond the specific findings: it trains everyone to skip the check, which is how the next real defect slips through. The point of this task is to get `pnpm lint` back to green so the gate means something again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pnpm lint exits clean on a fresh checkout of main, with no findings left in apps/pitch or scripts
- [ ] #2 Elements carrying ARIA roles in the fees markup are replaced with the semantic element that already conveys that role, rather than suppressing the rule
- [ ] #3 Iterable callbacks return consistently instead of mixing a value and a bare statement
- [ ] #4 The fees explorer still renders and behaves identically after the changes — the repair is stylistic and must not alter the fee maths or the interaction
- [ ] #5 pnpm typecheck, pnpm turbo run test and pnpm build stay green
<!-- AC:END -->
