---
id: TASK-046
title: >-
  Stale-shaped KV cache entries silently create inventory rows without a
  catalogId
status: To Do
assignee: []
created_date: '2026-08-06 14:24'
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
- [ ] #1 A cached snapshot whose shape does not match the current CardSnapshot contract is never used: it is treated as a cache miss and refetched from the source
- [ ] #2 createListing rejects a snapshot without a catalogId instead of inserting a row, returning a typed error; no code path can write inventory.catalog_id as NULL for a supported tcg
- [ ] #3 Unit tests cover both cases: a legacy-shaped KV entry (scryfallId, no tcg/catalogId) and a snapshot missing catalogId
- [ ] #4 The 7 pre-existing production inventory rows with catalog_id IS NULL are audited and resolved (backfilled from their set_code/collector_number, or deactivated if unresolvable), and the outcome is recorded in the task notes
- [ ] #5 Typecheck, Biome and vitest are green
<!-- AC:END -->
