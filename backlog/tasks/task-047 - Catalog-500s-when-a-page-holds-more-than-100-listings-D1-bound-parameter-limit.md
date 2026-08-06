---
id: TASK-047
title: >-
  Catalog 500s when a page holds more than 100 listings (D1 bound-parameter
  limit)
status: Done
assignee:
  - '@Claude'
created_date: '2026-08-06 14:36'
updated_date: '2026-08-06 14:42'
labels:
  - api
  - catalog
milestone: m-0
dependencies: []
references:
  - apps/api/src/lib/photos.ts
  - apps/api/src/routes/catalog.ts
  - apps/web/src/lib/catalog/data.ts
modified_files:
  - apps/api/src/lib/d1-batch.ts
  - apps/api/src/lib/d1-batch.test.ts
  - apps/api/src/lib/photos.ts
  - apps/api/src/lib/photos.test.ts
  - apps/api/src/routes/orders.ts
  - apps/api/src/routes/seller-panel.ts
priority: high
type: bug
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`GET /catalog` returns 500 for any page holding more than 100 listings, which took the whole storefront down: the home page requests `limit=200`, so thepubmarket.com answered 500 on every request once active inventory passed 100 items.

Root cause: `loadPhotosByInventoryId` builds a single `IN (...)` over every listing id on the page, binding one parameter per id. D1 rejects a statement with more than 100 bound parameters. Bisected in production: `limit=100` → 200, `limit=101` → 500.

The bug is not new — it was unreachable while production held ~16 active listings, and surfaced the moment a bulk load of 1000 test singles (2026-08-06) pushed the catalog past the threshold. Any seller adding their hundredth listing would have triggered it.

The same unbounded-`IN` shape exists elsewhere and should be audited here rather than waiting for the next outage: `routes/orders.ts` (order ids, inventory ids), `routes/seller-panel.ts` (order ids, buyer ids), `routes/checkout.ts` (cart item ids), `routes/catalog.ts` (seller ids). Each is bounded by a page size or a cart size today; the point is to know which are safe and why, not to chunk everything reflexively.

No payment or fund-flow logic is involved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GET /catalog?limit=200 returns 200 with a full page of items against production-sized inventory
- [x] #2 No D1 statement in the catalog read path binds more than 100 parameters, regardless of page size
- [x] #3 Unit test asserts the photo loader never exceeds the bound-parameter cap and still returns every listing across chunk boundaries
- [x] #4 The other unbounded IN (...) call sites (orders, seller-panel, checkout, catalog sellers) are audited; each is either chunked or documented as bounded below the cap, with the reasoning recorded in the task notes
- [x] #5 Typecheck, Biome and vitest are green, and the fix is deployed and verified against the live storefront
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit of every unbounded `IN (...)` in the API (AC #4):

**Broken, now chunked** — all three list without a `LIMIT`, so the id list grows with real usage:
- `lib/photos.ts` loadPhotosByInventoryId — the outage. One id per listing on a catalog page. Also reached from `GET /seller/inventory`, which loads the seller's *entire* inventory, so the anchor seller's own panel was broken too at 1000 listings.
- `routes/orders.ts` — `orderItems` by order id, and `inventory` by line item id. A buyer with 101 orders (or 101 total lines, which arrives sooner) would 500 on "Mis compras".
- `routes/seller-panel.ts` — `orderItems` by order id and `users` by buyer id in `GET /panel/orders`. The anchor store hits this at its 101st order. Highest-likelihood next failure of the three.

**Bounded, left alone** (each documented in place):
- `routes/checkout.ts` — cart ids are capped by `checkoutSchema` at `.max(20)`. The schema guarantees it; no chunking needed.
- `routes/catalog.ts` and `routes/orders.ts` seller lookups — bounded by the number of sellers. The model is vetted-by-invitation, so this is a handful of rows and cannot drift into the hundreds without a product change.
- `routes/seller-panel.ts` pickupIds — same reason: pickup stores are sellers.
- `middleware/seller-connect-auth.ts` and `lib/catalog-filters.ts` — `inArray` over literal enum values, not data. Fixed, tiny.

Shared helper in `lib/d1-batch.ts` (`MAX_BOUND_IDS = 90`, `chunkIds`, `selectByIds`) rather than repeating the loop four times. `selectByIds` runs a single query when the list fits under the cap, so the common path costs exactly what it did before; chunks run in parallel, so cross-chunk row order is not guaranteed — every caller groups by id, which is order-independent within a chunk.

Why 90 and not 100: leaves headroom for the other parameters a statement may bind alongside the id list.

Verified in production after deploy: 30/30 requests across limits 101–200 return 200; home, /catalog, /en and an item detail page all 200.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What broke

`GET /catalog` 500'd for any page above 100 listings, taking thepubmarket.com down entirely — the home page requests `limit=200`. `loadPhotosByInventoryId` built one `IN (...)` over every listing id on the page, and D1 rejects a statement with more than 100 bound parameters. Bisected live: `limit=100` → 200, `limit=101` → 500.

Latent since the photo loader was written; unreachable at ~16 active listings. A bulk load of 1000 test singles crossed the threshold. The 100th listing of any seller would have done the same.

## What changed

- **lib/d1-batch.ts** (new) — `MAX_BOUND_IDS = 90`, `chunkIds`, `selectByIds`. One query when the list fits under the cap, parallel chunks above it.
- **lib/photos.ts** — loader goes through `selectByIds`.
- **routes/orders.ts**, **routes/seller-panel.ts** — same fix for two more unbounded `IN (...)` found in the audit; both list without a `LIMIT`, so the anchor store would have broken its own panel at its 101st order.
- Call sites that are genuinely bounded (cart capped at 20 by schema, seller lookups bounded by the vetted-seller model) are documented in place instead of chunked.

## Verification

Typecheck, Biome, vitest green (192 tests, 18 files; new `d1-batch.test.ts` plus regression tests in `photos.test.ts` asserting no statement exceeds the cap and no rows are lost across chunk boundaries). Deployed to production and swept live: 30/30 requests across limits 101–200 return 200; home, /catalog, /en and item detail all 200 and rendering real cards.
<!-- SECTION:FINAL_SUMMARY:END -->
