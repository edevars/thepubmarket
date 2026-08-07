---
id: TASK-058.01
title: Rewrite /fees narrative in plain language
status: In Progress
assignee:
  - claude
created_date: '2026-08-07 22:20'
updated_date: '2026-08-07 22:20'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Copy-only rewrite on branch task/TASK-058.01-plain-narrative (model untouched). New narrative arc — each section answers one question: (1) hero "¿Cuánto cobrar de comisión?" with proof reframed as "de cada $100 vendidos te quedan $X"; (2) new "En 30 segundos" block: hidden cost → fix → recommendation; (3) "Cómo leer los números" replaces the assumptions strip, plain bullets; (4) new block explaining the two Stripe configs in plain words (hoy tú absorbes ~$4.20 de cada $100 / propuesta: lo paga el vendedor como en TCGplayer) before anything references them; (5) five options with plain titles/notes and plain stat labels; (6) scenario table renamed "¿Cuánto ganarías al mes?" with Arranque/Tracción/Escala; (7) "el tope" explains the 87% seller floor before the simulator's parity chip; (8) simulator labels in plain Spanish; (9) sensitivity "¿Y si las cosas salen distinto?" with plain row labels; (10) MSI and decisions in plain words. Verify model parity (node eval of page JS vs script), curl smoke, build, deploy, close subtask.
<!-- SECTION:PLAN:END -->
