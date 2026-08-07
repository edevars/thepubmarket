---
id: TASK-058.01
title: Rewrite /fees narrative in plain language
status: Done
assignee:
  - claude
created_date: '2026-08-07 22:20'
updated_date: '2026-08-07 22:27'
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
- [x] #1 Every section opens with the question it answers in plain Spanish; no unexplained jargon (config A/B, GMV, take, break-even, paridad all introduced before use)
- [x] #2 A 30-second summary block near the top states the hidden cost, the fix, and the recommendation
- [x] #3 The two Stripe configurations are explained in plain words before the five options reference them
- [x] #4 Model values unchanged: page still reproduces scripts/fee-model.mjs output at defaults
- [x] #5 Deck routes untouched; build and curl smoke pass; deployed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Copy-only rewrite on branch task/TASK-058.01-plain-narrative (model untouched). New narrative arc — each section answers one question: (1) hero "¿Cuánto cobrar de comisión?" with proof reframed as "de cada $100 vendidos te quedan $X"; (2) new "En 30 segundos" block: hidden cost → fix → recommendation; (3) "Cómo leer los números" replaces the assumptions strip, plain bullets; (4) new block explaining the two Stripe configs in plain words (hoy tú absorbes ~$4.20 de cada $100 / propuesta: lo paga el vendedor como en TCGplayer) before anything references them; (5) five options with plain titles/notes and plain stat labels; (6) scenario table renamed "¿Cuánto ganarías al mes?" with Arranque/Tracción/Escala; (7) "el tope" explains the 87% seller floor before the simulator's parity chip; (8) simulator labels in plain Spanish; (9) sensitivity "¿Y si las cosas salen distinto?" with plain row labels; (10) MSI and decisions in plain words. Verify model parity (node eval of page JS vs script), curl smoke, build, deploy, close subtask.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reconciled with an external cleanup found on disk (prettier formatting + hand container switched to semantic ul/li) — kept both. Verification: node eval of page model still yields P4 Base $21,844/6.6% and P0 $12,034/3.6% (matches scripts/fee-model.mjs); dry-run build passes; curl smoke dev+prod 200 with new fx-tldr/fx-configcard blocks present; deck route intact. Deployed version 979acff4.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Plain-language rewrite of the /fees page after user feedback ("no le entiendo nada"). Copy-only — model and numbers untouched.

New narrative arc, each section opens with the question it answers: ¿Cuánto cobrar por cada venta? (hero, with "de cada $100 vendidos te quedan $X" instead of take %) → En 30 segundos (hidden cost → fix → recommendation) → Cómo leer los números → ¿Quién le paga a Stripe? (the two Connect configs explained as "hoy"/"propuesta" with per-$100 costs, before anything references them) → Cinco formas de cobrar, de peor a mejor (plain card titles/notes) → ¿Cuánto ganarías al mes? (Arranque/Tracción/Escala) → ¿Por qué no cobrar más? (the 87-per-100 seller floor explained before the simulator uses it) → Muévele a los números (plain slider labels, parity chip reworded "competitivo para el vendedor") → ¿Y si las cosas salen distinto? (plain what-if rows) → MSI warning → three next steps → caveats.

Jargon eliminated or introduced before use: GMV, take rate, break-even, paridad, config A/B, singles. Reconciled an on-disk cleanup (prettier + semantic ul/li hand container). Verified model parity, build, dev+prod smoke; deployed.
<!-- SECTION:FINAL_SUMMARY:END -->
