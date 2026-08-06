---
id: TASK-026
title: Build seller panel UI for managing listing photos
status: In Progress
assignee:
  - claude
created_date: '2026-08-06 00:13'
updated_date: '2026-08-06 01:20'
labels:
  - 'epic:inventory-photos'
  - frontend
milestone: m-2
dependencies:
  - TASK-024
documentation:
  - docs/ingenieria/fotos-inventario.md
modified_files:
  - apps/web/src/components/panel/
  - apps/web/src/lib/client-api.ts
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - docs/ingenieria/fotos-inventario.md
priority: medium
type: feature
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sellers need a simple, bilingual way to attach real photos to a listing from the seller panel: pick files, preview, upload with clear progress and error states, reorder, and delete. Without this UI the upload API is unreachable in practice.

Durable decisions already made:
- Images are downscaled and re-encoded client-side (canvas, longest edge ~1600 px, JPEG) BEFORE upload. This bounds upload size at almost no cost, and the re-encode strips EXIF — including GPS coordinates from phone photos, which sellers would otherwise leak unknowingly. No server-side resizing, no thumbnail generation.
- Reordering uses simple up/down controls, not a drag-and-drop library. Cheapest thing to maintain for one developer.
- Photos are always optional, for every condition grade including HP/DMG, and allowed on listings with any quantity. When a listing has quantity > 1, the seller-facing copy must make clear the photos represent the copy the buyer receives.
- Cap is 6 photos per listing; the add control must reflect that limit rather than letting the seller hit a server error.

Reachable from the inventory view for any existing listing, and offered as an optional step right after publishing a new one.

Note on tests: apps/web UI flows in this project are validated by a documented manual E2E pass, not an automated browser suite. Follow that convention.

This feature touches no payment, payout or Stripe code path — no fund-custody implications.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Seller can open a photo manager for any of their own listings from the panel inventory view
- [ ] #2 The photo manager is also offered as an optional step after publishing a new listing
- [ ] #3 Selected images are downscaled and re-encoded client-side before upload, and the resulting files carry no EXIF metadata
- [ ] #4 Upload shows an in-progress state; network failures and API rejections (invalid image, too large, limit reached) each surface a legible, retryable bilingual message rather than failing silently
- [ ] #5 Current photo count and the 6-photo cap are visible, and the add control is disabled at the cap
- [ ] #6 Deleting a photo requires confirmation and the list updates without a full page reload
- [ ] #7 Reordering persists and survives a page reload
- [ ] #8 Listings with quantity greater than 1 show seller-facing copy clarifying the photos represent the copy the buyer receives
- [ ] #9 Empty state explains why photos matter for condition trust
- [ ] #10 All new strings exist in both the Spanish and English message catalogs, and the UI is verified in both locales
- [ ] #11 A manual E2E checklist covering upload, reorder, delete, error states and both locales is appended to docs/ingenieria/fotos-inventario.md
<!-- AC:END -->
