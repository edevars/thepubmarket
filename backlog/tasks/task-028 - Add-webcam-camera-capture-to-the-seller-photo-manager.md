---
id: TASK-028
title: Add webcam/camera capture to the seller photo manager
status: In Progress
assignee:
  - claude
created_date: '2026-08-06 01:52'
updated_date: '2026-08-06 01:53'
labels:
  - 'epic:inventory-photos'
  - frontend
milestone: m-2
dependencies:
  - TASK-026
documentation:
  - docs/ingenieria/fotos-inventario.md
modified_files:
  - apps/web/src/components/panel/PhotoManagerModal.tsx
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - docs/ingenieria/fotos-inventario.md
priority: medium
type: feature
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-026 built file-picker upload for listing photos. This adds a second capture path: taking a photo directly with the device's camera (webcam at the physical store counter, or a phone's camera) without leaving the photo manager modal — useful at The Pub Game Store's counter where staff can photograph a card straight into the listing instead of taking a photo with a phone and transferring it.

Scope:
- A "Use camera" control next to "Add photos" in `PhotoManagerModal`, opening a live preview via `navigator.mediaDevices.getUserMedia` inside the same modal (no new route/page).
- A capture button grabs the current video frame (canvas), producing a `File` that is fed through the *same* pipeline TASK-026 already built: `resizeImageForUpload` (1600px/JPEG re-encode) → the same serial upload queue → the same retry/error-state UI. No parallel/duplicate upload code path.
- Multiple captures allowed in one camera session, gated by the same 6-photo cap as file uploads.
- Camera stream must be released (all tracks stopped) on: closing the camera view, closing the whole modal, and unmount — never left running.
- Permission denial / no camera available degrades to a legible bilingual message, not a crash; the rest of the modal (file picker, existing photos) stays usable.
- The control itself is hidden when `navigator.mediaDevices?.getUserMedia` isn't available (e.g. non-secure context) rather than shown and guaranteed to fail.

This feature touches no payment, payout, or Stripe code path — no fund-custody implications.

Note on tests: apps/web UI flows in this project are validated by a documented manual E2E pass, not an automated browser suite (getUserMedia in particular has no meaningful headless-test story here). Follow that convention.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Seller can open a live camera preview from the photo manager modal without leaving it, when the browser/device supports it
- [ ] #2 A capture button takes a still frame and enqueues it through the exact same resize/upload pipeline used for file selection (same size/EXIF handling, same serial queue, same retryable error states) — no separate upload code path
- [ ] #3 Multiple photos can be captured in one camera session up to the 6-photo cap; the camera control disables/hides at cap the same way the file picker does
- [ ] #4 Camera permission denial or no available camera shows a legible bilingual message and leaves the rest of the modal fully usable, never a hard crash
- [ ] #5 The camera stream (all tracks) is released when the camera view closes, when the whole photo modal closes, and if the component unmounts while the stream is open
- [ ] #6 The camera control is hidden entirely when getUserMedia isn't available in the current context, rather than shown and always failing
- [ ] #7 All new strings exist in both the Spanish and English message catalogs
- [ ] #8 A manual E2E checklist covering camera capture, permission denial, cap enforcement, and stream cleanup is appended to docs/ingenieria/fotos-inventario.md
<!-- AC:END -->
