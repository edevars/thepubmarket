/**
 * Turnstile gate for the endpoints a bot would target: account creation,
 * sign-in, the password-reset mails, and checkout.
 *
 * Mounted **before** the expensive work on each route (KDF derivations, session
 * lookups, Stripe calls, inventory reservations), so a rejected request costs
 * one siteverify round trip and nothing else.
 *
 * Rejection is `403 turnstile_failed`; the frontend maps it to its own copy.
 * `429 rate_limited` stays reserved for the KV counters in lib/rate-limit.ts,
 * so the two layers remain distinguishable in logs and in the UI.
 */
import { createMiddleware } from 'hono/factory'
import { clientIp } from '../lib/rate-limit'
import { verifyTurnstile } from '../lib/turnstile'
import type { AppEnv } from '../types'

/** Header carrying the widget token. Same name Cloudflare uses for the form field. */
export const TURNSTILE_HEADER = 'cf-turnstile-response'

export const turnstileGuard = createMiddleware<AppEnv>(async (c, next) => {
  const result = await verifyTurnstile(
    c.env.TURNSTILE_SECRET_KEY,
    c.req.header(TURNSTILE_HEADER),
    clientIp(c.req.header('cf-connecting-ip')),
  )

  if (!result.ok) {
    console.warn(`turnstile: rejected ${c.req.method} ${c.req.path} (${result.reason})`)
    return c.json({ error: 'turnstile_failed' }, 403)
  }

  return next()
})
