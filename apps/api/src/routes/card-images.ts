/**
 * Public catalog-image route (TASK-036). Streams card images mirrored in R2.
 *
 * Public and unauthenticated on purpose — these are canonical card images,
 * the same exposure as the Scryfall/dotgg URLs already embedded in listings.
 *
 * Deliberate deviation from routes/photos.ts: there is NO DB lookup here.
 * Inventory photos resolve an id to a row because their keys are private
 * UUIDs; catalog-image keys are deterministic (`card-images/<tcg>/<id>.webp`,
 * only ever written by `buildCardImageKey`), so the validated path params ARE
 * the key. The regex allows only alphanumerics and dashes — no slashes, no
 * dot-segments — so a constructed key can never escape `card-images/<tcg>/`.
 *
 * Keys are immutable (a printing's image is never overwritten), so a hit is
 * cached forever: `Cache-Control: immutable` for the browser plus an explicit
 * Workers Cache API write so the edge stops hitting R2 for the same card.
 * Only hits are cached; a 404 (image not yet mirrored) is never stored, so it
 * heals as soon as the importer uploads the object.
 */
import { TCGS, type Tcg } from '@thepubmarket/shared'
import { Hono } from 'hono'
import { CARD_IMAGE_KEY_PREFIX, isValidCardImageFile } from '../lib/card-images'
import type { AppEnv } from '../types'

const CACHE_CONTROL = 'public, max-age=31536000, immutable'

export const cardImagesRoutes = new Hono<AppEnv>()

/** GET /card-images/:tcg/:file — streams one catalog card image from R2. */
cardImagesRoutes.get('/:tcg/:file', async (c) => {
  const tcg = c.req.param('tcg')
  const file = c.req.param('file')
  if (!TCGS.includes(tcg as Tcg) || !isValidCardImageFile(file)) {
    return c.json({ error: 'not_found' }, 404)
  }

  const cache = caches.default
  // GET-only, unauthenticated, no Vary — the request URL alone is a valid
  // cache key.
  const cacheKey = new Request(c.req.url, { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const object = await c.env.ASSETS.get(`${CARD_IMAGE_KEY_PREFIX}${tcg}/${file}`)
  if (!object) return c.json({ error: 'not_found' }, 404)

  const response = new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/webp',
      'content-length': String(object.size),
      'cache-control': CACHE_CONTROL,
      etag: object.httpEtag,
    },
  })

  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
})
