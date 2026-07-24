---
id: TASK-006
title: Expose seller identity on InventoryItem and render the 'Vendido por' cart row
status: Done
assignee:
  - claude
created_date: '2026-07-22 22:31'
updated_date: '2026-07-24 17:06'
labels:
  - 'epic:data-gaps'
  - feature
milestone: m-0
dependencies: []
priority: medium
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The cart UI is designed to show a 'Vendido por' (Sold by) row per line item but currently omits it because InventoryItem (packages/shared/src/index.ts) doesn't expose seller name or verified status. GET /sellers and the Seller contract already exist (apps/api/src/routes/sellers.ts, packages/shared). This task closes that data gap — independent of the Stripe wiring work, can be done in parallel. Note: the rendered UI copy ('Vendido por') stays in Spanish; only this task's own title/description/AC are in English.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Decision made and implemented: either catalog API joins sellerName/verified into InventoryItem, or the frontend does a lookup against GET /sellers — documented reasoning for the choice
- [x] #2 InventoryItem in packages/shared/src/index.ts exposes seller name and verified fields
- [x] #3 Cart line component renders the 'Vendido por' row (currently omitted) using this data
- [x] #4 CartItem optional display fields (already scaffolded in lib/cart.tsx) populated correctly
- [x] #5 No regression to existing cart states (empty/loading/no-session) — verified via build/typecheck
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Decision (AC#1): catalog API joins sellerName/verified into InventoryItem server-side (batch-fetch sellers by id, same pattern already used in apps/api/src/lib/orders.ts for BuyerOrder). Rejected frontend-lookup-against-GET/sellers alternative: it would require N+1 client calls or a full seller-list fetch on every catalog render, whereas the API already has the seller row in hand (or one cheap query) at every InventoryItem construction site.

Steps:
1. packages/shared/src/index.ts — add `sellerName: string` and `sellerVerified: boolean` to InventoryItem.
2. apps/api/src/lib/inventory.ts — rowToInventoryItem(row, seller: {name, verified}) takes the seller as a required second arg, populates the new fields.
3. apps/api/src/routes/catalog.ts — GET / batch-fetches sellers for the unique sellerIds in the page (map pattern from orders.ts); GET /:id fetches the single seller row. 404 if seller missing (shouldn't happen, FK-backed).
4. apps/api/src/routes/admin.ts — POST /inventory and PATCH /inventory/:id fetch the seller row for the relevant sellerId and pass it through (admin has no seller in request context).
5. apps/api/src/routes/seller-panel.ts — reuse `c.get('seller')` already set by sellerAuth middleware for all 4 call sites (list/create/update/get-by-id) instead of an extra query.
6. apps/web/src/lib/cart.tsx — `add()` populates CartItem.sellerName/sellerVerified from the InventoryItem instead of leaving them undefined; drop the now-stale comment saying the catalog doesn't provide them yet.
7. apps/web/src/lib/catalog/mock-data.ts — listing() hardcodes sellerName: 'The Pub Game Store', sellerVerified: true (mocks are single-seller / ANCHOR_SELLER_ID only, matches apps/web/src/lib/sellers/mock-data.ts).
8. CartLine.tsx already renders the 'Vendido por' row when sellerName is present — no changes needed there (AC#3 was already implemented, just starved of data).
9. Verify: pnpm typecheck across api/web/shared workspaces, pnpm lint, and a manual catalog->cart smoke check (curl GET /catalog, confirm sellerName/sellerVerified present; add to cart via UI and confirm the row renders for the real anchor seller).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified via GET /catalog against local wrangler dev + seeded D1: response items carry real sellerName/sellerVerified for multiple distinct sellers (not just the anchor), confirming the batch-join in catalog.ts works and isn't hardcoded. Did not use browser automation per standing preference — verification was typecheck (3 workspaces clean) + lint (biome clean after autofix formatting) + curl against the running dev API.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the seller-identity data gap that was blocking the cart's 'Vendido por' row (CartLine.tsx already had the rendering logic — it was just starved of data).

Changes:
- packages/shared/src/index.ts: InventoryItem gains required sellerName: string and sellerVerified: boolean.
- apps/api/src/lib/inventory.ts: rowToInventoryItem(row, seller) now takes the seller info as a required second arg and populates the new fields.
- apps/api/src/routes/catalog.ts: GET / batch-fetches sellers for the page's unique sellerIds (map pattern already used in lib/orders.ts for BuyerOrder); GET /:id fetches the single seller row.
- apps/api/src/routes/admin.ts: POST /inventory now 404s as seller_not_found if the target seller doesn't exist (previously would silently succeed with no seller context) and fetches the seller row to populate the response; PATCH /inventory/:id fetches the row's seller.
- apps/api/src/routes/seller-panel.ts: reuses c.get('seller') already loaded by sellerAuth middleware for all 4 InventoryItem construction sites — no extra query needed since it's always the session seller's own store.
- apps/web/src/lib/cart.tsx: CartItem.add() now populates sellerName/sellerVerified from the InventoryItem instead of leaving them undefined; removed the stale comment noting the gap.
- apps/web/src/lib/catalog/mock-data.ts: mock listings hardcode sellerName/sellerVerified for the anchor seller (mocks are single-seller).

Decision (AC#1): joined server-side rather than a frontend GET /sellers lookup, since the API already has the seller row in hand (or one cheap batched query) at every construction site — avoids N+1 client calls.

Tests: pnpm typecheck clean across packages/shared, apps/api, apps/web. pnpm lint clean (biome autofix applied trivial formatting to the 3 edited API route files). Manually curled GET /catalog against local wrangler dev with seeded D1 data and confirmed sellerName/sellerVerified come through correctly for multiple distinct sellers, proving the join isn't just echoing the anchor. No browser UI pass per standing preference — relied on typecheck/lint/curl.

No regressions: seller-panel and admin inventory endpoints unchanged in behavior except the new fields on the response body and (admin POST only) a new 404 guard for a seller id that doesn't exist.
<!-- SECTION:FINAL_SUMMARY:END -->
