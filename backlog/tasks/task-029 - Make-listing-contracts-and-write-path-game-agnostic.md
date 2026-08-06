---
id: TASK-029
title: Make listing contracts and write path game-agnostic
status: To Do
assignee: []
created_date: '2026-08-06 02:19'
labels:
  - 'epic:riftbound'
  - api
milestone: m-3
dependencies: []
references:
  - packages/shared/src/index.ts
  - apps/api/src/lib/inventory.ts
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/routes/admin.ts
  - packages/db/src/schema.ts
  - .claude/agents/d1-schema-guardian.md
priority: high
type: feature
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The create-listing path is hardcoded to MTG: `CardSnapshot` requires a Scryfall UUID (packages/shared/src/index.ts:50-76), `createListing()` forces `tcg:'mtg'` (apps/api/src/lib/inventory.ts:107, snapshot logic at 70-128), and both zod create schemas require `scryfallId` (apps/api/src/routes/seller-panel.ts:34-41, apps/api/src/routes/admin.ts:29-38).

To support Riftbound — and future TCGs — the shared contracts (`CardSnapshot`, `CreateListingRequest` at packages/shared/src/index.ts:437-452) and the write path must carry the listing's game and a game-agnostic catalog identifier while preserving current MTG behavior exactly.

The `inventory.tcg` column (packages/db/src/schema.ts:143) already accepts any string, so no migration should be needed.

Schema guidance: when multi-game modeling arrives, split shared card attributes from game-specific ones deliberately; avoid a sprawling nullable mega-table (.claude/agents/d1-schema-guardian.md:85-89).

This task is the foundation the rest of epic:riftbound depends on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Shared contracts express a listing's game and a catalog identifier that is not Scryfall-specific, and existing MTG clients/data keep working unchanged
- [ ] #2 Creating an MTG listing behaves exactly as today, including finish validation against Scryfall finishes
- [ ] #3 Unknown or unsupported tcg values are rejected with a clear validation error
- [ ] #4 inventory.tcg stores the correct game per listing; no D1 table rebuild is required
- [ ] #5 Tests cover the MTG regression path and the new game validation
<!-- AC:END -->
