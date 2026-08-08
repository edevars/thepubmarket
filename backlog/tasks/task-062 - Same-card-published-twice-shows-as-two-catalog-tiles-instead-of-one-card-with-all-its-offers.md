---
id: TASK-062
title: >-
  Same card published twice shows as two catalog tiles instead of one card with
  all its offers
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-08 04:40'
updated_date: '2026-08-08 04:42'
labels:
  - 'epic:catalog-filter-console'
  - web
  - api
  - bug
milestone: m-3
dependencies:
  - TASK-053
  - TASK-057
  - TASK-059
references:
  - 'https://thepubmarket.com/catalog/9bf83b8a-4fc5-4174-97c8-37e88581d873'
  - apps/web/src/lib/catalog/data.ts
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/detail/CardDetailView.tsx
  - apps/api/src/routes/catalog.ts
  - apps/web/src/lib/api.ts
priority: high
type: bug
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A buyer browsing the catalog sees the same card more than once when a store publishes it in several conditions. In production, Rengar - Pridestalker (riftbound UNL-183, es, foil) is listed twice by The Pub Game Store — HP $700 and LP $1400 — and both appear as separate tiles in the grid, each linking to its own detail page. Nothing on either page tells the buyer the other offer exists.

The catalog is listing-oriented end to end: the grid renders one tile per inventory row, and the detail page's "other listings" block is built client-side by scanning whatever inventory happened to fit in the first page of the catalog fetch. That scan matches on oracle id or card name, so it both misses real siblings (with 1009 active listings and a 200-row page, a card late in the alphabet never sees its own siblings) and lumps in cards that are not the same product (in MTG, oracle id spans every printing across every set).

Desired outcome: one tile per card in the catalog, and a card page that shows every price and condition published for that exact card. Product identity is the printing plus language plus finish — foil and non-foil, or English and Spanish, of the same printing remain distinct products, since that is what the buyer actually receives. Among the offers of a card, the one shown in the grid is the one whose price is closest to the average of that card's offers, so the catalog price reads as representative rather than as whichever row sorted first.

Scope covers the catalog grid, the store (seller) inventory grid, home rows, related cards, and the card detail page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A card published more than once by the same store appears exactly once in the catalog grid, with the remaining offers reachable from its card page
- [ ] #2 Two listings of the same printing that differ in finish or language remain separate tiles, each showing its own finish and language badge truthfully
- [ ] #3 The offer shown in the grid for a card is the one whose price is closest to the average price of that card's offers; ties resolve deterministically and the rule is documented
- [ ] #4 The card page lists every active offer for that exact card (printing + language + finish) with its price, condition, quantity and store, including offers outside the first page of the catalog fetch
- [ ] #5 The card page's offer list no longer includes listings of other printings or other games that merely share a name or oracle id
- [ ] #6 Home rows, related cards and the store inventory grid show one tile per card under the same rule
- [ ] #7 Result counts and facet counts stay coherent with what the grid shows, and filtering by condition, language, finish or price still selects the matching offers
- [ ] #8 Grouping and representative-offer selection are covered by unit tests, including the tie case and listings with a missing catalog id
- [ ] #9 API-side lookup of every offer for a printing is covered by tests in the catalog route suite
- [ ] #10 docs/ingenieria catalog documentation describes the card-identity rule and the representative-offer rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. API (`apps/api/src/routes/catalog.ts`): add a `catalogId` query param to `GET /catalog` that matches the printing id against `catalog_id` or the legacy `scryfall_id` column (both indexed), so the card page can pull every offer of a printing without the 200-row page truncation. Parsing helper stays pure and unit-tested in `catalog.test.ts`.
2. Web data layer: new pure module `lib/catalog/grouping.ts` with the card identity key (`tcg | catalogId | language | finish`, falling back to the listing id when the printing id is missing so unrelated rows never merge), `groupByCard`, `dedupeByCard` and `pickRepresentative` (closest to the mean price; ties → lower price → lower id). Unit tests alongside.
3. `lib/api.ts` + `lib/catalog/data.ts`: forward `catalogId`; rewrite `getPurchaseOptions` to fetch the printing's offers from the API and keep only those sharing the card key; dedupe `getFeatured`/`getNewArrivals`/`getHeroCards`/`getRelated`.
4. `CatalogView` / `SellerInventory`: group after filtering, render one tile per card, and pass the group to `CardGrid` → `ProductCard` so a card with several offers shows "N ofertas · desde $X".
5. `facet-counts.ts`: count distinct cards instead of listings so the sidebar numbers match the grid.
6. `CardDetailView`: render the offers block only when the card has more than one offer, list them price-ascending with quantity, and mark the one being viewed.
7. i18n keys in `messages/es.json` + `messages/en.json`; docs in `docs/ingenieria/`.
8. Checks: vitest (web + api), `pnpm typecheck`, `pnpm lint`, and a local curl pass against the new API param.
<!-- SECTION:PLAN:END -->
