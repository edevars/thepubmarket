---
id: TASK-031
title: Multi-game catalog search and listing creation in seller/admin APIs
status: To Do
assignee: []
created_date: '2026-08-06 02:19'
updated_date: '2026-08-06 02:20'
labels:
  - 'epic:riftbound'
  - api
milestone: m-3
dependencies:
  - TASK-029
  - TASK-030
references:
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/routes/admin.ts
  - apps/api/src/lib/inventory.ts
  - packages/db/src/schema.ts
documentation:
  - 'https://riftcodex.com/docs/'
priority: high
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seller and admin APIs only expose Scryfall search (GET /seller/scryfall/search at apps/api/src/routes/seller-panel.ts:595-606; GET /admin/scryfall/search at apps/api/src/routes/admin.ts:52-63), and their create-listing schemas require a Scryfall UUID (seller-panel.ts:34-41 createSchema; admin.ts:29-38; POST /seller/inventory at 147-169; POST /admin/inventory at admin.ts:66-86).

Expose game-aware catalog search (game=mtg|riftbound) and accept Riftbound catalog ids on both create endpoints, routing catalog resolution to the right provider (Scryfall vs RiftCodex, built in the sibling tasks). The web app is the only consumer of the /scryfall/ endpoints, so an atomic rename/migration is acceptable — decide and document their fate.

Riftbound variant note: alternate-art/signature printings are distinct catalog entries in RiftCodex, not finishes, so the existing DB finish CHECK ('nonfoil'|'foil', packages/db/src/schema.ts:162-178) should suffice; D1 cannot rebuild tables, so widening that CHECK is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A game-aware catalog search endpoint returns results for both MTG and Riftbound based on a game parameter
- [ ] #2 Creating a Riftbound listing via the seller endpoint persists tcg='riftbound' with a correct snapshot (set, collector number, rarity, artist, image URL)
- [ ] #3 The admin create endpoint supports Riftbound the same way
- [ ] #4 Finish validation is correct per game; alternate-art/signature Riftbound printings resolve as distinct catalog entries
- [ ] #5 MTG search and listing creation continue to work unchanged
- [ ] #6 Invalid or unsupported game input is rejected with a clear error
- [ ] #7 Tests cover both games and invalid-game input
<!-- AC:END -->
