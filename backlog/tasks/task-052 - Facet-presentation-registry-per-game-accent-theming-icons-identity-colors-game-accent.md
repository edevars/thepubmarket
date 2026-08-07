---
id: TASK-052
title: >-
  Facet presentation registry + per-game accent theming (icons, identity colors,
  --game-accent)
status: Done
assignee:
  - '@claude'
created_date: '2026-08-07 00:02'
updated_date: '2026-08-07 01:13'
labels:
  - 'epic:catalog-visual-refactor'
  - web
milestone: m-3
dependencies:
  - TASK-048
  - TASK-051
references:
  - apps/web/src/lib/catalog/game-filters.ts
  - apps/web/src/lib/catalog/display.ts
  - docs/ingenieria/catalogo-multijuego.md
modified_files:
  - apps/web/src/lib/catalog/facet-presentation.ts
  - apps/web/src/lib/catalog/facet-presentation.test.ts
priority: medium
type: feature
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor. Filter values need icons and identity colors (mana pips, rune icons, domain hexes) without polluting the functional facet registries — the registry-driven genericity of docs/ingenieria/catalogo-multijuego.md §6/§8 must survive.

Outcome: a parallel, presentation-only registry that maps tcg+param+value to icon path and hex color, plus a per-game accent color, consumed later by the sidebar refactor. Pure lib module, fully unit-testable (vitest excludes .tsx — no React imports).

Scope — new `apps/web/src/lib/catalog/facet-presentation.ts`:
- `FACET_PRESENTATION: Partial<Record<Tcg, Record<param, { layout?: 'pips'|'tiles'; values: Record<value, { icon?: string; hex?: string }> }>>>` with icon paths under `/symbols/...` (from TASK-048).
- MTG color pips (layout 'pips'): W `#e9e7d7`, U `#4e8fd1`, B `#9a8fa8`, R `#d3583c`, G `#4aa66a`, C `#a7b0b6` (dark-bg tuned identity hexes) + `/symbols/mtg/{code}.svg`.
- MTG rarity: common `#9fa8ad`, uncommon `#b3c4d3`, rare `#d4b95e`, mythic `#e06a33`.
- Riftbound domains: official hexes extracted from riftbound.gg's bundle — Fury `#c13b3b`, Calm `#4fae6b`, Mind `#5b7bbd`, Body `#e2b06a`, Chaos `#8d5bbd`, Order `#f3d96b`, Colorless `#98a2a8` + `/symbols/riftbound/domain/{name}.svg`.
- Riftbound rarity icons from `/symbols/riftbound/rarity/` (showcase has no icon — text fallback, documented gap).
- `GAME_ACCENT: Partial<Record<Tcg, string>>` = `{ mtg: '#d9a92f', riftbound: '#e0653a' }` (amber mana-gold / ember).
- Helpers `presentationFor(tcg, param, value)` and `accentFor(tcg)` — never throw; missing entry → undefined → plain tile. Condition hexes stay in `display.ts` (already exist); this module is facet-value-scoped only.
- Unit tests: every multiValue facet value in GAME_FACETS for mtg/riftbound has a presentation entry or an explicitly documented gap (supertype/energy/might are intentionally icon-less); all hexes are valid 6-digit colors; accentFor returns undefined for the 4 accent-less games.

Depends on TASK-048 (icon files must exist at the referenced paths) and TASK-051 (GAME_FACETS.mtg exists for the coverage test). Runs parallel with TASK-053 (URL/sort/counts). Subagent: nextjs-frontend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pure module with no React import, fully covered by vitest
- [x] #2 Missing entries degrade to the plain tile: helpers return undefined and never throw
- [x] #3 Coverage test: every multiValue value of mtg/riftbound facets has an entry or a documented intentional gap; hexes validate as 6-digit colors
- [x] #4 accentFor returns undefined for pokemon/yugioh/onepiece/lorcana
- [x] #5 pnpm typecheck, vitest, and biome are green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Plan (deps TASK-048/TASK-051 both Done and merged to main):
1. New `apps/web/src/lib/catalog/facet-presentation.ts`: FACET_PRESENTATION registry (mtg + riftbound), GAME_ACCENT, presentationFor()/accentFor() helpers per spec in description — never throw, undefined on miss.
2. Reuse Tcg type + GAME_FACETS from game-filters.ts to build the coverage test (every multiValue value has entry or documented gap: mtg supertype n/a since mtg has no supertype facet param, riftbound supertype/energy/might intentionally icon-less).
3. Icon paths reference existing files from TASK-048 (/symbols/mtg/*.svg, /symbols/riftbound/domain/*.svg, /symbols/riftbound/rarity/*.svg) — verify paths match what's actually on disk.
4. Unit tests in facet-presentation.test.ts: no React import, hex validation regex, coverage loop over GAME_FACETS, accentFor undefined for pokemon/yugioh/onepiece/lorcana.
5. pnpm typecheck, vitest, biome green.
Executed by nextjs-frontend subagent in isolated worktree on branch task/TASK-052; verified by task-verifier before merge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
`facet-presentation.ts`: FACET_PRESENTATION cubre mtg.color (layout 'pips', hexes dark-bg-tuned + /symbols/mtg/{code}.svg), mtg.rarity (solo hex, no hay iconos de rareza MTG), riftbound.domain (7 dominios, hex oficial + /symbols/riftbound/domain/{name}.svg), riftbound.rarity (common/uncommon/rare/epic con icono; showcase queda fuera intencionalmente — sin asset desde TASK-048). GAME_ACCENT solo mtg/riftbound. presentationFor/accentFor nunca lanzan (guard clauses + early return undefined).

Coverage test itera facetsFor(tcg) real de game-filters.ts (no una copia hardcodeada) y exige entry o gap documentado en INTENTIONAL_GAPS: mtg.type (8 valores), riftbound.type (6), riftbound.supertype (4), riftbound.rarity.showcase. energy/might son multiInt, fuera de scope de FACET_PRESENTATION.

Verificado por task-verifier: PASS en las 5 AC. typecheck/vitest (86/86)/biome verdes en los 2 archivos nuevos (biome tiene 29 errores preexistentes en public/symbols/**/*.svg de TASK-048, no relacionados). Rutas de iconos confirmadas en disco. Mergeado a main en 900825b (merge commit posterior).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Registro de presentación de facets desacoplado del registro funcional: `apps/web/src/lib/catalog/facet-presentation.ts` mapea tcg+param+value a icono/hex (pips de maná MTG, hexes de rareza, dominios y rarezas de Riftbound) sin tocar `game-filters.ts`, más `GAME_ACCENT` para el acento por juego que consumirá el refactor del sidebar.

`presentationFor`/`accentFor` nunca lanzan — entrada desconocida degrada a `undefined` (tile plano). Cobertura de tests genera la lista de valores directamente desde `GAME_FACETS` real, así que no puede desincronizarse silenciosamente si se agregan nuevos valores a un facet; los gaps intencionales (mtg.type, riftbound.type/supertype, riftbound.rarity.showcase) quedan documentados explícitamente en el código.

Verificado por task-verifier con PASS en las 5 AC. Mergeado a main en 900825b.
<!-- SECTION:FINAL_SUMMARY:END -->
