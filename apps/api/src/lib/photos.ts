/**
 * Inventory photo helpers: magic-byte image detection, R2 key construction,
 * the row→DTO mapping, and the batched loader the catalog/panel routes use.
 *
 * The detection/key/DTO functions are pure — no I/O, unit-testable without a
 * Workers runtime (same convention as lib/delivery.ts, lib/stripe.ts).
 * `loadPhotosByInventoryId` is the one exception: it queries D1, because a
 * per-item query from every route that lists inventory would be an N+1.
 *
 * The server never trusts a client-declared Content-Type or filename. Image
 * validity is decided by inspecting the first bytes of the body: a renamed
 * .txt or a truncated upload fails detection regardless of what the request
 * claims.
 */
import type { Db, InventoryPhotoRow } from '@thepubmarket/db'
import { inventoryPhotos } from '@thepubmarket/db'
import type { InventoryPhoto } from '@thepubmarket/shared'
import { asc, inArray } from 'drizzle-orm'
import { selectByIds } from './d1-batch'

export type ImageKind = 'jpeg' | 'png' | 'webp'

/**
 * Fixed prefix every R2 object key lives under. Exported so the streaming
 * route (TASK-025) can refuse to serve a row whose key somehow landed outside
 * it — belt-and-suspenders on top of the fact that `buildPhotoKey` is the only
 * writer of this column.
 */
export const PHOTO_KEY_PREFIX = 'inventory-photos/'

/** Max upload size per photo. Workers' body limit is far above this. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const CONTENT_TYPE: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const EXTENSION: Record<ImageKind, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
}

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false
  }
  return true
}

/**
 * Detects JPEG/PNG/WebP from magic bytes. Returns null for anything else,
 * including a file too short to carry a full signature.
 */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  // WebP: 'RIFF' container (bytes 0-3), 4-byte chunk size, 'WEBP' fourcc (bytes 8-11).
  if (matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    return 'webp'
  }
  return null
}

export function contentTypeFor(kind: ImageKind): string {
  return CONTENT_TYPE[kind]
}

/**
 * Server-generated, non-guessable R2 key. UUIDs only — the client's filename
 * never reaches the key — under a fixed prefix so a future public route can
 * allowlist by prefix. Keys are immutable: a photo is never overwritten, which
 * is what makes long-lived caching safe downstream.
 */
export function buildPhotoKey(params: {
  sellerId: string
  inventoryId: string
  photoId: string
  kind: ImageKind
}): string {
  const { sellerId, inventoryId, photoId, kind } = params
  return `${PHOTO_KEY_PREFIX}${sellerId}/${inventoryId}/${photoId}.${EXTENSION[kind]}`
}

/**
 * Maps a DB row to the public `InventoryPhoto` DTO. `origin` builds the
 * absolute URL served by `GET /photos/:id` (routes/photos.ts).
 */
export function rowToInventoryPhoto(row: InventoryPhotoRow, origin: string): InventoryPhoto {
  return {
    id: row.id,
    url: `${origin}/photos/${row.id}`,
    sortOrder: row.sortOrder,
  }
}

/**
 * Loads every photo for the given inventory ids, grouped by listing and
 * ordered by `sort_order`. Mirrors the batched-seller-lookup pattern already
 * used in catalog.ts / seller-panel.ts — no per-item query for a page of
 * results. Skips the query entirely for an empty input.
 *
 * Batched through `selectByIds`: a page of listings binds one parameter per
 * id and D1 caps a statement at 100, so a big page has to be split or the
 * whole catalog request 500s (TASK-047). A normal page still costs one query.
 */
export async function loadPhotosByInventoryId(
  db: Db,
  inventoryIds: string[],
  origin: string,
): Promise<Map<string, InventoryPhoto[]>> {
  const byInventoryId = new Map<string, InventoryPhoto[]>()

  const rows = await selectByIds(inventoryIds, (chunk) =>
    db
      .select()
      .from(inventoryPhotos)
      .where(inArray(inventoryPhotos.inventoryId, chunk))
      .orderBy(asc(inventoryPhotos.sortOrder))
      .all(),
  )

  for (const row of rows) {
    const list = byInventoryId.get(row.inventoryId) ?? []
    list.push(rowToInventoryPhoto(row, origin))
    byInventoryId.set(row.inventoryId, list)
  }
  return byInventoryId
}
