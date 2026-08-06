---
id: TASK-037
title: Serve Riftbound catalog from local D1 provider (replace RiftCodex)
status: In Progress
assignee:
  - '@Claude'
created_date: '2026-08-06 05:03'
updated_date: '2026-08-06 05:19'
labels:
  - 'epic:riftbound'
  - api
milestone: m-3
dependencies:
  - TASK-036
references:
  - apps/api/src/lib/catalog-providers.ts
  - apps/api/src/lib/riftcodex.ts
  - apps/api/src/lib/inventory.ts
priority: high
type: feature
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Swap the Riftbound catalog provider from the flaky RiftCodex fan API (search returns 0 results for every term; unknown ids answer 500, not 404 — see TASK-030 notes) to the local `catalog_cards` D1 table populated by TASK-036.

Changes: extend `CatalogProvider` to a context-object signature `{ db, kv, origin }` (mechanical, ~7 files; scryfall ignores db/origin, all call sites already have both in scope). New `apps/api/src/lib/catalog-db.ts` provider: `getCardById` via `WHERE tcg='riftbound' AND catalog_id=?` (miss → CatalogError 404, an upgrade over RiftCodex), `searchCards` via `name LIKE COLLATE NOCASE` with %/_ escaping, LIMIT 60, no KV cache (local D1 is fast). Snapshots point `imageUrl` at `{origin}/card-images/riftbound/{id}.webp` when the R2 mirror exists, falling back to the dotgg source URL. Then set `PROVIDERS.riftbound` to the new provider and delete riftcodex.ts + riftcodex.test.ts (git history preserves them). Existing inventory snapshots are unaffected (denormalized).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CatalogProvider signature takes a context object { db, kv, origin }; MTG/Scryfall behavior unchanged and its tests still green
- [ ] #2 GET /admin/catalog/search?game=riftbound&q= returns results from D1 (name LIKE, NOCASE), including for terms RiftCodex could never resolve
- [ ] #3 Fetching an unknown riftbound catalogId returns 404 card_not_found instead of 502 catalog_error
- [ ] #4 CardSnapshot.imageUrl points to the local /card-images/ route when the R2 mirror exists, with source URL fallback
- [ ] #5 riftcodex.ts and its test are removed; typecheck, biome, and vitest green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implemented alongside TASK-036 (same session):
1. New apps/api/src/lib/catalog-db.ts — localCatalogProvider(tcg) factory reading catalog_cards; getCardById → CatalogError 404 on miss; searchCards via name LIKE (%/_ escaped, ESCAPE '\\', NOCASE index) LIMIT 60, no KV cache.
2. catalog-providers.ts — CatalogContext { db, kv, origin }; provider signatures take ctx; PROVIDERS.riftbound = localCatalogProvider('riftbound').
3. scryfall.ts — signature change only (uses ctx.kv).
4. createListing(ctx, input, sellerId); call sites updated in routes/admin.ts and routes/seller-panel.ts (both searches build ctx with request origin).
5. riftcodex.ts + riftcodex.test.ts deleted; inventory.test.ts mocks ./catalog-db instead.
<!-- SECTION:PLAN:END -->
