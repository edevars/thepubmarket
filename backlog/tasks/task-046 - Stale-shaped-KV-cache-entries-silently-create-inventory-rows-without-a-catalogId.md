---
id: TASK-046
title: >-
  Stale-shaped KV cache entries silently create inventory rows without a
  catalogId
status: In Progress
assignee: []
created_date: '2026-08-06 14:24'
updated_date: '2026-08-07 01:00'
labels:
  - api
  - catalog
milestone: m-0
dependencies: []
references:
  - apps/api/src/lib/scryfall.ts
  - apps/api/src/lib/inventory.ts
  - apps/api/src/lib/catalog.ts
  - scripts/seed-demo-inventory.mjs
priority: high
type: bug
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publishing an MTG single can produce an inventory row with `catalog_id` and `scryfall_id` set to NULL. Such a row is unusable: without a catalog id the listing detail page cannot resolve the printing and the card image is lost, yet the write succeeds with 201 and nothing in the response or logs signals a problem.

Root cause: the Scryfall card cache in KV is keyed only by printing id and holds a serialized `CardSnapshot`. The snapshot shape changed when the field was renamed `scryfallId` → `catalogId` and `tcg` was added (TASK-029/TASK-037), but the cache key did not change and the entries have a 30-day TTL. `getCardById` returns whatever JSON is under the key without validating its shape, so any entry written before the rename hands `createListing` a snapshot with `catalogId === undefined` — which is then persisted as NULL.

Discovered in production on 2026-08-06 while bulk-loading 1000 test singles: 1 of 500 MTG listings hit a legacy entry ("Dark Ritual", msc/793). That one row and its stale KV key were repaired by hand. Seven older MTG rows in production show the same symptom (`catalog_id IS NULL`) and are almost certainly the same bug from earlier loads; they still need cleanup.

The same hazard applies to the search cache (`scryfall:search:*`) and to any future snapshot shape change, so the fix should make a shape mismatch impossible to persist rather than only purge today's bad keys.

Scope is the API catalog layer; no payment or fund-flow code is involved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A cached snapshot whose shape does not match the current CardSnapshot contract is never used: it is treated as a cache miss and refetched from the source
- [x] #2 createListing rejects a snapshot without a catalogId instead of inserting a row, returning a typed error; no code path can write inventory.catalog_id as NULL for a supported tcg
- [x] #3 Unit tests cover both cases: a legacy-shaped KV entry (scryfallId, no tcg/catalogId) and a snapshot missing catalogId
- [x] #4 The 7 pre-existing production inventory rows with catalog_id IS NULL are audited and resolved (backfilled from their set_code/collector_number, or deactivated if unresolvable), and the outcome is recorded in the task notes
- [x] #5 Typecheck, Biome and vitest are green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Prod cleanup (AC#4): audited all 7 rows with catalog_id IS NULL via `wrangler d1 execute thepubmarket-db --remote`. All 7 were legacy MTG rows created before the catalog_id column existed (not fresh KV-cache-bug writes) — ids: 30fb9202-9452-455c-8fa8-9fb6dbcd2e8d (Ragavan, Nimble Pilferer, mh2/138), 8ea9d63b-e7c2-4c10-ba18-95235ed6673c (Sheoldred, the Apocalypse, dmu/107), 8db7414f-8b1a-4506-b7f0-75ceb03cd8d9 (Path to Exile, msc/141), ea0c6237-4b9b-4e25-9a97-90dc0b579dcd (Teferi, Hero of Dominaria, dom/207), 7f0a87a4-0008-408f-bc77-7b9e2dbf1a76 (Mother of Runes, clb/702), 054541b6-1b0c-41c4-bb86-c75f6b518349 (Skullclamp, c20/251), 4f7ef07f-b0cf-42e2-8b4c-99e995928551 (Dark Ritual, msc/793). Each row's scryfall_id was resolved against api.scryfall.com and set/collector_number matched the D1 row exactly, so all 7 were backfilled (not deactivated) via per-row `UPDATE inventory SET catalog_id = scryfall_id WHERE id = ...`. Verified afterward: `SELECT count(*) FROM inventory WHERE catalog_id IS NULL` = 0.

Fix: apps/api/src/lib/scryfall.ts adds isValidCardSnapshot() gating getCardById and searchCards KV reads — a shape mismatch (e.g. legacy scryfallId-only entries) is treated as a cache miss and refetched. apps/api/src/lib/inventory.ts createListing now returns a typed error (invalid_catalog_snapshot, 502) instead of inserting when catalogId is missing. Tests in scryfall.test.ts and inventory.test.ts cover both cases. Verified via task-verifier: typecheck/lint/vitest all green, no fund-flow code touched.
<!-- SECTION:NOTES:END -->
