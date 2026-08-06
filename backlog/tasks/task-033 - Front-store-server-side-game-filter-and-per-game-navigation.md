---
id: TASK-033
title: 'Front store: server-side game filter and per-game navigation'
status: Done
assignee:
  - Claude
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 03:17'
labels:
  - 'epic:riftbound'
  - web
  - api
milestone: m-3
dependencies: []
references:
  - apps/api/src/routes/catalog.ts
  - apps/web/src/lib/catalog/data.ts
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/FilterSidebar.tsx
  - apps/web/src/components/home/BrowseByGame.tsx
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
priority: medium
type: feature
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GET /catalog (apps/api/src/routes/catalog.ts:41-93) supports only q/set/seller/limit/offset — no game filter. Game filtering happens entirely client-side after fetching up to 200 items (apps/web/src/lib/catalog/data.ts:17-18, applyFilters 35-47; CatalogView.tsx game counts 50-57 and chips 103-107; FilterSidebar.tsx 92-121). The catalog page (apps/web/src/app/[locale]/catalog/page.tsx) only reads ?q=, and every home "browse by game" tile links to bare /catalog (apps/web/src/components/home/BrowseByGame.tsx:27). With a second game (Riftbound) going live, the store needs a server-side game filter and shareable per-game URLs so each TCG can be browsed directly and the 200-item client-side cap stops distorting results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The catalog API accepts a game filter and returns only listings for that game
- [x] #2 The catalog page reads a game parameter from the URL and the filter sidebar reflects it in sync
- [x] #3 Home browse-by-game tiles deep-link to the per-game catalog view; games with zero items keep the 'Pronto' state
- [x] #4 Existing q/set/seller filters compose correctly with the game filter
- [x] #5 Tests cover the API filter; web changes verified via typecheck/lint per repo practice
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Move the game filter from client-side array state to a server-side, URL-driven single-game filter, and add a facets endpoint so the sidebar keeps showing every game's count even when the list is already filtered.

**Why facets are needed:** once the server pre-filters by game, the sidebar's counts (derived from the loaded items) would only ever show the active game, and the shopper could never switch games from the sidebar. A cheap `GROUP BY tcg` endpoint over all active inventory keeps every game visible and also lets the home tiles show real counts.

## Steps

1. **API — `apps/api/src/routes/catalog.ts`**
   - `GET /catalog` accepts `tcg`; validated against `TCGS` via an exported `parseTcgParam` helper (unknown value → 400 `invalid_tcg`, absent → no filter). Composes with the existing `q`/`set`/`seller` filters.
   - New `GET /catalog/games` → `{ items: [{ tcg, count }] }` over active + in-stock rows. **Must be registered before `/:id`** or Hono matches it as an item id.
2. **Shared contract** — `CatalogGameCount` + `CatalogGamesResponse` in `packages/shared/src/index.ts`.
3. **Web data layer** — `fetchCatalog({ tcg })` and `fetchCatalogGameCounts()` in `lib/api.ts`; `getCatalog({ tcg })` forwards the game to the API in `lib/catalog/data.ts` (the rest of `applyFilters` stays client-side), plus `getGameCounts()`. Mocks keep working by filtering locally.
4. **Catalog page** — reads `?game=`, validates it against `TCGS` (invalid → treated as no filter), passes `activeGame` and the game counts to `CatalogView`, and keys the client component on `game` + `q` so filter state resets on navigation.
5. **CatalogView / FilterSidebar** — the game section becomes single-select navigation: clicking a game pushes `/catalog?game=x` (clicking the active one clears it), preserving `q`. `filters.tcgs` client state is removed; the active game renders as a chip whose removal navigates back to `/catalog`.
6. **BrowseByGame** — tiles deep-link to `/catalog?game=<tcg>`; games with zero items stay non-navigable with the "Pronto" label.
7. **Tests** — unit tests for `parseTcgParam` (valid, unknown, absent, case) in `apps/api/src/routes/catalog.test.ts`; live smoke of both endpoints; typecheck + lint for the web side per project practice.

## Risks
- Route ordering (`/games` before `/:id`) is the one real trap; the smoke covers it explicitly.
- Removing `filters.tcgs` touches `ActiveChips`, `FilterSidebar` props and `clearAll`; the "clear all" action must also drop the game from the URL.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design consequence found while planning: moving the game filter server-side would have broken the sidebar. Its counts were derived from the loaded items, so once the server pre-filters, only the active game would show a count and the shopper could never switch games. Added `GET /catalog/games` (a GROUP BY over active + in-stock rows) so the sidebar and the home tiles always see every game's real count, independent of the active filter. That endpoint MUST be registered before `/catalog/:id` or Hono resolves 'games' as an item id — verified explicitly in the smoke (HTTP 200, not 404).

The game filter became single-select URL navigation instead of client-side multi-select array state: `filters.tcgs` was removed from `FilterState`, `CatalogFilters.tcgs: Tcg[]` became `CatalogFilters.tcg?: Tcg`, and clicking a game pushes `/catalog?game=x` (clicking the active one clears it) while preserving `q`. 'Clear all' also drops the game from the URL, otherwise the catalog would stay silently narrowed. An unknown `?game=` value is ignored client-side (old links fall back to the full catalog) while the API rejects an unknown `tcg` with 400 `invalid_tcg` — deliberate asymmetry: a bad API filter must not look like 'this game has no cards'.

`SellerInventory` was the one collateral consumer: it multi-selects games client-side over an already-loaded store inventory, a genuinely different use case from the catalog's server-side single-select. Rather than keeping both shapes in the shared `CatalogFilters`, it now filters tcgs itself alongside the setCode filter it already handled that way.

Verification: 111 API tests (5 new for parseTcgParam), typecheck + biome clean. Live smoke with one temporary Riftbound row: /catalog/games returned mtg 20 / riftbound 1; ?tcg=riftbound → 1 item, only riftbound; ?tcg=mtg → 20, only mtg; unfiltered → 21, both; ?tcg=digimon → invalid_tcg; composition with q verified both ways (tcg=riftbound&q=Jinx → 1 hit; tcg=riftbound&q=Ritual, an MTG-only card, → 0). Cleanup deleted the single row by its exact id and local D1 was re-verified at 20 rows, zero non-MTG.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

The store can now be browsed one game at a time, with the filtering done in SQL instead of in the browser.

- **apps/api/src/routes/catalog.ts** — `GET /catalog` accepts `tcg`, validated by an exported `parseTcgParam` (unknown → 400 `invalid_tcg`), composing with the existing `q`/`set`/`seller` filters. New `GET /catalog/games` returns per-game counts over all available inventory, registered before `/:id` so it is not swallowed as an item id.
- **packages/shared/src/index.ts** — `CatalogGameCount` / `CatalogGamesResponse`.
- **apps/web/src/lib/api.ts, lib/catalog/data.ts** — `fetchCatalog({ tcg })`, `fetchCatalogGameCounts()`, and `getCatalog({ tcg })` forwarding the game to the API; `CatalogFilters.tcgs: Tcg[]` became `tcg?: Tcg`.
- **apps/web/src/app/[locale]/catalog/page.tsx** — reads `?game=`, ignores unknown values, and loads list + game counts in parallel.
- **CatalogView / FilterSidebar** — the game section is single-select navigation driven by the URL; the active game shows as a removable chip and "clear all" drops it from the URL too.
- **BrowseByGame** — tiles deep-link to `/catalog?game=<tcg>`; games with no stock stay non-navigable with the "Pronto" label.
- **SellerInventory** — keeps its own multi-select game filter locally, since a store's inventory page is a different use case from the catalog.

## Tests / verification

5 new unit tests for `parseTcgParam` (every supported game, blank/absent, trimming, unknown value, case sensitivity); suite 111/111 green; typecheck + biome clean. Live smoke with a temporary Riftbound listing confirmed the facets endpoint, per-game filtering, the unfiltered total, `invalid_tcg`, composition with `q` in both directions, and that `/catalog/games` is not matched as an item id.

## Risks / follow-ups

- The 200-item fetch cap now applies per game rather than across the whole catalog, which is the point, but real pagination is still Phase 5 work.
- Riftbound-specific attributes are still not shown on the detail page (TASK-034), and the seed script remains MTG-only (TASK-035).
<!-- SECTION:FINAL_SUMMARY:END -->
