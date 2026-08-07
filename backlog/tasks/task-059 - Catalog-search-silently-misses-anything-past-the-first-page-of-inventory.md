---
id: TASK-059
title: Catalog search silently misses anything past the first page of inventory
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-07 05:03'
labels:
  - 'epic:catalog-filter-console'
  - web
  - bug
milestone: m-3
dependencies:
  - TASK-053
  - TASK-057
references:
  - apps/web/src/lib/catalog/data.ts
  - 'apps/web/src/app/[locale]/catalog/page.tsx'
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/lib/api.ts
  - apps/api/src/routes/catalog.ts
  - docs/ingenieria/catalogo-multijuego.md
priority: high
type: bug
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Searching the catalog only matches within the first 200 items of a game, because the search term never reaches the API.

`loadActive` in apps/web/src/lib/catalog/data.ts builds its request with only `tcg` and `gameFilters`, then `applyFilters` matches the name client-side over whatever came back. Since the API returns items ordered by title ascending and the page size is 200, the searchable window for Riftbound is "Affectionate Poro" through "Jayce - Man of Progress" — roughly A through J. Everything after that is unreachable: searching "Rengar" returns nothing even though five Rengar listings are published and active.

The API already supports this correctly: `GET /catalog?q=` does a LIKE over the inventory title, and `fetchCatalog` in lib/api.ts already forwards a `q` param. The only missing link is that the data layer never passes it through, and the catalog page never supplies it.

There is a second-order effect to handle: once the server filters by the search term, the fetched set is already narrowed, so clearing the search from the active-filter chip must re-navigate rather than only clearing client state — otherwise the shopper is left looking at the narrowed set with no visible filter explaining it.

This is a pre-existing gap, not a regression from the filter console work. It matters because it makes more than half of each game's inventory undiscoverable by name, which is the primary way a shopper looks for a single.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Searching for a card whose title sorts after the first page of a game's inventory returns it — verified with a term that is currently unreachable, such as "Rengar" in Riftbound
- [ ] #2 The search term is applied by the API rather than by filtering an already-truncated page in the browser
- [ ] #3 Clearing the search from the active-filter chips restores the unfiltered catalog instead of leaving the shopper on the narrowed result set
- [ ] #4 Facet counts and the disabled rule stay correct while a search is active: counts reflect what is available within the search results
- [ ] #5 Switching games or changing any filter preserves the active search term, and the search term still survives the local-filter URL channel from TASK-053
- [ ] #6 A regression test covers that the search term is forwarded to the API rather than applied only client-side
- [ ] #7 pnpm typecheck, pnpm lint, pnpm turbo run test and pnpm build all pass
- [ ] #8 docs/ingenieria/catalogo-multijuego.md reflects how search is applied and what the remaining FETCH_LIMIT caveat does and does not cover
<!-- AC:END -->
