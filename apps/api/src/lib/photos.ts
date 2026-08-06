/**
 * Pure helpers for inventory photo uploads: magic-byte image detection, R2 key
 * construction and the row→DTO mapping. No I/O, so this is unit-testable
 * without a Workers runtime (same convention as lib/delivery.ts, lib/stripe.ts).
 *
 * The server never trusts a client-declared Content-Type or filename. Image
 * validity is decided by inspecting the first bytes of the body: a renamed
 * .txt or a truncated upload fails detection regardless of what the request
 * claims.
 */
import type { InventoryPhotoRow } from '@thepubmarket/db'
import type { InventoryPhoto } from '@thepubmarket/shared'

export type ImageKind = 'jpeg' | 'png' | 'webp'

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
  return `inventory-photos/${sellerId}/${inventoryId}/${photoId}.${EXTENSION[kind]}`
}

/**
 * Maps a DB row to the public `InventoryPhoto` DTO. `origin` builds the
 * absolute URL (`{origin}/photos/{id}`); the streaming route that resolves it
 * is TASK-025's job, this only fixes the shape both tasks agree on.
 */
export function rowToInventoryPhoto(row: InventoryPhotoRow, origin: string): InventoryPhoto {
  return {
    id: row.id,
    url: `${origin}/photos/${row.id}`,
    sortOrder: row.sortOrder,
  }
}
