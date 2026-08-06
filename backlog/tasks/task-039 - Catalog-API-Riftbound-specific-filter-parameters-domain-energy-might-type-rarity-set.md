---
id: TASK-039
title: >-
  Catalog API: Riftbound-specific filter parameters (domain, energy, might,
  type, rarity, set)
status: In Progress
assignee:
  - claude
created_date: '2026-08-06 05:44'
updated_date: '2026-08-06 07:24'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Filters live in a NEW pure module `apps/api/src/lib/catalog-filters.ts` built around a per-TCG
**filter registry**, so a future game (MTG colors, Pokémon types) registers its own specs without
touching the route or reshaping the API.

### Data facts (verified against local D1, `catalog_cards` tcg='riftbound', 1409 rows)
- domains (`$.domains`, array): Body, Calm, Chaos, Colorless, Fury, Mind, Order
- type (`$.type`): Battlefield, Gear, Legend, Rune, Spell, Unit (null on 6 rows)
- supertype (`$.supertype`): Basic, Champion, Signature, Token (null on 909 rows)
- rarity (column `inventory.rarity`, lowercase): common, uncommon, rare, epic, showcase
- energy/might (`$.energy`, `$.might`): ints 0..12, null on 294 / 620 rows
- sets: ARC, OGN, OGS, SFD, UNL, VEN (free-form — NOT validated, new sets ship constantly)

### Design rules
1. Registry: `GAME_FILTERS: Partial<Record<Tcg, FilterSpec[]>>`; only `riftbound` populated today.
   Spec kinds: `jsonArray` (domains), `jsonScalar` (type/supertype), `jsonInt` (energy/might),
   `column` (rarity). Each spec declares param name, allowed values (or int range) and SQL builder.
2. All game filters are **multi-value** (repeated param and/or comma-separated) with **OR** semantics
   within a param, **AND** across params. Multi-domain cards match if ANY selected domain matches (AC#4).
3. **AC#3 rule — reject, don't ignore.** Any game-specific param present without the matching
   `tcg` → `400 { error: 'filter_requires_tcg', param, requiresTcg: 'riftbound' }`.
4. **AC#2** invalid value → `400 { error: 'invalid_filter', param, supported: [...] }`, same shape
   family as the existing `invalid_tcg` + `supported` response.
5. `set` stays as-is (generic, exact `set_code`, no validation, works for every game).
6. Null-safe SQL (verified in sqlite3): wrap the blob in `iif(json_valid(x), x, NULL)` so a corrupt
   or NULL `card_attributes` yields 0 rows instead of "malformed JSON" at step time.
   - domains: `EXISTS (SELECT 1 FROM json_each(json_extract(<guard>,'$.domains')) WHERE value IN (...))`
   - scalar/int: `json_extract(<guard>,'$.energy') IN (...)` → rows with null energy never match.

### Steps
1. `packages/shared`: export `RIFTBOUND_DOMAINS`, `RIFTBOUND_CARD_TYPES`, `RIFTBOUND_SUPERTYPES`,
   `RIFTBOUND_RARITIES` (documented as the filter vocabulary, sourced from the dotgg import).
2. New `apps/api/src/lib/catalog-filters.ts` + `catalog-filters.test.ts`.
3. Wire into `GET /catalog` in `apps/api/src/routes/catalog.ts` after the `tcg` parse; filters
   compose with the existing q/tcg/set/seller/limit/offset `and(...)`, and the `total` count uses
   the same `where` (already shared).
4. Tests (vitest, node env — routes are not runtime-testable here): every filter, multi-value,
   combinations, both 400 shapes, null/corrupt attribute handling at the parse layer.
5. Manual SQL evidence for AC#4: synthetic riftbound inventory rows (multi-domain, null energy,
   corrupt JSON blob) inserted into the local D1 sqlite, exact generated WHERE clauses run against it.
<!-- SECTION:PLAN:END -->
