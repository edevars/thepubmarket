---
id: TASK-025
title: Expose seller photos in catalog API and serve images from R2
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 00:13'
updated_date: '2026-08-06 01:03'
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
