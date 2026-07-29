/**
 * KV-based fixed-window rate limiting for auth endpoints. Interim,
 * complementary measure pending Cloudflare Turnstile (TASK-012) — KV
 * reads/writes aren't atomic, so concurrent bursts can under-count. That's
 * an accepted tradeoff for a deterrent layer, not a hard guarantee.
 *
 * Reuses the SESSIONS KV binding (no new binding needed).
 *
 * Two shapes: `checkRateLimit` charges every call (a blanket per-IP cap), and
 * `isRateLimited` + `recordAttempt` let a caller charge only the failures (a
 * per-account cap that a legitimate user can't trip). See docs/ingenieria/auth-hardening.md.
 */

interface Bucket {
  count: number
  windowStart: number
}

const rlKey = (bucket: string, id: string) => `rl:${bucket}:${id}`

/** Reads the live counter for (bucket, id), treating an elapsed window as reset. */
async function readBucket(kv: KVNamespace, key: string, windowSeconds: number): Promise<Bucket> {
  const now = Math.floor(Date.now() / 1000)
  const raw = await kv.get(key)
  if (!raw) return { count: 0, windowStart: now }
  let state: Bucket
  try {
    state = JSON.parse(raw) as Bucket
  } catch {
    return { count: 0, windowStart: now }
  }
  if (now - state.windowStart >= windowSeconds) return { count: 0, windowStart: now }
  return state
}

/** Increments the counter for (bucket, id); returns false once `limit` is exceeded within `windowSeconds`. */
export async function checkRateLimit(
  kv: KVNamespace,
  bucket: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = rlKey(bucket, id)
  const state = await readBucket(kv, key, windowSeconds)
  state.count += 1
  await kv.put(key, JSON.stringify(state), { expirationTtl: windowSeconds })
  return state.count <= limit
}

/**
 * Read-only counterpart of `checkRateLimit`: reports whether (bucket, id) has
 * already hit `limit` without consuming budget.
 *
 * Pair it with `recordAttempt` on the failure path when a *successful* request
 * shouldn't count against the limit — e.g. a buyer who signs in correctly ten
 * times in a morning must not get locked out by the same counter that stops a
 * password-guessing run.
 */
export async function isRateLimited(
  kv: KVNamespace,
  bucket: string,
  id: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const state = await readBucket(kv, rlKey(bucket, id), windowSeconds)
  return state.count >= limit
}

/** Charges one attempt against (bucket, id) without evaluating the limit. */
export async function recordAttempt(
  kv: KVNamespace,
  bucket: string,
  id: string,
  windowSeconds: number,
): Promise<void> {
  const key = rlKey(bucket, id)
  const state = await readBucket(kv, key, windowSeconds)
  state.count += 1
  await kv.put(key, JSON.stringify(state), { expirationTtl: windowSeconds })
}

/** `cf-connecting-ip` header, or 'unknown' as a fallback (e.g. local `wrangler dev`). */
export function clientIp(header: string | undefined | null): string {
  return header ?? 'unknown'
}
