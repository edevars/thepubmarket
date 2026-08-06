---
id: TASK-023
title: 'Add inventory_photos table, migration, and shared photo types'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-06 00:12'
updated_date: '2026-08-06 00:44'
labels:
  - 'epic:inventory-photos'
  - db
  - api
milestone: m-2
dependencies: []
documentation:
  - CLAUDE.md
  - ROADMAP.md
  - docs/ingenieria/
modified_files:
  - packages/db/src/schema.ts
  - packages/shared/src/index.ts
  - apps/api/migrations/
  - apps/api/src/lib/inventory.ts
  - apps/web/src/lib/catalog/mock-data.ts
priority: high
type: task
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sellers need to attach real photos of the physical cards they list, complementary to the canonical Scryfall image, so buyers can judge actual condition (scratches, whitening, centering, foil curling) before paying. In singles, condition drives price, so this is a trust feature, not decoration.

This task lays the data foundation only: photo metadata in D1 (binaries live in R2, handled in a follow-up task) plus the shared TypeScript contract.

Durable decisions already made for this feature:
- Metadata goes in a dedicated `inventory_photos` table, NOT a JSON column on `inventory`. Rationale: referential integrity via ON DELETE CASCADE, reorder/delete without read-modify-write races, per-photo metadata, and it is a pure CREATE TABLE (D1-friendly). JSON columns in this schema are reserved for small config blobs, never entity lists.
- A photo belongs to one inventory item and one seller. `seller_id` is denormalized on purpose so ownership checks are a direct WHERE clause, matching the existing pattern in `apps/api/src/routes/seller-panel.ts`.
- Hard cap of 6 photos per listing, enforced in application code (not schema).
- Photos are allowed on listings with quantity > 1; the buyer-facing UI will note that photos are representative of the copy shipped. No quantity-based restriction.
- Orphan policy: deletes are DB-first, R2 best-effort after. A stray R2 object is unreachable (serving resolves through the DB row) and costs cents; the reverse order would show broken images. No reconciliation cron in v1.

The public `InventoryItem` contract gains an additive `photos` array so every existing consumer (catalog, cart, purchases, mocks) keeps working unchanged with an empty default.

This feature touches no payment, payout or Stripe code path — no fund-custody implications.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `inventory_photos` table exists in packages/db/src/schema.ts following existing conventions: TEXT UUID primary key, shared `timestamps` helper, FK to `inventory` ON DELETE CASCADE, FK to `sellers` ON DELETE CASCADE, unique `r2_key`, `content_type`, `size_bytes` with a `> 0` check, `sort_order` with a `>= 0` check, and an index on `inventory_id`
- [x] #2 Migration generated with drizzle-kit lands in apps/api/migrations/ and applies cleanly to a fresh local D1 via the project's migrate script
- [x] #3 packages/shared exports `InventoryPhoto { id, url, sortOrder }`, adds `photos: InventoryPhoto[]` to `InventoryItem`, and exports a `MAX_PHOTOS_PER_ITEM` constant of 6
- [x] #4 `rowToInventoryItem` in apps/api/src/lib/inventory.ts accepts photos and defaults to an empty array; all existing callers compile with no behavior change
- [x] #5 Catalog mock data in apps/web keeps typechecking with the new contract field
- [x] #6 Typecheck and lint pass across apps/api, apps/web and packages
- [x] #7 Schema doc-comment on the new table states the R2 orphan policy (DB-first delete, best-effort R2 delete) in the same style as surrounding schema comments
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Pure additive data foundation: one `CREATE TABLE` (no ALTER on existing tables, so
D1 never has to recreate anything), plus an additive field on the public
`InventoryItem` contract with an empty default so no existing consumer changes
behavior. No R2 binding, no routes, no upload logic — that is TASK-024.

## Steps

1. **`packages/db/src/schema.ts`** — new `inventoryPhotos` table after `inventory`:
   `id` TEXT PK (UUID from the app), `inventory_id` FK → `inventory` ON DELETE
   CASCADE, `seller_id` FK → `sellers` ON DELETE CASCADE (denormalized on purpose:
   ownership checks in seller-panel.ts are a direct WHERE, no join), `r2_key` TEXT
   NOT NULL unique, `content_type` TEXT NOT NULL, `size_bytes` INTEGER NOT NULL with
   `> 0` check, `sort_order` INTEGER NOT NULL default 0 with `>= 0` check, shared
   `timestamps` helper. `index('idx_inventory_photos_inventory_id')`.
   Doc-comment states the R2 orphan policy (DB-first delete, R2 best-effort) and why
   this is a table and not a JSON column.
   Register it in the exported `schema` object.
2. **`packages/db/src/index.ts`** — export `InventoryPhotoRow` / `NewInventoryPhoto`
   inferred types, matching the existing per-table pattern.
3. **`packages/shared/src/index.ts`** — `InventoryPhoto { id, url, sortOrder }`
   (`url` is the API-served URL, never the raw R2 key — the key stays server-side),
   `photos: InventoryPhoto[]` on `InventoryItem` (required, not optional: an empty
   array is the honest "no photos", and optionality would let a consumer forget to
   render), and `MAX_PHOTOS_PER_ITEM = 6`.
4. **`apps/api/src/lib/inventory.ts`** — `rowToInventoryItem(row, seller, photos = [])`.
   Optional third param with an empty default, so the 6 existing call sites in
   catalog.ts / seller-panel.ts / admin.ts compile untouched and keep returning
   `photos: []` until TASK-025 wires the real read.
5. **Migration** — `pnpm --filter @thepubmarket/api db:generate` → `0010_*.sql`, then
   `db:migrate:local` against a fresh local D1 to prove it applies clean.
6. **`apps/web/src/lib/catalog/mock-data.ts`** — `photos: []` in `listing()`, the only
   place in the web app that builds an `InventoryItem` literal (verified by grep).
7. **Verify** — `pnpm typecheck` and `pnpm lint` at the root, plus
   `pnpm --filter @thepubmarket/api test` (the 71 lib tests) to confirm nothing regressed.

## Conventions

Comments in Spanish inside `schema.ts` / `shared/index.ts`: those files are wholly
Spanish and even TASK-022 (which mandated English) kept its `webhook_events` comment
Spanish. File-local consistency wins over the global English preference here.

## Non-custodial check

Touches no payment, payout, Stripe or fund-flow code path. Photo metadata only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented as planned; no deviations.** New `inventoryPhotos` table in `packages/db/src/schema.ts` (placed between `inventory` and `orders`), row types `InventoryPhotoRow`/`NewInventoryPhoto` in `packages/db/src/index.ts`, `InventoryPhoto` + `MAX_PHOTOS_PER_ITEM = 6` + `photos` on `InventoryItem` in `packages/shared/src/index.ts`, optional `photos = []` third param on `rowToInventoryItem`, `photos: []` in the web catalog mock. Migration `0010_same_starjammers.sql` (pure CREATE TABLE + 2 indexes, no ALTER on existing tables).

**Verification is behavioral, not just compile-level.** Against local D1, on a throwaway inventory row:

| Probe | Result |
|---|---|
| valid insert | success |
| `size_bytes = 0` | rejected — `inventory_photos_size_bytes_check` |
| `sort_order = -1` | rejected — `inventory_photos_sort_order_check` |
| duplicate `r2_key` | rejected — UNIQUE on `inventory_photos.r2_key` |
| unknown `inventory_id` | rejected — FOREIGN KEY constraint |
| `DELETE FROM inventory` | photo row count 1 → 0 (ON DELETE CASCADE fires; D1 enforces FKs) |

Probe rows removed afterwards; local DB left as found.

**AC#2 (fresh DB):** beyond `db:migrate:local` applying 0010 to the existing local D1, all 11 migrations were replayed in order into an empty SQLite file — clean, with the 8 expected tables. So a from-zero environment gets the same schema, not just an incrementally-migrated one.

**AC#6:** `pnpm typecheck` 4/4 packages, `pnpm lint` (biome) 168 files clean, `pnpm --filter @thepubmarket/api test` 71/71.

**Note on `rowToInventoryItem`:** the third param is optional with an empty default precisely so the 6 existing call sites in catalog.ts / seller-panel.ts / admin.ts stay untouched. TASK-025 must remember to actually pass photos there — until it does, the API answers `photos: []` for every item, which is correct-but-empty rather than broken.

**Language:** comments in Spanish inside `schema.ts` / `shared/index.ts`. Those files are wholly Spanish and TASK-022 kept its `webhook_events` comment Spanish despite mandating English; file-local consistency won.

**Not committed yet** — working tree carries the 6 modified files plus the migration and its snapshot.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Data foundation for seller-uploaded photos of the physical card (epic `inventory-photos`). Metadata only — no R2 binding, no routes, no upload path; that is TASK-024/025.

- **`packages/db/src/schema.ts`** — new `inventory_photos` table: TEXT UUID PK, `inventory_id` and `seller_id` both FK ON DELETE CASCADE, unique `r2_key`, `content_type`, `size_bytes > 0`, `sort_order >= 0` default 0, shared `timestamps`, index on `inventory_id`. Doc-comment records the durable decisions: why a table and not a JSON column, why `seller_id` is denormalized, and the R2 orphan policy (DB row first, R2 object best-effort after — a stray object is unreachable and costs cents; the reverse order shows broken images).
- **`packages/db/src/index.ts`** — `InventoryPhotoRow` / `NewInventoryPhoto`.
- **`packages/shared/src/index.ts`** — `InventoryPhoto { id, url, sortOrder }` (`url` is the API-served URL; the R2 key never leaves the server), required `photos: InventoryPhoto[]` on `InventoryItem`, `MAX_PHOTOS_PER_ITEM = 6`.
- **`apps/api/src/lib/inventory.ts`** — `rowToInventoryItem(row, seller, photos = [])`, so all 6 existing call sites are unchanged.
- **`apps/web/src/lib/catalog/mock-data.ts`** — `photos: []`.
- **`apps/api/migrations/0010_same_starjammers.sql`** — pure CREATE TABLE + 2 indexes. No ALTER on an existing table, so D1 never has to recreate one.

## Why this shape

A dedicated table buys referential integrity and race-free reorder/delete; a JSON column on `inventory` would have needed read-modify-write for every reorder and given no cascade. `photos` is required rather than optional on the contract so a consumer cannot silently forget the field — an empty array is the honest "no photos".

## Verification

Behavioral, against local D1 on a throwaway row: valid insert succeeds; `size_bytes = 0`, `sort_order = -1`, duplicate `r2_key` and an unknown `inventory_id` are each rejected by the intended constraint; deleting the inventory row cascades the photo away (1 → 0). All 11 migrations replay clean into an empty SQLite file, so a from-zero environment lands on the same schema. `pnpm typecheck` 4/4, `pnpm lint` 168 files clean, api tests 71/71.

## Risks / follow-ups

Low risk: additive-only, nothing reads the table yet. The one thing to not forget is that TASK-025 must pass photos into `rowToInventoryItem`; until then every API response carries `photos: []`. The 6-photo cap and content-type/size validation live in application code and land with TASK-024.

No payment, payout or Stripe code path touched — no fund-custody implications.
<!-- SECTION:FINAL_SUMMARY:END -->
