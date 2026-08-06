---
id: TASK-023
title: 'Add inventory_photos table, migration, and shared photo types'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 00:12'
updated_date: '2026-08-06 00:39'
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
- [ ] #1 `inventory_photos` table exists in packages/db/src/schema.ts following existing conventions: TEXT UUID primary key, shared `timestamps` helper, FK to `inventory` ON DELETE CASCADE, FK to `sellers` ON DELETE CASCADE, unique `r2_key`, `content_type`, `size_bytes` with a `> 0` check, `sort_order` with a `>= 0` check, and an index on `inventory_id`
- [ ] #2 Migration generated with drizzle-kit lands in apps/api/migrations/ and applies cleanly to a fresh local D1 via the project's migrate script
- [ ] #3 packages/shared exports `InventoryPhoto { id, url, sortOrder }`, adds `photos: InventoryPhoto[]` to `InventoryItem`, and exports a `MAX_PHOTOS_PER_ITEM` constant of 6
- [ ] #4 `rowToInventoryItem` in apps/api/src/lib/inventory.ts accepts photos and defaults to an empty array; all existing callers compile with no behavior change
- [ ] #5 Catalog mock data in apps/web keeps typechecking with the new contract field
- [ ] #6 Typecheck and lint pass across apps/api, apps/web and packages
- [ ] #7 Schema doc-comment on the new table states the R2 orphan policy (DB-first delete, best-effort R2 delete) in the same style as surrounding schema comments
<!-- AC:END -->
