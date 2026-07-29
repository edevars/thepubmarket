/**
 * Cloudflare Turnstile verification (server side).
 *
 * The browser widget produces a single-use token; the Worker exchanges it with
 * Cloudflare's `siteverify` endpoint before doing any real work. The token
 * travels in the `cf-turnstile-response` header (see middleware/turnstile.ts),
 * so no request body schema had to change.
 *
 * Two deliberate properties:
 *
 * - **Fails closed on a bad or unreachable siteverify.** A transient failure
 *   rejects the request instead of waving it through; the caller retries. The
 *   only bypass is the one below.
 * - **Bypasses when `TURNSTILE_SECRET_KEY` is unset.** Local `wrangler dev` and
 *   the curl-driven flows in docs/ingenieria/ have no widget to produce a token.
 *   Production MUST set the secret — it is on docs/ingenieria/checklist-go-live-real.md,
 *   and every skipped verification logs a warning.
 *
 * Complements, and does not replace, the KV rate limiting in lib/rate-limit.ts.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileResult = { ok: true } | { ok: false; reason: string }

interface SiteverifyResponse {
  success: boolean
  'error-codes'?: string[]
}

/**
 * Exchanges a widget token for a verdict.
 *
 * @param secret   `TURNSTILE_SECRET_KEY`; when undefined/empty, verification is skipped.
 * @param token    Value of the `cf-turnstile-response` header.
 * @param remoteIp `cf-connecting-ip`, forwarded to siteverify when known.
 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined | null,
  remoteIp?: string,
): Promise<TurnstileResult> {
  if (!secret) {
    console.warn('turnstile: TURNSTILE_SECRET_KEY is unset — skipping verification')
    return { ok: true }
  }
  if (!token) return { ok: false, reason: 'missing-input-response' }

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp && remoteIp !== 'unknown') body.set('remoteip', remoteIp)

  let data: SiteverifyResponse
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return { ok: false, reason: `siteverify-http-${res.status}` }
    data = (await res.json()) as SiteverifyResponse
  } catch (err) {
    console.error('turnstile: siteverify request failed', err)
    return { ok: false, reason: 'siteverify-unreachable' }
  }

  if (data.success) return { ok: true }
  return { ok: false, reason: data['error-codes']?.join(',') || 'unknown' }
}
