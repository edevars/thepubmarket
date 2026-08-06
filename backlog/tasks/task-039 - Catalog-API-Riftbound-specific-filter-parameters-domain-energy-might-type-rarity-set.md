---
id: TASK-039
title: >-
  Catalog API: Riftbound-specific filter parameters (domain, energy, might,
  type, rarity, set)
status: To Do
assignee: []
created_date: '2026-08-06 05:44'
labels:
  - 'epic:riftbound-ux'
  - api
milestone: m-3
dependencies:
  - TASK-038
references:
  - apps/api/src/routes/catalog.ts
  - apps/api/src/lib/inventory.ts
  - packages/shared/src/index.ts
  - apps/api/src/routes/catalog.test.ts
priority: high
type: feature
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GET /catalog today only supports q, tcg, set, seller, limit, offset — no game-specific filter params exist anywhere in the API. To give the public Riftbound catalog real filtering (the core of the `epic:riftbound-ux` epic), the API must accept Riftbound attribute filters that operate on the metadata exposed by TASK-038 (inventory card_attributes / catalog_cards game_attributes).

Outcome: the public catalog endpoint supports filtering Riftbound listings by domain(s), energy, might, card type, supertype, rarity, and set, combinable with the existing params, with a filter design generic enough that a future TCG (e.g. MTG colors, Pokémon types) can add its own attribute filters without reshaping the API.

Depends on TASK-038, which exposes game attributes, rarity, and set metadata in catalog responses and defines the game-agnostic metadata contract these filters operate on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GET /catalog accepts Riftbound filters — domain(s), energy, might, card type, supertype, rarity, set — combinable with existing q/tcg/seller/limit/offset params
- [ ] #2 Invalid filter values return 400 with the supported values, consistent with the existing invalid_tcg error shape
- [ ] #3 Game-specific filters apply only when tcg=riftbound; behavior when passed with another game (or none) is explicit and documented (rejected or ignored, one rule)
- [ ] #4 Edge cases covered: multi-domain cards match any selected domain, null energy/might handled, filters compose with q and seller correctly
- [ ] #5 Typecheck, biome, and vitest green with tests for each filter, combinations, and the error cases
<!-- AC:END -->
