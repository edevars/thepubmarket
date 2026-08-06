---
id: TASK-028
title: Add webcam/camera capture to the seller photo manager
status: In Progress
assignee:
  - claude
created_date: '2026-08-06 01:52'
updated_date: '2026-08-06 01:54'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Design

All changes live in `apps/web/src/components/panel/PhotoManagerModal.tsx` — no new files, no new API surface. The camera is a second *source* of `File`s that feeds the exact same queue TASK-026 already built.

**Refactor first**: extract the per-file body of `handleFilesSelected`'s loop into `enqueueFile(file: File)` (creates the `UploadTask`, pushes it, awaits `runTask`). `handleFilesSelected` becomes a thin loop calling it; the camera's capture handler calls it once per shot. This is what makes AC#2 ("no separate upload code path") true by construction rather than by convention.

**New state/refs**: `cameraSupported` (computed once: `typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia` — SSR-safe even though in practice this component only ever mounts client-side after a click), `cameraOpen`, `cameraStarting`, `cameraError`, `videoRef` (`HTMLVideoElement`), `streamRef` (`MediaStream | null`, a ref not state since it's an imperative handle, not something that drives renders).

**Lifecycle**:
- `startCamera()`: `getUserMedia({ video: { facingMode: 'environment' }, audio: false })` (prefers the rear camera on phones, ignored harmlessly on a desktop webcam), stores the stream in `streamRef`, sets `cameraOpen`. Catches rejection (permission denied, no device, in-use) into one `cameraError` message — AC#4 doesn't require differentiating failure modes, just a legible one.
- A `useEffect` keyed on `cameraOpen` attaches `streamRef.current` to `videoRef.current.srcObject` once the `<video>` element exists (it doesn't exist until `cameraOpen` flips true and React commits).
- `stopCamera()`: stops every track on `streamRef.current`, clears the ref, closes the view — called by the explicit "close camera" button.
- A mount-only `useEffect` cleanup (`return () => streamRef.current?.getTracks().forEach(t => t.stop())`) releases the stream on unmount — this is what covers "closing the whole modal" (which unmounts `PhotoManagerModal` via the parent's `{managingPhotosFor && <PhotoManagerModal/>}` conditional) without needing to special-case the modal's own close button. Satisfies AC#5's three release points (camera-view close, modal close, unmount) with one mechanism instead of three.

**Capture**: draws the current `<video>` frame to an off-DOM `<canvas>` at the video's native resolution, `canvas.toBlob('image/jpeg', 0.92)`, wraps it in a `File`, calls `enqueueFile(file)`. Quality 0.92 here is deliberately not the final quality — `resizeImageForUpload` inside `runTask` re-compresses to 1600px/0.85 exactly like a picked file would, so the capture step's only job is "produce a File," not "produce a finished photo."

**Cap enforcement**: the "Use camera" trigger and the "Capture" button both get `disabled={atCap}`, same flag the file input already uses — no new cap logic.

**UI placement**: a "Use camera" button next to "Add photos" in the existing toolbar row (hidden entirely when `!cameraSupported`, satisfying AC#6); when `cameraOpen`, an inline block (video preview + Capture/Close buttons) replaces that button, positioned above the photo/upload list.

**i18n**: 4 new `panel.*` keys — `photoCameraCta`, `photoCameraCapture`, `photoCameraClose`, `cameraErrorAccess`. Capture-time failures (canvas/blob) reuse the existing `photoErrorGeneric` key rather than adding a redundant one.

**Docs**: append a subsection to `docs/ingenieria/fotos-inventario.md`'s existing TASK-026 UI section (or a new §11) with the manual checklist: open camera, grant/deny permission, capture into the same queue, hit the cap, close via the explicit button vs. closing the whole modal vs. navigating away, confirm no camera indicator stays lit in the OS/browser afterward.

No payment/payout/Stripe code touched.
<!-- SECTION:PLAN:END -->
