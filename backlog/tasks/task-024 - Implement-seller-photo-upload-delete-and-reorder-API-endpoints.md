---
id: TASK-024
title: 'Implement seller photo upload, delete, and reorder API endpoints'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 00:13'
updated_date: '2026-08-06 00:49'
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
  - apps/api/src/routes/seller-panel.ts
  - apps/api/src/routes/admin.ts
  - apps/api/src/lib/
  - docs/ingenieria/fotos-inventario.md
priority: high
type: feature
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sellers manage listing photos from their panel so buyers can judge real card condition before paying, but no API exists to upload the binaries. This task adds the authenticated write endpoints under the seller panel, storing binaries in the R2 `ASSETS` bucket (bucket is configured in apps/api/wrangler.jsonc but currently unused — this is the codebase's first R2 consumer).

Durable decisions already made:
- Uploads are PROXIED through the Worker, not presigned direct-to-R2. Presigned URLs would need account S3 credentials, an extra dependency, and post-upload reconciliation to validate type/size/quota after the object already exists. The proxy keeps auth, ownership, quota and validation in a single code path, and Workers' body limit is far above the 5 MB per-file cap. Fewer moving parts for a one-person team.
- The server never trusts client-supplied Content-Type or filename. Image validity is determined by inspecting magic bytes (JPEG/PNG/WebP).
- R2 object keys are server-generated and non-guessable: `inventory-photos/{sellerId}/{inventoryId}/{photoId}.{ext}` with UUIDs. Keys are immutable — a photo is never overwritten, which is what makes long-lived caching safe downstream.
- Per-listing cap is 6 photos (`MAX_PHOTOS_PER_ITEM` from packages/shared).
- Photos are allowed regardless of listing quantity, and are never mandatory — no condition-based (HP/DMG) requirement in v1.
- Moderation lever for v1 is an admin hard-delete endpoint, not a buyer report flow. Sellers are vetted by invitation, so the operator removing a photo directly is proportionate.
- Deletes remove the DB row first, then best-effort delete the R2 object.

Note on tests: apps/api runs vitest against pure modules under src/lib/ only; route handlers are validated by documented manual/E2E passes. Follow that convention rather than introducing a new test harness.

This feature touches no payment, payout or Stripe code path — no fund-custody implications.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `POST /seller/inventory/:id/photos` accepts a raw image body, stores the object in R2, persists the metadata row, and returns 201 with the photo DTO
- [ ] #2 Non-image payloads are rejected with 400 based on magic-byte inspection, not the declared Content-Type; a renamed .txt or a truncated file is rejected
- [ ] #3 Payloads over 5 MB are rejected with 400 and a distinct error code
- [ ] #4 Uploading a 7th photo to a listing is rejected with 409 and a distinct error code
- [ ] #5 Uploading, deleting or reordering photos on another seller's listing returns an opaque 404, matching the existing seller-panel ownership pattern; no query trusts a client-supplied seller id
- [ ] #6 R2 keys are server-generated with UUIDs under the inventory-photos/ prefix; the client-supplied filename is never used in the key
- [ ] #7 `DELETE /seller/inventory/:id/photos/:photoId` deletes the DB row first and then best-effort deletes the R2 object; a photo id belonging to another listing returns 404
- [ ] #8 A reorder endpoint accepts a full ordering of photo ids, validates that the submitted set exactly matches the listing's photos, persists sort order, and rejects mismatched or partial sets with 400
- [ ] #9 An admin-authenticated endpoint can hard-delete any photo, using the existing admin auth mechanism
- [ ] #10 Magic-byte detection and R2 key building live in a pure module under apps/api/src/lib/ with vitest coverage for valid JPEG/PNG/WebP headers, truncated files, and renamed non-images
- [ ] #11 New endpoints, error codes and validation rules are documented in docs/ingenieria/fotos-inventario.md (Spanish), including an explicit note that the feature touches no fund flow
<!-- AC:END -->
