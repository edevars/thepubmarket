---
id: TASK-051
title: 'Web facet registry: GAME_FACETS.mtg + cross-game facet scoping fix + i18n'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 00:01'
updated_date: '2026-08-07 00:18'
labels:
  - 'epic:catalog-visual-refactor'
  - web
milestone: m-3
dependencies:
  - TASK-049
references:
  - apps/web/src/lib/catalog/game-filters.ts
  - apps/web/src/lib/catalog/game-filters.test.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - docs/ingenieria/catalogo-multijuego.md
priority: high
type: feature
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor. The web facet registry (`apps/web/src/lib/catalog/game-filters.ts`) only has a riftbound entry; MTG renders no facet sections. The sidebar/view are registry-driven (docs/ingenieria/catalogo-multijuego.md §6/§8) — adding MTG facets must require zero component changes.

Outcome: MTG facets (color, type, rarity, set) render through the existing generic sidebar, URL parsing/purging works for MTG params, and a latent cross-game bug is fixed.

Scope:
- `GAME_FACETS.mtg = [ color (multiValue, MTG_COLORS, new labelKey 'fColor'), type (multiValue, MTG_CARD_TYPES, reuse 'fType'), rarity (multiValue, MTG_RARITIES, reuse 'fRarity'), set (freeText, reuse 'fSet') ]` with `valuesOf` narrowing `card.gameAttributes` to `tcg === 'mtg'` (mirror the existing riftbound narrowing helper); rarity/set read the shared column fields exactly as riftbound does.
- CRITICAL fix: `facetByParam` (line ~129) searches across ALL games and returns the first match — once mtg also registers `type`/`rarity`/`set`, `matchesGameFilters` can apply the wrong game's `valuesOf`. Scope matching to `facetsFor(item.tcg)`.
- i18n: add `catalog.fColor` to BOTH `apps/web/messages/es.json` ("Color") and `en.json` ("Color"); verify fType/fRarity/fSet read naturally for both games in both locales.
- Tests (`game-filters.test.ts`): assert the mtg ordered param list `['color','type','rarity','set']`; the riftbound exact-order assertion `['domain','type','supertype','rarity','energy','might','set']` is FROZEN — mtg is appended as a new key, never interleaved; parse/serialize/match cases for mtg values incl. case-insensitivity; cross-game isolation (an mtg item never matches via the riftbound type facet and vice versa).

Depends on TASK-049 (shared MTG consts/types). Subagent: nextjs-frontend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /catalog?game=mtg&color=G&type=Creature server-renders with those facets active; switching to another game purges mtg params (existing purge-by-construction behavior preserved)
- [ ] #2 All existing riftbound facet tests are green unmodified; new mtg assertions (ordered param list, parsing, cross-game isolation) are green
- [ ] #3 es/en parity for every new message key; facet values keep translate="no"
- [ ] #4 pnpm typecheck, vitest, and biome are green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan (from approved epic plan; TASK-049 merged to main, provides MtgAttributes/MTG_COLORS/MTG_RARITIES/MTG_CARD_TYPES in packages/shared)

1. `apps/web/src/lib/catalog/game-filters.ts`: add `GAME_FACETS.mtg = [color (multiValue, MTG_COLORS, labelKey 'fColor'), type (multiValue, MTG_CARD_TYPES, reuse 'fType'), rarity (multiValue, MTG_RARITIES, reuse 'fRarity'), set (freeText, reuse 'fSet')]`. `valuesOf` narrows `item.card.gameAttributes` to `tcg === 'mtg'` (mirror the existing riftbound narrowing helper); rarity/set read the shared card columns exactly as riftbound does.
2. Fix `facetByParam` (~line 129): currently searches ALL games and returns first match. Scope it to `facetsFor(item.tcg)` so `matchesGameFilters` never applies the wrong game's `valuesOf` once mtg also registers type/rarity/set.
3. i18n: add `catalog.fColor` to both `messages/es.json` and `messages/en.json`.
4. Tests: assert mtg ordered param list `['color','type','rarity','set']`; the riftbound assertion `['domain','type','supertype','rarity','energy','might','set']` stays frozen — mtg is appended as a new registry key, never interleaved; parse/serialize/match cases incl. case-insensitivity; cross-game isolation (mtg item never matches via riftbound's type facet and vice versa).

Executed by nextjs-frontend subagent in an isolated worktree on branch task/TASK-051; verified by task-verifier before merge.
<!-- SECTION:PLAN:END -->
