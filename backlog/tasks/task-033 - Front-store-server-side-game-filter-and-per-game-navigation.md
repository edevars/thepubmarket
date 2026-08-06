---
id: TASK-033
title: 'Front store: server-side game filter and per-game navigation'
status: To Do
assignee: []
created_date: '2026-08-06 02:20'
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
