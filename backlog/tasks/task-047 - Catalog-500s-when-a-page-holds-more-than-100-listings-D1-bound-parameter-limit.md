---
id: TASK-047
title: >-
  Catalog 500s when a page holds more than 100 listings (D1 bound-parameter
  limit)
status: In Progress
assignee:
  - '@Claude'
created_date: '2026-08-06 14:36'
labels:
  - api
  - catalog
milestone: m-0
dependencies: []
references:
  - apps/api/src/lib/photos.ts
  - apps/api/src/routes/catalog.ts
  - apps/web/src/lib/catalog/data.ts
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
- [ ] #1 GET /catalog?limit=200 returns 200 with a full page of items against production-sized inventory
- [ ] #2 No D1 statement in the catalog read path binds more than 100 parameters, regardless of page size
- [ ] #3 Unit test asserts the photo loader never exceeds the bound-parameter cap and still returns every listing across chunk boundaries
- [ ] #4 The other unbounded IN (...) call sites (orders, seller-panel, checkout, catalog sellers) are audited; each is either chunked or documented as bounded below the cap, with the reasoning recorded in the task notes
- [ ] #5 Typecheck, Biome and vitest are green, and the fix is deployed and verified against the live storefront
<!-- AC:END -->
