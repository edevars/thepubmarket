---
id: TASK-025
title: Expose seller photos in catalog API and serve images from R2
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 00:13'
updated_date: '2026-08-06 01:10'
labels:
  - 'epic:inventory-photos'
  - api
  - r2
milestone: m-2
dependencies:
  - TASK-023
documentation:
  - apps/api/wrangler.jsonc
  - docs/ingenieria/
modified_files:
  - apps/api/src/routes/catalog.ts
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/index.ts
  - apps/api/src/lib/inventory.ts
  - docs/ingenieria/fotos-inventario.md
priority: high
type: feature
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buyers need seller photos on the public catalog to judge card condition, and the browser needs a URL to fetch the binaries. This task extends the public catalog responses with each listing's ordered photos and adds the public read route that streams objects out of R2.

Durable decisions already made:
- Images are served through a Worker route that streams from R2, NOT via a public bucket with a custom domain. The `thepubmarket-assets` bucket is shared and the roadmap earmarks it for more uses (Scryfall image migration in Phase 5); making it public is all-or-nothing and needs manual dashboard/DNS steps. The Worker route lives in code, serves only the inventory-photos/ prefix, and resolves the R2 key from the DB row.
- Because R2 keys are immutable (a photo is never overwritten), responses can be cached with a long-lived immutable Cache-Control plus edge caching, with no invalidation story needed.
- The photos array is returned on the catalog LIST endpoint as well as the detail endpoint, not detail-only, because the grid shows a "real photos" indicator. Revisit if catalog payload size becomes a problem.
- Photo URLs in DTOs are absolute so the frontend renders them without extra configuration.
- Loading must be batched, matching the existing pattern used for sellers in the catalog list query. No per-item N+1.

This feature touches no payment, payout or Stripe code path — no fund-custody implications.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Catalog list and catalog detail responses include a photos array ordered by sort order, and an empty array for listings with no photos
- [ ] #2 Photos are loaded with a single batched query for the whole page of results; no per-item query
- [ ] #3 The seller panel inventory endpoint returns the same photos field
- [ ] #4 A public image route streams the object from R2 with the correct Content-Type, a long-lived immutable Cache-Control, and edge caching
- [ ] #5 Requesting an unknown or already-deleted photo id returns 404
- [ ] #6 The image route resolves the R2 key from the database row and cannot be made to serve any object outside the inventory-photos/ prefix
- [ ] #7 Photo URLs in DTOs are absolute and resolve correctly from apps/web without additional environment configuration
- [ ] #8 Existing catalog consumers (web catalog data layer, cart, purchases) work unchanged against listings with zero photos
- [ ] #9 Serving and caching design, including the rationale for a Worker route over a public bucket, is documented in docs/ingenieria/fotos-inventario.md
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Batch-load photos wherever `rowToInventoryItem` already runs against an
existing row, and add one new public route that resolves a photo id to an R2
object — never the reverse.

## Steps

1. **`apps/api/src/lib/photos.ts`** — export `PHOTO_KEY_PREFIX` (factored out
   of `buildPhotoKey`, reused as a defense-in-depth guard in the streaming
   route) and `loadPhotosByInventoryId(db, inventoryIds, origin)`: one
   `WHERE inventory_id IN (...)` query, `ORDER BY sort_order`, grouped into a
   `Map<inventoryId, InventoryPhoto[]>`. Empty input skips the query.
2. **`apps/api/src/routes/photos.ts`** (new) — `GET /photos/:id`, public, no
   auth. Cache API (`caches.default`) match-first, then D1 lookup by id
   (never a client-supplied key), a belt-and-suspenders prefix check on
   `r2Key`, `R2.get()`, stream `object.body` with `Content-Type` /
   `Content-Length` / `Cache-Control: public, max-age=31536000, immutable` /
   `ETag`, then `cache.put()` the clone via `waitUntil` so the response isn't
   held up by the cache write. Only 200s get cached; 404 never does.
3. **`apps/api/src/index.ts`** — mount `app.route('/photos', photosRoutes)`,
   public (alongside `/catalog`, `/sellers`), before the seller/admin auth
   gates.
4. **`apps/api/src/routes/catalog.ts`** — both `GET /` and `GET /:id` call
   `loadPhotosByInventoryId` alongside the existing batched seller lookup
   (`Promise.all`) and pass the result into `rowToInventoryItem`.
5. **`apps/api/src/routes/seller-panel.ts`** — `GET /inventory` (list) and
   `PATCH /inventory/:id` both wired. PATCH needed it too: without it, editing
   price on a listing that already has photos would have the response lie
   with `photos: []` while `GET /inventory` shows the real ones for the same
   item — same underlying bug as leaving it unwired, just on a different
   endpoint.
6. **`apps/api/src/routes/admin.ts`** — `PATCH /inventory/:id`, same reasoning
   as seller-panel's PATCH. (Not in the task's original file list, but it's
   the same `rowToInventoryItem` call site with the same staleness bug — fixing
   one PATCH and not the other would be an inconsistency in the same change,
   not a separate feature.)
   `POST /inventory` (create, both admin and seller-panel) intentionally NOT
   touched: a brand-new listing genuinely has no photos yet, so `photos: []`
   there is correct, not stale.
7. **`docs/ingenieria/fotos-inventario.md`** — new §5 (serving route + caching
   rationale: Worker route vs public bucket, Cache API mechanics, immutability
   argument), new §6 (batched loading, which 5 endpoints wire it and why the 2
   create endpoints don't), extended §8 with the TASK-025 manual verification
   table.
8. **Verify** — `pnpm typecheck`, `pnpm lint`, `pnpm --filter @thepubmarket/api test`.
   Manual pass against `wrangler dev`: upload real photos, confirm they appear
   in catalog list/detail, seller list, and a PATCH response; confirm
   `GET /photos/:id` streams the right bytes with the right headers and 404s
   on an unknown id; **prove edge caching actually fires** (not just "the
   header looks right") by hard-deleting the underlying row + R2 object via
   the admin endpoint and re-requesting the same URL — a second 200 with
   identical bytes only makes sense if it came from the Cache API, since the
   source is gone. Clean up all test data afterward (including restoring the
   price a test PATCH changed), verified against local D1.

## Non-custodial check

Touches no payment, payout, Stripe or fund-flow code path. Read paths and a
public image route only.
<!-- SECTION:PLAN:END -->
