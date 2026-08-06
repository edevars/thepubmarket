---
id: TASK-024
title: 'Implement seller photo upload, delete, and reorder API endpoints'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-06 00:13'
updated_date: '2026-08-06 00:52'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Proxy-through-the-Worker upload (per the durable decision), one pure module for
everything that can be unit-tested without I/O, thin route handlers that reuse
the existing ownership-via-WHERE pattern already used throughout seller-panel.ts.

## URL scheme decision (needed now, consumed by TASK-025)

The photo DTO needs an absolute `url` even though the public streaming route is
TASK-025's job. Using `new URL(c.req.url).origin + '/photos/' + photoId` — no new
env var, correct in any environment (local wrangler dev, prod), and keyed by
photo id (not the raw R2 key) so TASK-025's route resolves the key server-side
per its own AC#6. This task does not mount `/photos/*`; the URL simply won't
200 until TASK-025 does.

## Steps

1. **`apps/api/src/lib/photos.ts`** (new, pure, no I/O) — `detectImageKind()`
   (JPEG/PNG/WebP magic bytes, null otherwise), `MAX_PHOTO_BYTES = 5 MiB`,
   `contentTypeFor()`, `buildPhotoKey({sellerId, inventoryId, photoId, kind})` →
   `inventory-photos/{sellerId}/{inventoryId}/{photoId}.{ext}`, and
   `rowToInventoryPhoto(row, origin)` mapping to the shared `InventoryPhoto` DTO
   (mirrors `rowToInventoryItem` in lib/inventory.ts).
2. **`apps/api/src/lib/photos.test.ts`** — valid JPEG/PNG/WebP headers, a
   truncated file (signature cut short), a renamed non-image (plain text
   bytes), and the key format.
3. **`apps/api/src/routes/seller-panel.ts`** — three endpoints, all behind the
   existing `sellerAuth` mount and the existing ownership-via-WHERE pattern
   (unowned listing → opaque 404, never a client-supplied sellerId):
   - `POST /inventory/:id/photos` — verify ownership; reject by
     `content-length` when present and lying is caught by the actual
     `byteLength` after reading; detect kind or 400 `invalid_image`; count
     existing photos, 409 `photo_limit_reached` at cap; `R2.put` before the DB
     insert; **re-check the count after insert** and roll back (delete row +
     best-effort R2 object) if two concurrent uploads both raced past the cap —
     closes the TOCTOU race without needing a real cross-table transaction,
     which D1/Drizzle doesn't give us here.
   - `DELETE /inventory/:id/photos/:photoId` — single guarded DELETE filtered
     by `id AND inventoryId AND sellerId` returns the row or nothing; DB row
     gone first, then best-effort `R2.delete` (logged, not surfaced — matches
     the orphan policy).
   - `POST /inventory/:id/photos/reorder` — body `{ order: string[] }`; the
     submitted id set must exactly equal the listing's current photo id set
     (size + membership check) or 400 `photo_set_mismatch`; each row's
     `sortOrder` update is independently guarded by `inventoryId`, so a stray id
     can never repoint into another listing's order even though there's no
     multi-row transaction.
4. **`apps/api/src/routes/admin.ts`** — `DELETE /admin/inventory/photos/:photoId`,
   already behind `adminAuth` mounted on `/admin/*` in index.ts. Same DB-first/
   R2-best-effort delete, no ownership filter (admin can touch any seller's
   photo — that's the moderation lever).
5. **`docs/ingenieria/fotos-inventario.md`** (new, Spanish) — endpoints, error
   codes, the magic-byte/size/cap rules, the URL scheme decision above (so
   TASK-025 doesn't have to re-derive it), the orphan policy, explicit
   no-fund-flow note. Add the index row to `docs/ingenieria/README.md`.
6. **Verify** — `pnpm typecheck`, `pnpm lint`, `pnpm --filter @thepubmarket/api test`.
   Then a manual pass against `wrangler dev` (which emulates R2 locally) with
   curl: upload a real JPEG (201 + DTO), upload a renamed .txt (400
   invalid_image), upload >5MB (400 photo_too_large), upload a 7th photo (409
   photo_limit_reached), delete (404 on someone else's listing via a second
   seller session, 200 + gone on your own), reorder (400 on a partial set, 200
   + persisted order on a full set). Recorded as the task's documented
   manual/E2E pass per the project's test convention (route handlers aren't
   covered by vitest here).

## Non-custodial check

Touches no payment, payout, Stripe or fund-flow code path. R2 object storage
and D1 metadata only.
<!-- SECTION:PLAN:END -->
