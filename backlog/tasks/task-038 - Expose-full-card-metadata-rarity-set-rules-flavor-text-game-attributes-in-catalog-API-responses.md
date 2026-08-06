---
id: TASK-038
title: >-
  Expose full card metadata (rarity, set, rules/flavor text, game attributes) in
  catalog API responses
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 05:43'
updated_date: '2026-08-06 07:17'
labels:
  - 'epic:riftbound-ux'
  - api
milestone: m-3
dependencies: []
references:
  - packages/shared/src/index.ts
  - apps/api/src/routes/catalog.ts
  - apps/api/src/lib/catalog-db.ts
  - apps/api/src/routes/seller-panel.ts
  - packages/db/src/schema.ts
priority: high
type: feature
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Riftbound's strict dotgg metadata already lives in D1 (`catalog_cards`: rarity, set, collector number, rules_text, flavor_text, game_attributes with type/supertype/domains/energy/might), but most of it never reaches the web app: the `CardSnapshot` contract and public catalog responses omit rules_text/flavor_text, and listing responses only carry `card_attributes` captured at publish time. The frontend cannot display or filter by Riftbound metadata without this.

Outcome: the full per-card metadata is available end-to-end through the API contract — public catalog (list + detail) and seller catalog search — in a game-agnostic shape, so downstream UI tasks (Riftbound filters, richer detail page, seller panel disambiguation) can build on it. This is the foundation task of the `epic:riftbound-ux` epic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Public catalog list and detail responses include rarity, set code/name, collector number, and game attributes (Riftbound: type, supertype, domains, energy, might) for listings that have them
- [x] #2 Riftbound listing detail data includes rules text and flavor text sourced from the local catalog (catalog_cards)
- [x] #3 Seller catalog search results (GET /seller/catalog/search) include the same metadata so printings can be disambiguated
- [x] #4 MTG (Scryfall) responses remain backward-compatible; shared contract types in @thepubmarket/shared updated without breaking existing consumers
- [x] #5 Typecheck, biome, and vitest suites green with tests covering the new fields for both riftbound and mtg paths
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented via the cloudflare-worker-dev subagent, validated and shipped by the dispatch loop.

Key design choice: rules_text/flavor_text are NOT added to the inventory snapshot columns. The seller search path gets them for free from `catalog_cards` via `rowToSnapshot`; the public detail route (`GET /catalog/:id`) enriches the stored snapshot with `getCardText(db, tcg, catalogId)` — a primary-key lookup run in parallel with the seller/photos queries, so no schema migration and no N+1 on the list route (list intentionally omits the texts; AC#2 scopes them to detail).

Rarity, set code/name, collector number and gameAttributes already flowed end-to-end through `rowToInventoryItem` (inventory snapshot columns) for public list + detail — AC#1 needed no code change, only test coverage proving it for both games. `catalogIdOf(row)` extracts the existing `catalogId ?? scryfallId ?? ''` fallback so the enrichment lookup and the snapshot share one definition.

Contract: `CardSnapshot.rulesText`/`flavorText` are optional (`?: string | null`) on purpose — old KV-cached Scryfall snapshots and providers that don't supply them (Scryfall today) simply omit the keys, so no consumer breaks (AC#4). Consumers must treat undefined and null the same.

Checks re-run from repo root by the dispatcher: typecheck (4 pkgs), biome (193 files clean), vitest 150 api + 28 web, all green. New tests: catalog-db.test.ts (rowToSnapshot + getCardText, both games), scryfall.test.ts (MTG leaves the new fields unset), extended inventory.test.ts.

Non-custodial: untouched — read-only catalog metadata.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Full per-card metadata now travels the whole API contract, game-agnostically:

- **packages/shared/src/index.ts** — `CardSnapshot` gains optional `rulesText`/`flavorText` (additive; absent = null semantics documented on the type).
- **apps/api/src/lib/catalog-db.ts** — `rowToSnapshot` copies both texts from `catalog_cards`, so `GET /seller/catalog/search` (Riftbound) returns them alongside the existing rarity/set/collector/gameAttributes; new `getCardText()` does a keyed `(tcg, catalog_id)` lookup of just the two text columns.
- **apps/api/src/routes/catalog.ts** — `GET /catalog/:id` runs `getCardText` in parallel with the seller/photos queries and merges the texts onto the card; a game without a local catalog (MTG) or a retired printing degrades to absent fields, never a failed request.
- **apps/api/src/lib/inventory.ts** — `catalogIdOf(row)` extracted so the enrichment lookup and the snapshot share the `catalogId ?? scryfallId` fallback.

Rarity, set code/name, collector number and gameAttributes already reached list + detail through the inventory snapshot; that's now pinned by tests for both games instead of being incidental.

## Verification

Typecheck, biome and vitest green (150 api + 28 web tests; ~25 new/extended across catalog-db.test.ts, scryfall.test.ts, inventory.test.ts). MTG path proven unchanged: `normalizeCard` leaves the new fields unset and the contract allows it.

## Notes for the epic

Downstream tasks (TASK-039 filters, TASK-042 detail page, TASK-043 seller panel) can rely on: search/detail carrying `gameAttributes` (type/supertype/domains/energy/might), and detail carrying `rulesText`/`flavorText`. The public **list** route does not carry the texts — by design; filters (TASK-039) should query D1, not the snapshot texts.
<!-- SECTION:FINAL_SUMMARY:END -->
