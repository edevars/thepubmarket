/**
 * Public image route (TASK-025). Streams inventory photo binaries out of R2.
 *
 * Public and unauthenticated on purpose — these are catalog images, same
 * exposure as the Scryfall URLs already embedded in every listing. No R2 key
 * is ever accepted from the client: the id in the URL resolves to a row in
 * `inventory_photos`, and the row's `r2_key` (always written by
 * `buildPhotoKey`, always under `inventory-photos/`) is what actually gets
 * fetched. A route that took the key straight from the path could be walked
 * to read any object in the shared `thepubmarket-assets` bucket; this one
 * can't reach outside the prefix even in principle.
 *
 * Served through a Worker route rather than a public bucket/custom domain:
 * the bucket is shared and earmarked for more uses later (Scryfall image
 * migration, Phase 5), so making it public is all-or-nothing and needs manual
 * dashboard/DNS work. A route in code costs nothing extra and stays scoped to
 * this one prefix.
 *
 * Photo keys are immutable — a photo is never overwritten — so a hit is safe
 * to cache forever: `Cache-Control: immutable` for the browser, plus an
 * explicit write into the Workers Cache API so the edge itself stops asking
 * D1/R2 for the same id. Only successful lookups are cached; a 404 is never
 * stored; a re-upload always gets a fresh id, so there's no invalidation to
 * design for.
 */
import { inventoryPhotos } from '@thepubmarket/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { PHOTO_KEY_PREFIX } from '../lib/photos'
import type { AppEnv } from '../types'

const CACHE_CONTROL = 'public, max-age=31536000, immutable'

export const photosRoutes = new Hono<AppEnv>()

/** GET /photos/:id — streams the binary for one inventory photo. */
photosRoutes.get('/:id', async (c) => {
  const cache = caches.default
  // GET-only, unauthenticated, no Vary — the request URL alone is a valid
  // cache key.
  const cacheKey = new Request(c.req.url, { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const id = c.req.param('id')
  const row = await c
    .get('db')
    .select()
    .from(inventoryPhotos)
    .where(eq(inventoryPhotos.id, id))
    .get()
  if (!row) return c.json({ error: 'not_found' }, 404)

  // Defense in depth: every writer goes through `buildPhotoKey`, which always
  // prefixes with PHOTO_KEY_PREFIX, so this should never trip. If it ever
  // does — a future writer that skips the helper — refuse rather than fetch.
  if (!row.r2Key.startsWith(PHOTO_KEY_PREFIX)) {
    console.error('photos: r2Key outside the expected prefix', row.r2Key)
    return c.json({ error: 'not_found' }, 404)
  }

  const object = await c.env.ASSETS.get(row.r2Key)
  if (!object) {
    console.error('photos: DB row exists but the R2 object is missing', row.r2Key)
    return c.json({ error: 'not_found' }, 404)
  }

  const response = new Response(object.body, {
    headers: {
      'content-type': row.contentType,
      'content-length': String(row.sizeBytes),
      'cache-control': CACHE_CONTROL,
      etag: object.httpEtag,
    },
  })

  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
})
