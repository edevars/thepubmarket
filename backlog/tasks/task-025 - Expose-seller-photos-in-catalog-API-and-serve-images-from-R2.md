---
id: TASK-025
title: Expose seller photos in catalog API and serve images from R2
status: Done
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
- [x] #1 Catalog list and catalog detail responses include a photos array ordered by sort order, and an empty array for listings with no photos
- [x] #2 Photos are loaded with a single batched query for the whole page of results; no per-item query
- [x] #3 The seller panel inventory endpoint returns the same photos field
- [x] #4 A public image route streams the object from R2 with the correct Content-Type, a long-lived immutable Cache-Control, and edge caching
- [x] #5 Requesting an unknown or already-deleted photo id returns 404
- [x] #6 The image route resolves the R2 key from the database row and cannot be made to serve any object outside the inventory-photos/ prefix
- [x] #7 Photo URLs in DTOs are absolute and resolve correctly from apps/web without additional environment configuration
- [x] #8 Existing catalog consumers (web catalog data layer, cart, purchases) work unchanged against listings with zero photos
- [x] #9 Serving and caching design, including the rationale for a Worker route over a public bucket, is documented in docs/ingenieria/fotos-inventario.md
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Implemented as planned, with one addition beyond the original file list.** `admin.ts` PATCH also got wired (see plan step 6) — same latent staleness bug as `seller-panel.ts` PATCH, same `rowToInventoryItem` call site, fixed for the same reason in the same change.

**End-to-end manual verification against `wrangler dev` (real R2 + D1 emulation), not curl-against-a-mock.** Registered a seller session, uploaded 2 real JPEGs to an existing listing, then:

| Check | Result |
|---|---|
| `GET /catalog?limit=200` | Listing's `photos` populated, ordered |
| `GET /catalog/:id` | Same array |
| `GET /seller/inventory` | Same array |
| `PATCH /seller/inventory/:id` (price edit) | Response still carries real photos, not `[]` — the exact bug this task's plan step 5/6 targeted |
| `GET /photos/:id` | 200, `Content-Type: image/jpeg`, `Cache-Control: public, max-age=31536000, immutable`, `ETag` present, body **byte-identical** to the uploaded file (`diff` clean) |
| `GET /photos/<unknown-uuid>` | 404 |

**Edge caching proven, not assumed.** After the first successful `GET /photos/:id`, hard-deleted BOTH the DB row and the R2 object via the admin endpoint, then requested the exact same URL again: still 200, still byte-identical. That result is only possible if the response came from the Workers Cache API (`caches.default`) rather than a fresh D1/R2 lookup, since the source no longer existed. Confirms `wrangler dev` actually emulates the Cache API locally and that `cache.put()`/`cache.match()` in `routes/photos.ts` work, not just compile.

**AC#2 (batched, no N+1):** by construction — `loadPhotosByInventoryId` issues exactly one `WHERE inventory_id IN (...)` per request regardless of page size; verified by reading the code path, not by query-counting instrumentation (this codebase has none).

**AC#6 (prefix confinement):** the streaming route only ever takes a photo id from the URL, resolves `r2Key` from the DB, and additionally refuses to serve a row whose `r2Key` doesn't start with `PHOTO_KEY_PREFIX` — defense in depth on top of the fact that `buildPhotoKey` (TASK-024) is the only writer of that column.

**AC#8:** `apps/web` has zero references to `.photos` anywhere in the codebase (grepped) and the whole workspace typechecks clean, so nothing there could have broken against the new field.

**Test data cleanup:** deleted the 2 test photos (rows + R2 objects gone — confirmed via `inventory_photos` count = 0), reset the test-patched price back to its original 9500 (cross-checked against `mock-data.ts`, the source the local seed loads from), reverted the seller's `user_id` to NULL, and removed the test user + invitation row. Local D1 left exactly as found.

**`pnpm typecheck` / `pnpm lint` / `pnpm --filter @thepubmarket/api test`** all green (83 tests, unchanged from TASK-024 — no new pure-module surface was added here beyond `loadPhotosByInventoryId`, which does I/O and is covered by the manual pass per the project's test convention).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

Closes the `inventory-photos` epic's read side: buyers now see seller photos in the catalog, and the browser has a real URL to fetch them from.

- **`apps/api/src/lib/photos.ts`** — `PHOTO_KEY_PREFIX` (factored out of `buildPhotoKey`) and `loadPhotosByInventoryId(db, inventoryIds, origin)`, a one-query batched loader grouped by listing and ordered by `sort_order`.
- **`apps/api/src/routes/photos.ts`** (new) — `GET /photos/:id`, public, streams the R2 object for a photo id. Cache API match-first; on a miss, resolves the DB row, refuses to serve a key outside `inventory-photos/`, fetches from R2, streams the body with `Content-Type`/`Content-Length`/`Cache-Control: public, max-age=31536000, immutable`/`ETag`, and writes the response into the edge cache via `waitUntil` without blocking the client. Unknown or deleted ids → 404, never cached.
- **`apps/api/src/index.ts`** — mounts `/photos`, public, alongside `/catalog` and `/sellers`.
- **`apps/api/src/routes/catalog.ts`** — both list and detail now batch-load and return real photos.
- **`apps/api/src/routes/seller-panel.ts`**, **`apps/api/src/routes/admin.ts`** — `GET /inventory` (list) and both `PATCH /inventory/:id` (seller + admin) wired too, so an existing listing's photos never go stale in a response that happens to touch the same row for another reason. The two `POST /inventory` (create) call sites are untouched on purpose — a brand-new listing has no photos yet.
- **`docs/ingenieria/fotos-inventario.md`** — new sections on the serving route (Worker route vs. public bucket rationale, Cache API mechanics), the batched-loading pattern and which endpoints wire it, and the TASK-025 manual verification table.

## Why this shape

A Worker route rather than a public R2 bucket/custom domain: the bucket is shared and earmarked for more uses later (Scryfall migration, Phase 5), so going public is all-or-nothing and needs manual DNS/dashboard work a code route avoids. Because R2 keys are immutable, there's no cache-invalidation problem to solve — a `200` is safe to cache forever, both at the browser and explicitly at Cloudflare's edge via the Cache API (a Worker response isn't cached at the edge automatically just from headers).

## Verification

Full HTTP-level pass against `wrangler dev` with real R2/D1 emulation: uploaded real photos, confirmed they surface (in order) in catalog list, catalog detail, the seller panel list, and a PATCH response; confirmed the streaming route returns byte-identical content with the right headers and 404s on an unknown id. Most notably, **proved edge caching actually fires**, not just that the header looks right: hard-deleted the source row and R2 object, then re-requested the same photo URL and still got a 200 with identical bytes — impossible unless it came from the Cache API. Test data cleaned up afterward, local D1 restored exactly. `pnpm typecheck`, `pnpm lint`, and the 83-test api suite all green.

## Risks / follow-ups

None outstanding — this closes both read-side ACs and the two staleness bugs found in the PATCH endpoints while wiring the list endpoints. No payment, payout or Stripe code path touched. The `inventory-photos` epic's backend is now complete; TASK-026 (seller panel UI) and TASK-027 (catalog gallery) are the remaining frontend tasks.
<!-- SECTION:FINAL_SUMMARY:END -->
