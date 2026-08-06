/**
 * Card-image mirroring helpers (TASK-036): R2 key construction, filename
 * validation for the public route, and the Worker-side fetch that copies a
 * catalog image from its source CDN into our bucket.
 *
 * Key/validation functions are pure — no I/O, unit-testable without a Workers
 * runtime (same convention as lib/photos.ts). `ensureCardImage` is the one
 * exception: it talks to R2 and to the source CDN.
 *
 * Unlike inventory photos (UUID keys, one per upload), catalog images use the
 * card's own catalog id as the key: printings are immutable and their ids
 * ("UNL-131") are stable and filesystem-safe, so the key is deterministic —
 * which is what lets the public route skip a DB lookup and what makes re-runs
 * of the importer idempotent (an existing object is never re-fetched).
 */
import { detectImageKind, MAX_PHOTO_BYTES } from './photos'

/** Fixed prefix every catalog-image key lives under (cf. PHOTO_KEY_PREFIX). */
export const CARD_IMAGE_KEY_PREFIX = 'card-images/'

/**
 * Hosts the Worker is willing to fetch card images FROM. The ingest endpoint
 * is admin-gated, but source URLs still arrive in the request body — without
 * this allowlist the endpoint would be an authenticated SSRF proxy.
 */
export const ALLOWED_IMAGE_SOURCE_HOSTS: readonly string[] = ['static.dotgg.gg']

export type CardImageSide = 'front' | 'back'

/** Outcome of mirroring one image. Never throws: one bad image ≠ failed batch. */
export type EnsureImageResult = 'uploaded' | 'exists' | 'failed'

/**
 * Catalog ids that may become part of an R2 key. Alphanumerics and dashes
 * only — no slashes, no dots — so a key can never escape its prefix.
 */
const CATALOG_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/

/**
 * Filenames the public route serves: `<catalogId>.webp` (front, optionally
 * `-back` suffixed). Same character set as CATALOG_ID_RE plus the extension.
 */
const IMAGE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,68}\.webp$/

const IMAGE_FETCH_HEADERS: HeadersInit = {
  // TODO: poner un contacto/URL real cuando exista el dominio en producción.
  'User-Agent': 'ThePubMarket/0.1 (+https://thepubmarket.mx; contacto@thepubmarket.mx)',
  Accept: 'image/webp,image/*',
}

const IMAGE_FETCH_TIMEOUT_MS = 15_000

export function isValidCatalogId(catalogId: string): boolean {
  return CATALOG_ID_RE.test(catalogId)
}

/** Valida el nombre de archivo que llega a `GET /card-images/:tcg/:file`. */
export function isValidCardImageFile(file: string): boolean {
  return IMAGE_FILE_RE.test(file)
}

/**
 * Deterministic, immutable R2 key for a catalog image:
 * `card-images/riftbound/UNL-131.webp` / `card-images/riftbound/UNL-131-back.webp`.
 * Caller must have validated `catalogId` (the ingest endpoint's zod schema does).
 */
export function buildCardImageKey(tcg: string, catalogId: string, side: CardImageSide): string {
  const suffix = side === 'back' ? '-back' : ''
  return `${CARD_IMAGE_KEY_PREFIX}${tcg}/${catalogId}${suffix}.webp`
}

/**
 * Mirrors one image into R2 if it isn't there yet.
 *
 *   1. `head()` first — an existing object is never re-fetched or overwritten
 *      (immutable keys), which is the idempotency fast path for re-runs.
 *   2. Fetches the source (allowlisted hosts only) with timeout + identifying
 *      User-Agent, validates by magic bytes (webp expected — a CDN error page
 *      or truncated body fails detection) and caps the size.
 *
 * Returns 'failed' instead of throwing so the ingest endpoint can report
 * per-card status and keep going; the row's NULL `image_r2_key` marks the
 * image for retry on the next importer run.
 */
export async function ensureCardImage(
  bucket: R2Bucket,
  key: string,
  sourceUrl: string,
): Promise<EnsureImageResult> {
  try {
    const existing = await bucket.head(key)
    if (existing) return 'exists'

    const url = new URL(sourceUrl)
    if (url.protocol !== 'https:' || !ALLOWED_IMAGE_SOURCE_HOSTS.includes(url.hostname)) {
      console.error('card-images: source host not allowlisted', sourceUrl)
      return 'failed'
    }

    const res = await fetch(url, {
      headers: IMAGE_FETCH_HEADERS,
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`card-images: source fetch failed (${res.status})`, sourceUrl)
      return 'failed'
    }

    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_PHOTO_BYTES) {
      console.error(`card-images: source size out of bounds (${buf.byteLength})`, sourceUrl)
      return 'failed'
    }
    if (detectImageKind(new Uint8Array(buf)) !== 'webp') {
      console.error('card-images: source is not a webp image', sourceUrl)
      return 'failed'
    }

    await bucket.put(key, buf, { httpMetadata: { contentType: 'image/webp' } })
    return 'uploaded'
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    console.error(`card-images: mirror failed (${reason})`, key, sourceUrl)
    return 'failed'
  }
}
