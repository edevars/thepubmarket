---
id: TASK-049
title: >-
  Shared MTG types + catalog API filter registry for MTG (color, type, rarity)
  with multi-game param support
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 00:01'
updated_date: '2026-08-07 00:04'
labels:
  - 'epic:catalog-visual-refactor'
  - api
  - shared
milestone: m-3
dependencies: []
references:
  - apps/api/src/lib/catalog-filters.ts
  - apps/api/src/lib/scryfall.ts
  - packages/shared/src/index.ts
  - docs/ingenieria/catalogo-multijuego.md
priority: high
type: feature
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of epic:catalog-visual-refactor. MTG has zero game-specific facets today: `CardGameAttributes` only has the Riftbound variant, `GAME_FILTERS.mtg` does not exist, and `normalizeCard` in `apps/api/src/lib/scryfall.ts` hardcodes `gameAttributes: null`, so MTG listings can never be filtered by color/type.

Outcome: the shared contract and API filter registry support MTG facets (color, type, rarity — `set` is already a generic top-level param), the Scryfall pipeline populates attributes for all future listings, and `createdAt` is exposed on catalog items (needed by the upcoming sort=newest).

Scope:
- `packages/shared/src/index.ts`: `MtgAttributes { tcg:'mtg'; colors: string[]; types: string[]; typeLine: string|null; manaValue: number|null }`; widen `CardGameAttributes = RiftboundAttributes | MtgAttributes`; consts `MTG_COLORS = ['W','U','B','R','G','C']`, `MTG_RARITIES = ['common','uncommon','rare','mythic']`, `MTG_CARD_TYPES = ['Artifact','Battle','Creature','Enchantment','Instant','Land','Planeswalker','Sorcery']`; add optional `createdAt?: number` to `InventoryItem` (additive, tolerant of stale cached items).
- `apps/api/src/lib/catalog-filters.ts`: add `GAME_FILTERS.mtg = [ color: jsonArray $.colors (MTG_COLORS), type: jsonArray $.types (MTG_CARD_TYPES — jsonArray, NOT jsonScalar: MTG cards carry multiple card types e.g. 'Artifact Creature'), rarity: column inventory.rarity (MTG_RARITIES) ]`.
- CRITICAL compatibility fix: `ALL_GAME_PARAMS` (line ~109) is `Map<string, Tcg>` built by flatMap — registering `type`/`rarity` for mtg silently overwrites the riftbound entries and corrupts the `requiresTcg` field of `filter_requires_tcg` errors. Rework to `Map<string, Tcg[]>`. Invariant: a param valid for the active tcg must NEVER 400 because another game also registers it. Existing 400 shapes (`filter_requires_tcg`, `invalid_filter` with `supported`) are asserted in `catalog-filters.test.ts` and documented in `docs/ingenieria/catalogo-multijuego.md` §6 — extend tests, never weaken; update the doc.
- `apps/api/src/lib/scryfall.ts`: `normalizeCard` builds `MtgAttributes` from the raw card (colors: union of `card_faces[].colors` when top-level absent; empty → `['C']` so the colorless filter needs no NULL special-casing; `types` parsed from front-face `type_line` against MTG_CARD_TYPES; `manaValue` from `cmc`). Bump KV cache key prefixes (`scryfall:card:` → `scryfall:card:v2:`, same for search) so stale attribute-less snapshots expire.
- `apps/api/src/routes/catalog.ts`: map `createdAt` into response items.
- Tests: MTG happy paths per filter kind, `color=w` case-insensitivity, `type=Creature&tcg=riftbound` → invalid_filter (riftbound vocab), `type=Creature` without tcg → filter_requires_tcg, per-game rarity vocabularies; scryfall attribute derivation (colorless, multi-face, multi-type). All existing riftbound tests stay green unmodified.

Subagent: cloudflare-worker-dev. No dependencies — runs parallel with the asset pipeline task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GET /catalog?tcg=mtg&color=R,G, &type=creature, and &rarity=mythic filter correctly; wrong-tcg / absent-tcg / out-of-vocabulary values follow the documented 400 rules; all existing riftbound filter tests are green unmodified
- [ ] #2 A freshly created MTG listing (POST /admin/inventory) persists populated card_attributes
- [ ] #3 InventoryItem.createdAt is present in /catalog responses
- [ ] #4 docs/ingenieria/catalogo-multijuego.md documents the multi-game param registration semantics (Map<string, Tcg[]>)
- [ ] #5 pnpm typecheck, vitest, and biome are green across api and shared
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Plan (from approved epic plan, collisions verified in source)

1. `packages/shared/src/index.ts`: MtgAttributes variant + MTG_COLORS/MTG_RARITIES/MTG_CARD_TYPES consts + optional InventoryItem.createdAt.
2. `apps/api/src/lib/catalog-filters.ts`: GAME_FILTERS.mtg (color jsonArray $.colors, type jsonArray $.types, rarity column). Rework ALL_GAME_PARAMS (line ~109) from Map<string,Tcg> to Map<string,Tcg[]> — flatMap currently lets mtg overwrite riftbound's type/rarity entries and corrupt filter_requires_tcg.requiresTcg. Invariant: param valid for active tcg never 400s because another game registers it too.
3. `apps/api/src/lib/scryfall.ts`: normalizeCard builds MtgAttributes (colors union card_faces, empty → ['C']; types from front-face type_line; manaValue from cmc). Bump KV cache key prefixes to :v2:.
4. `apps/api/src/routes/catalog.ts`: map createdAt.
5. Tests: extend catalog-filters.test.ts (mtg per-kind, case-insensitivity, cross-game vocab errors, 400 shapes) + scryfall derivation tests; riftbound tests untouched. Update docs/ingenieria/catalogo-multijuego.md §6.

Executed by cloudflare-worker-dev subagent in an isolated worktree on branch task/TASK-049; verified by task-verifier before merge.
<!-- SECTION:PLAN:END -->
