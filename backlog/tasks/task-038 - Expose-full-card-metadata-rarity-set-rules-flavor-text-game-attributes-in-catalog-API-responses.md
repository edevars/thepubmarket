---
id: TASK-038
title: >-
  Expose full card metadata (rarity, set, rules/flavor text, game attributes) in
  catalog API responses
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 05:43'
updated_date: '2026-08-06 07:11'
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
- [ ] #1 Public catalog list and detail responses include rarity, set code/name, collector number, and game attributes (Riftbound: type, supertype, domains, energy, might) for listings that have them
- [ ] #2 Riftbound listing detail data includes rules text and flavor text sourced from the local catalog (catalog_cards)
- [ ] #3 Seller catalog search results (GET /seller/catalog/search) include the same metadata so printings can be disambiguated
- [ ] #4 MTG (Scryfall) responses remain backward-compatible; shared contract types in @thepubmarket/shared updated without breaking existing consumers
- [ ] #5 Typecheck, biome, and vitest suites green with tests covering the new fields for both riftbound and mtg paths
<!-- AC:END -->
