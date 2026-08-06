---
id: TASK-033
title: 'Front store: server-side game filter and per-game navigation'
status: In Progress
assignee:
  - Claude
created_date: '2026-08-06 02:20'
updated_date: '2026-08-06 03:12'
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
- [ ] #1 The catalog API accepts a game filter and returns only listings for that game
- [ ] #2 The catalog page reads a game parameter from the URL and the filter sidebar reflects it in sync
- [ ] #3 Home browse-by-game tiles deep-link to the per-game catalog view; games with zero items keep the 'Pronto' state
- [ ] #4 Existing q/set/seller filters compose correctly with the game filter
- [ ] #5 Tests cover the API filter; web changes verified via typecheck/lint per repo practice
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
