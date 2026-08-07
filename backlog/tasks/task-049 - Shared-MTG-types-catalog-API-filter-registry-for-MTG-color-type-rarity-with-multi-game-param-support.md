---
id: TASK-049
title: >-
  Shared MTG types + catalog API filter registry for MTG (color, type, rarity)
  with multi-game param support
status: Done
assignee:
  - '@claude'
created_date: '2026-08-07 00:01'
updated_date: '2026-08-07 00:17'
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
modified_files:
  - packages/shared/src/index.ts
  - apps/api/src/lib/catalog-filters.ts
  - apps/api/src/lib/catalog-filters.test.ts
  - apps/api/src/lib/scryfall.ts
  - apps/api/src/lib/scryfall.test.ts
  - apps/api/src/lib/inventory.ts
  - apps/api/src/routes/catalog.ts
  - docs/ingenieria/catalogo-multijuego.md
  - apps/web/src/components/detail/game-attributes.ts
  - apps/web/src/components/panel/AddCardFlow.tsx
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
- [x] #1 GET /catalog?tcg=mtg&color=R,G, &type=creature, and &rarity=mythic filter correctly; wrong-tcg / absent-tcg / out-of-vocabulary values follow the documented 400 rules; all existing riftbound filter tests are green unmodified
- [x] #2 A freshly created MTG listing (POST /admin/inventory) persists populated card_attributes
- [x] #3 InventoryItem.createdAt is present in /catalog responses
- [x] #4 docs/ingenieria/catalogo-multijuego.md documents the multi-game param registration semantics (Map<string, Tcg[]>)
- [x] #5 pnpm typecheck, vitest, and biome are green across api and shared
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Registry multi-juego.** `ALL_GAME_PARAMS` pasó de `Map<string, Tcg>` a `Map<string, ParamRegistration>` con `{ firstTcg, allTcgs }`. `firstTcg` se precomputa en construcción (orden de declaración en `GAME_FILTERS`: riftbound antes que mtg) en vez de indexar `allTcgs[0]` en uso, para no chocar con `noUncheckedIndexedAccess`/`noNonNullAssertion` de Biome. La decisión de si un param necesita spec se resuelve SIEMPRE contra `GAME_FILTERS[activeTcg]`, nunca contra qué otro juego registró el nombre — ese es el fix del invariante.

**Facets MTG.** `color` jsonArray `$.colors`, `type` jsonArray `$.types` (no jsonScalar: una carta puede ser "Artifact Creature"), `rarity` columna `inventory.rarity`. `set` sigue siendo genérico top-level.

**Pipeline Scryfall.** `buildMtgAttributes` en `scryfall.ts`: colores del top-level o unión de `card_faces[].colors`, vacío → `['C']`; tipos del `type_line` de la cara frontal intersectados con `MTG_CARD_TYPES`; `manaValue` de `cmc`. Claves KV bumpeadas a `:v2:` para que expiren los snapshots viejos sin atributos.

**createdAt.** Se mapea en `rowToInventoryItem` (`apps/api/src/lib/inventory.ts`) desde `inventory.createdAt` (Drizzle `...timestamps`, `integer('created_at')` con `unixepoch()`). Se expone en **segundos unix**, no milisegundos, para seguir la convención existente de `OrderSummary.createdAt`; documentado en el tipo compartido. TASK-053 debe multiplicar por 1000 si necesita `Date`.

**Reestructuración de tests (validada por task-verifier).** El loop viejo de `filter_requires_tcg` asertaba que `type`/`rarity` daban 400 incluso con `tcg=mtg` — esa garantía se retira a propósito porque MTG ahora registra legítimamente esos nombres. Verificado que sigue en pie: params exclusivos de riftbound (domain/supertype/energy/might) intactos; `type`/`rarity` sin tcg siguen dando `filter_requires_tcg` con `requiresTcg: 'riftbound'`; vocabulario cruzado sigue dando `invalid_filter` con la lista `supported` del juego correcto; nada que antes fuera 400 se acepta en silencio.

**Fuera del alcance declarado, necesario:** `apps/web/src/components/detail/game-attributes.ts` y `components/panel/AddCardFlow.tsx` requirieron guards `tcg === 'riftbound'` al volverse `CardGameAttributes` una unión real. Solo narrowing, sin UI nueva de atributos MTG.

Checks: typecheck verde en los 5 paquetes, biome limpio, 204 tests API + 67 web verdes. Verificado por task-verifier (PASS en las 5 AC, sin hallazgos). No se tocó código de pagos ni flujo de fondos.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
MTG pasa de no tener ningún filtro específico a tener el contrato completo en API y tipos compartidos.

Se agregó la variante `MtgAttributes` a `CardGameAttributes` con los vocabularios `MTG_COLORS`/`MTG_RARITIES`/`MTG_CARD_TYPES`, y se registraron los facets `color`, `type` y `rarity` para MTG en el registry del catálogo (`set` ya era genérico). El pipeline de Scryfall, que hasta ahora guardaba `gameAttributes: null` en toda carta MTG, ahora deriva colores (con unión de caras y fallback a incoloro), tipos y valor de maná; las claves de cache KV se bumpearon a `:v2:` para que expiren los snapshots viejos.

El cambio de compatibilidad importante: `ALL_GAME_PARAMS` era un `Map<string, Tcg>` en el que registrar `type`/`rarity` para MTG habría pisado silenciosamente las entradas de Riftbound y corrompido los errores `filter_requires_tcg`. Ahora rastrea todos los juegos que registran cada param, con el invariante de que un param válido para el TCG activo nunca da 400 por estar registrado en otro juego. Los 400 existentes de Riftbound quedaron intactos y verificados.

También se expone `InventoryItem.createdAt` (segundos unix, siguiendo la convención de órdenes) que TASK-053 necesita para el orden "más recientes".

Verificado por task-verifier con PASS en las 5 AC y validación explícita de que la reestructuración de tests no debilitó ninguna garantía. Mergeado a main en 156c0b8.
<!-- SECTION:FINAL_SUMMARY:END -->
