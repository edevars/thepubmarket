---
id: TASK-058.01
title: Rewrite /fees narrative in plain language
status: To Do
assignee: []
created_date: '2026-08-07 22:20'
labels:
  - 'epic:pricing'
  - pitch
milestone: m-0
dependencies: []
parent_task_id: TASK-058
priority: medium
type: enhancement
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User feedback on the shipped /fees page: "no le entiendo nada" — the narrative assumes the reader already knows the analysis (config A/B, take neto, GMV, break-even, paridad, P0–P4 shorthand, ex-IVA). Rewrite all copy so a reader with no context understands it on first read: every section opens by stating the question it answers in plain Spanish; jargon is either replaced (GMV → "ventas del mes") or explained inline on first use; money framed as "de cada $100 vendidos te quedan $X" instead of percentages where possible. Add a 30-second summary block and a plain explanation of the two Stripe configurations before the five options appear. Numbers and model stay untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every section opens with the question it answers in plain Spanish; no unexplained jargon (config A/B, GMV, take, break-even, paridad all introduced before use)
- [ ] #2 A 30-second summary block near the top states the hidden cost, the fix, and the recommendation
- [ ] #3 The two Stripe configurations are explained in plain words before the five options reference them
- [ ] #4 Model values unchanged: page still reproduces scripts/fee-model.mjs output at defaults
- [ ] #5 Deck routes untouched; build and curl smoke pass; deployed
<!-- AC:END -->
