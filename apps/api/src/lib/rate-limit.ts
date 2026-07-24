/**
 * KV-based fixed-window rate limiting for auth endpoints. Interim,
 * complementary measure pending Cloudflare Turnstile (TASK-012) — KV
 * reads/writes aren't atomic, so concurrent bursts can under-count. That's
 * an accepted tradeoff for a deterrent layer, not a hard guarantee.
 *
 * Reuses the SESSIONS KV binding (no new binding needed).
 */

interface Bucket {
  count: number
  windowStart: number
}

const rlKey = (bucket: string, id: string) => `rl:${bucket}:${id}`

/** Increments the counter for (bucket, id); returns false once `limit` is exceeded within `windowSeconds`. */
export async function checkRateLimit(
  kv: KVNamespace,
  bucket: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = rlKey(bucket, id)
  const now = Math.floor(Date.now() / 1000)
  const raw = await kv.get(key)
  let state: Bucket = raw ? (JSON.parse(raw) as Bucket) : { count: 0, windowStart: now }
  if (now - state.windowStart >= windowSeconds) state = { count: 0, windowStart: now }
  state.count += 1
  await kv.put(key, JSON.stringify(state), { expirationTtl: windowSeconds })
  return state.count <= limit
}

/** `cf-connecting-ip` header, or 'unknown' as a fallback (e.g. local `wrangler dev`). */
export function clientIp(header: string | undefined | null): string {
  return header ?? 'unknown'
}
