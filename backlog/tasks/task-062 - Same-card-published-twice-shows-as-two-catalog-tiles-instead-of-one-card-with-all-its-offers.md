---
id: TASK-062
title: >-
  Same card published twice shows as two catalog tiles instead of one card with
  all its offers
status: Done
assignee:
  - '@claude'
created_date: '2026-08-08 04:40'
updated_date: '2026-08-08 04:59'
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
modified_files:
  - apps/api/src/lib/inventory.ts
  - apps/api/src/routes/catalog.ts
  - apps/api/src/routes/catalog.test.ts
  - apps/api/src/routes/sellers.ts
  - apps/web/src/lib/catalog/grouping.ts
  - apps/web/src/lib/catalog/grouping.test.ts
  - apps/web/src/lib/catalog/data.ts
  - apps/web/src/lib/catalog/data.test.ts
  - apps/web/src/lib/catalog/facet-counts.ts
  - apps/web/src/lib/catalog/facet-counts.test.ts
  - apps/web/src/lib/api.ts
  - apps/web/src/components/catalog/CatalogView.tsx
  - apps/web/src/components/catalog/CardGrid.tsx
  - apps/web/src/components/catalog/ProductCard.tsx
  - apps/web/src/components/detail/CardDetailView.tsx
  - apps/web/src/components/sellers/SellerInventory.tsx
  - 'apps/web/src/app/[locale]/catalog/[id]/page.tsx'
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - docs/ingenieria/catalogo-multijuego.md
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
- [x] #1 A card published more than once by the same store appears exactly once in the catalog grid, with the remaining offers reachable from its card page
- [x] #2 Two listings of the same printing that differ in finish or language remain separate tiles, each showing its own finish and language badge truthfully
- [x] #3 The offer shown in the grid for a card is the one whose price is closest to the average price of that card's offers; ties resolve deterministically and the rule is documented
- [x] #4 The card page lists every active offer for that exact card (printing + language + finish) with its price, condition, quantity and store, including offers outside the first page of the catalog fetch
- [x] #5 The card page's offer list no longer includes listings of other printings or other games that merely share a name or oracle id
- [x] #6 Home rows, related cards and the store inventory grid show one tile per card under the same rule
- [x] #7 Result counts and facet counts stay coherent with what the grid shows, and filtering by condition, language, finish or price still selects the matching offers
- [x] #8 Grouping and representative-offer selection are covered by unit tests, including the tie case and listings with a missing catalog id
- [x] #9 API-side lookup of every offer for a printing is covered by tests in the catalog route suite
- [x] #10 docs/ingenieria catalog documentation describes the card-identity rule and the representative-offer rule
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Card identity lives in one place: `cardKey` in `apps/web/src/lib/catalog/grouping.ts` — `tcg | catalogId | language | finish`, with a per-row fallback (`listing:<id>`) when the printing id is missing so two unidentifiable rows never merge. The API mirrors the same rule in SQL through `distinctCardCount` (`apps/api/src/lib/inventory.ts`) for the storefront's `singlesCount`.

Representative offer: closest to the arithmetic mean of the card's offer prices, ties resolved by lower price then lower id. With exactly two offers the tie is the rule, not the exception, so the cheaper one wins — which is also the one that does not disappoint when the buyer opens the card page.

Order of operations matters and is asserted in comments at both call sites: filter listings first, group second. Grouping first would drop cards from the grid because of an offer the buyer never asked to see, and could elect a representative that fails the active filters.

Facet counts now count distinct cards. A card with NM and HP offers counts 1 under each value — same semantics the multi-valued game facets already had — so the sidebar number equals the number of tiles that appear when the value is selected.

The card page fetches offers through the new `GET /catalog?catalogId=` instead of scanning the loaded catalog page, which is what made the old lookup blind past the first 200 listings. The param matches `catalog_id` OR the legacy `scryfall_id` column, both indexed, because the client sends whichever id the API already resolved for it.

Testing note on AC#9: `apps/api` has no Workers-runtime test harness (documented in `apps/api/vitest.config.ts` — route handlers are out of scope there), so the route suite covers `parseCatalogIdParam` and the endpoint itself was verified live against a local `wrangler dev` + D1: a seeded second offer of the same printing returned both offers, an unknown id returned 0, and a blank param stayed unfiltered.

Verified end to end against local API + web dev with a duplicate row seeded into D1 (Birds of Paradise, NM $180 and HP $90): catalog grid rendered 20 tiles for 21 listings with the badge "2 ofertas · desde $90"; both card pages showed "Ofertas de esta carta (2)", each linking to its sibling and marking itself "Viendo"; related cards excluded the sibling; store grid collapsed to 3 tiles and its header count matched. The seeded row was deleted afterwards.

UI audited with web-design-guidelines: added focus-visible rings on the offer-row links, `tabular-nums` on the price column (the block exists to compare prices), `aria-current` on the offer being viewed, and truncation on the grid badge.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
One tile per card in the catalog, and a card page that lists every price and condition published for that exact card.

Card identity is printing + language + finish, so the reported duplicate (Rengar - Pridestalker UNL-183 es/foil, HP $700 and LP $1400) collapses into a single tile, while foil vs non-foil and en vs es of the same printing stay separate products. The tile shows the offer whose price is closest to the average of that card's offers and announces the rest as "N ofertas · desde $X".

The card page's offer list is now fetched from the API by printing id (new `GET /catalog?catalogId=`) instead of scanning the first page of the catalog, which fixes two bugs at once: siblings past the 200-row page were invisible, and matching on oracle id or name pulled in other printings and other sets. The block only renders when a card actually has more than one offer.

Grouping is applied after filtering everywhere it appears — catalog grid, store inventory grid, home rows, related cards — and facet counts plus the public `singlesCount` now count cards, so every number on screen matches the tiles a buyer can see.
<!-- SECTION:FINAL_SUMMARY:END -->
