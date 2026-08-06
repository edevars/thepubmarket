---
id: TASK-026
title: Build seller panel UI for managing listing photos
status: In Progress
assignee:
  - claude
created_date: '2026-08-06 00:13'
updated_date: '2026-08-06 01:27'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Design

Photo manager as a modal, not a dedicated route — launched from `InventoryView` (existing listing) and from `AddCardFlow`'s success step (post-publish), both under `[locale]/panel` so it inherits Access gate + locale routing for free. No new page/route needed.

**New files**
1. `apps/web/src/lib/image-resize.ts` — pure client fn `resizeImageForUpload(file): Promise<Blob>`. `createImageBitmap(file, { imageOrientation: 'from-image' })` (respects EXIF rotation before it's stripped) → draw to canvas scaled to longest edge 1600px → `canvas.toBlob('image/jpeg', 0.85)`. Re-encoding onto a fresh canvas is what strips EXIF (GPS etc.) — no separate metadata-stripping step needed. Always outputs JPEG regardless of input type (server already accepts any of the 3 kinds via magic-byte detection, so normalizing client-side is simpler than branching).
2. `apps/web/src/components/ui/ConfirmDialog.tsx` — first modal primitive in the app (none existed: no portal, no Radix, no `window.confirm`). Self-contained fixed overlay, own backdrop-click-to-cancel with `stopPropagation` so it nests safely inside the photo modal's own backdrop-click-to-close without closing both. `danger` variant for the delete button styling.
3. `apps/web/src/components/panel/PhotoManagerModal.tsx` — the feature. Props `{ item: InventoryItem, token: string, onClose, onPhotosChange(photos) }`. Owns `photos: InventoryPhoto[]` (seeded from `item.photos`, mutated locally after each confirmed server response — never optimistic) and `uploads: UploadTask[]` (per-file `{id, file, status: resizing|uploading|error, error?}`). Files are processed **serially** (`for...of` + `await`) specifically to avoid two races: the server's photo-cap check and stale-closure writes to the `photos` array from concurrent uploads. Retry always redoes resize+upload from the original `File` (task keeps the `File`, not just the failed Blob) so a resize-time failure is retryable too. Delete goes through `ConfirmDialog`. Reorder = up/down buttons that await `POST .../reorder` before committing the new order to state (no drag-and-drop, per the task's already-made decision; also no optimistic reorder — correctness over snappiness, one-dev-maintainable).

**Modified files**
4. `apps/web/src/lib/client-api.ts` — add `uploadPhoto` (raw `Blob` body, `content-type` = blob's real mime, not the JSON `authHeaders` helper; wraps fetch in try/catch → `{ok:false, error:'network_error'}` since this is the one call site that can fail before even reaching the API), `deletePhoto` (boolean, mirrors `fulfilmentAction`'s pattern), `reorderPhotos` (`InventoryPhoto[] | null`, mirrors `updateListing`).
5. `apps/web/src/components/panel/PanelProvider.tsx` — add `setItemPhotos(id, photos)` mutator (local-only, no API call — upload/delete/reorder already talk to the server themselves; this just syncs the shared `inventory` array so other views stay consistent and reopening the modal later seeds fresh data).
6. `apps/web/src/components/panel/InventoryView.tsx` — `InventoryRow` gets an `onManagePhotos(item)` prop; new Acciones-column button "Fotos (n/6)" next to pause/resume. `InventoryView` owns `managingPhotosFor` state and renders the modal once.
7. `apps/web/src/components/panel/AddCardFlow.tsx` — success step gets a primary "Agregar fotos ahora" CTA (demoting "Agregar otra"/"Ver inventario" to outline, since photos-now is the encouraged path) that opens the same modal for `published`.
8. `apps/web/messages/es.json` / `en.json` — ~25 new `photo*`/`postPublishPhotos*` keys appended flush inside the existing `panel` object, same line offsets in both files (existing convention, verified both files are 538 lines with `panel` starting at line 315 in each).
9. `docs/ingenieria/fotos-inventario.md` — append a new section with the manual E2E checklist (upload incl. resize/EXIF-strip proof, cap enforcement, reorder-persists-across-reload, delete+confirm, each error path, both locales) — this repo's convention for apps/web UI (documented manual pass, no automated browser suite).

**AC mapping**: #1→6, #2→7, #3→1, #4→3's upload/retry/error-mapping, #5→3's cap math + disabled add control, #6→2+3's delete flow, #7→3's await-before-commit reorder, #8→3's quantity>1 copy block, #9→3's empty state copy, #10→8, #11→9.

No payment/payout/Stripe code touched — pure inventory-photo UI wiring.
<!-- SECTION:PLAN:END -->
