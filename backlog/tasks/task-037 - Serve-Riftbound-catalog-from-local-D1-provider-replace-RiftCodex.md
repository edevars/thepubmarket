---
id: TASK-037
title: Serve Riftbound catalog from local D1 provider (replace RiftCodex)
status: Done
assignee:
  - '@Claude'
created_date: '2026-08-06 05:03'
updated_date: '2026-08-06 05:23'
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
modified_files:
  - apps/api/src/lib/catalog-db.ts
  - apps/api/src/lib/catalog-providers.ts
  - apps/api/src/lib/scryfall.ts
  - apps/api/src/lib/inventory.ts
  - apps/api/src/lib/inventory.test.ts
  - apps/api/src/routes/admin.ts
  - apps/api/src/routes/seller-panel.ts
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
- [x] #1 CatalogProvider signature takes a context object { db, kv, origin }; MTG/Scryfall behavior unchanged and its tests still green
- [x] #2 GET /admin/catalog/search?game=riftbound&q= returns results from D1 (name LIKE, NOCASE), including for terms RiftCodex could never resolve
- [x] #3 Fetching an unknown riftbound catalogId returns 404 card_not_found instead of 502 catalog_error
- [x] #4 CardSnapshot.imageUrl points to the local /card-images/ route when the R2 mirror exists, with source URL fallback
- [x] #5 riftcodex.ts and its test are removed; typecheck, biome, and vitest green
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Behavior change worth remembering: the local catalog reports REAL finishes per printing (from dotgg hasNormal/hasFoil), while RiftCodex reported none (finishes: [] = accept any). Publishing a Riftbound single now enforces the actual finish — e.g. OGN-030 is foil-only and rejects nonfoil with finish_not_available. This is stricter and correct, but any seed/script that assumed "any finish accepted for riftbound" must use a valid finish now.

imageUrl is built as `${origin}/${row.imageR2Key}` (the R2 key IS the public path under the API origin), falling back to source_image_url when not yet mirrored. searchCards escapes %/_ with ESCAPE '\' and returns max 60 ordered by name; no KV cache for the local provider.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Riftbound catalog lookups now read from the local `catalog_cards` D1 table (TASK-036) instead of the RiftCodex fan API, which could not search (0 results for every term) and answered 500 for unknown ids.

- **apps/api/src/lib/catalog-db.ts** (new) — `localCatalogProvider(tcg)`: getCardById (miss → CatalogError 404, an upgrade RiftCodex could not express) and searchCards (name LIKE, NOCASE index, %/_ escaped, LIMIT 60, no KV cache). Snapshots point imageUrl at our /card-images/ route when mirrored, source URL fallback.
- **catalog-providers.ts** — providers now take `CatalogContext { db, kv, origin }`; registry maps riftbound to the local provider.
- **scryfall.ts** — signature-only change (uses ctx.kv); MTG behavior unchanged.
- **inventory.ts** — `createListing(ctx, input, sellerId)`; both call sites (admin, seller panel) and both search routes build ctx with the request origin.
- **riftcodex.ts + riftcodex.test.ts deleted** (git history preserves them).

## Verification

Typecheck, Biome, vitest green (139 tests; inventory.test.ts now mocks catalog-db). Live E2E local and in production: search "jinx" → 12 results with local image URLs; `%` treated as literal; unknown id → 404 card_not_found; full Riftbound listing created via the local provider (correct set/rarity/attributes/image) and smoke row cleaned up. Finish validation now real: foil-only printings reject nonfoil.
<!-- SECTION:FINAL_SUMMARY:END -->
