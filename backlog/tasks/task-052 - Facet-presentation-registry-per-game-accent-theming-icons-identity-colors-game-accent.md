---
id: TASK-052
title: >-
  Facet presentation registry + per-game accent theming (icons, identity colors,
  --game-accent)
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-07 00:02'
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

Depends on TASK-048 (icon files must exist at the referenced paths) and TASK-051 (GAME_FACETS.mtg exists for the coverage test). Runs parallel with TASK-052. Subagent: nextjs-frontend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pure module with no React import, fully covered by vitest
- [ ] #2 Missing entries degrade to the plain tile: helpers return undefined and never throw
- [ ] #3 Coverage test: every multiValue value of mtg/riftbound facets has an entry or a documented intentional gap; hexes validate as 6-digit colors
- [ ] #4 accentFor returns undefined for pokemon/yugioh/onepiece/lorcana
- [ ] #5 pnpm typecheck, vitest, and biome are green
<!-- AC:END -->
