/**
 * Buyer/seller auth (Phase 2→3): email+password + KV sessions.
 *
 * Flow (cross-origin, no cookies):
 *   1. POST /auth/register {email, password}       → creates the account (or
 *      claims a legacy passwordless one), returns { sessionToken, user }.
 *   2. POST /auth/login {email, password}           → verifies credentials,
 *      returns { sessionToken, user }.
 *   3. POST /auth/password/forgot {email}           → emails a single-use
 *      reset link (`${WEB_BASE_URL}/auth/reset-password?token=...`).
 *   4. POST /auth/password/reset {token, password}  → consumes the token,
 *      sets the new password, returns { sessionToken, user }.
 *   5. The frontend stores sessionToken and sends it as `Authorization: Bearer`.
 */
import { users } from '@thepubmarket/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  bearerToken,
  consumeResetToken,
  createResetToken,
  createSession,
  deleteAllUserSessions,
  deleteSession,
} from '../lib/auth'
import { sendPasswordResetEmail } from '../lib/email'
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from '../lib/password'
import { checkRateLimit, clientIp, isRateLimited, recordAttempt } from '../lib/rate-limit'
import { buyerAuth } from '../middleware/buyer-auth'
import type { AppEnv, SessionUser } from '../types'

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(256),
  displayName: z.string().trim().min(1).max(80).optional(),
})
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
})
const forgotSchema = z.object({ email: z.string().email().max(254) })
const resetSchema = z.object({
  token: z.string().min(16).max(128),
  password: z.string().min(10).max(256),
})

function toSessionUser(row: {
  id: string
  email: string
  role: 'buyer' | 'admin'
  displayName: string | null
}): SessionUser {
  return { id: row.id, email: row.email, role: row.role, displayName: row.displayName }
}

export const auth = new Hono<AppEnv>()

/**
 * POST /auth/register — creates an account (or claims a legacy passwordless one).
 *
 * Buyers only, always: `role` is hardcoded to 'buyer' and `registerSchema`
 * strips unknown keys, so a caller can't smuggle in `role` or a seller link.
 * Becoming a seller requires an admin to create the `sellers` row and run
 * `POST /admin/sellers/:id/link` — there is no self-registration path
 * (see docs/ingenieria/invitacion-sellers.md).
 */
auth.post('/register', async (c) => {
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)

  const ip = clientIp(c.req.header('cf-connecting-ip'))
  if (!(await checkRateLimit(c.env.SESSIONS, 'register:ip', ip, 5, 60 * 60))) {
    return c.json({ error: 'rate_limited' }, 429)
  }

  const email = parsed.data.email.trim().toLowerCase()
  const db = c.get('db')
  const existing = await db.select().from(users).where(eq(users.email, email)).get()

  if (existing?.passwordHash) {
    return c.json({ error: 'email_taken' }, 409)
  }

  const passwordHash = await hashPassword(parsed.data.password)
  const row = existing
    ? (
        await db
          .update(users)
          .set({ passwordHash, displayName: parsed.data.displayName ?? existing.displayName })
          .where(eq(users.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(users)
          .values({
            id: crypto.randomUUID(),
            email,
            passwordHash,
            displayName: parsed.data.displayName,
            role: 'buyer',
          })
          .returning()
      )[0]

  if (!row) return c.json({ error: 'user_upsert_failed' }, 500)

  const user = toSessionUser(row)
  const sessionToken = await createSession(c.env.SESSIONS, user)
  return c.json({ sessionToken, user }, 201)
})

const LOGIN_WINDOW_SECONDS = 10 * 60
const LOGIN_EMAIL_LIMIT = 8

/**
 * POST /auth/login — verifies email+password, returns a session.
 *
 * Two deliberate properties on the failure paths:
 *
 * - **No account-existence oracle.** An unknown email, an account with no
 *   password set, and a wrong password all return the same `401
 *   invalid_credentials`. The first two also burn an equivalent KDF derivation
 *   (`dummyVerify`) so response *timing* doesn't leak the difference either.
 * - **Failures, not attempts, fill the per-email bucket.** A buyer signing in
 *   correctly all day never approaches the limit; a guessing run hits it in 8.
 *   The per-IP bucket still counts every attempt (cheap blanket cap).
 */
auth.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)

  const ip = clientIp(c.req.header('cf-connecting-ip'))
  const email = parsed.data.email.trim().toLowerCase()
  const kv = c.env.SESSIONS
  const ipOk = await checkRateLimit(kv, 'login:ip', ip, 20, LOGIN_WINDOW_SECONDS)
  const emailOk = !(await isRateLimited(
    kv,
    'login:email',
    email,
    LOGIN_EMAIL_LIMIT,
    LOGIN_WINDOW_SECONDS,
  ))
  if (!ipOk || !emailOk) return c.json({ error: 'rate_limited' }, 429)

  const failed = async () => {
    await recordAttempt(kv, 'login:email', email, LOGIN_WINDOW_SECONDS)
    return c.json({ error: 'invalid_credentials' }, 401)
  }

  const db = c.get('db')
  const row = await db.select().from(users).where(eq(users.email, email)).get()
  if (!row?.passwordHash) {
    await dummyVerify(parsed.data.password)
    return failed()
  }

  if (!(await verifyPassword(parsed.data.password, row.passwordHash))) return failed()

  // Upgrade hashes written under weaker KDF params. One-time cost per user,
  // and the stored format carries its own params so the old hash stays valid
  // until this succeeds.
  if (needsRehash(row.passwordHash)) {
    const passwordHash = await hashPassword(parsed.data.password)
    await db.update(users).set({ passwordHash }).where(eq(users.id, row.id))
  }

  const user = toSessionUser(row)
  const sessionToken = await createSession(kv, user)
  return c.json({ sessionToken, user })
})

/** POST /auth/password/forgot — emails a reset link if the account exists. */
auth.post('/password/forgot', async (c) => {
  const parsed = forgotSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_email' }, 400)

  const ip = clientIp(c.req.header('cf-connecting-ip'))
  const email = parsed.data.email.trim().toLowerCase()
  const ipOk = await checkRateLimit(c.env.SESSIONS, 'forgot:ip', ip, 10, 60 * 60)
  const emailOk = await checkRateLimit(c.env.SESSIONS, 'forgot:email', email, 3, 60 * 60)
  if (!ipOk || !emailOk) return c.json({ error: 'rate_limited' }, 429)

  const db = c.get('db')
  const existing = await db.select().from(users).where(eq(users.email, email)).get()
  if (existing) {
    const token = await createResetToken(c.env.SESSIONS, email)
    const link = `${c.env.WEB_BASE_URL}/auth/reset-password?token=${token}`
    await sendPasswordResetEmail(email, link)
  }

  // Neutral response: doesn't reveal whether the email has an account.
  return c.json({ ok: true })
})

/** POST /auth/password/reset — consumes the token, sets a new password, signs in. */
auth.post('/password/reset', async (c) => {
  const parsed = resetSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)

  const ip = clientIp(c.req.header('cf-connecting-ip'))
  if (!(await checkRateLimit(c.env.SESSIONS, 'reset:ip', ip, 20, 60 * 60))) {
    return c.json({ error: 'rate_limited' }, 429)
  }

  const email = await consumeResetToken(c.env.SESSIONS, parsed.data.token)
  if (!email) return c.json({ error: 'invalid_or_expired' }, 400)

  const db = c.get('db')
  const passwordHash = await hashPassword(parsed.data.password)
  const row = (
    await db.update(users).set({ passwordHash }).where(eq(users.email, email)).returning()
  )[0]
  if (!row) return c.json({ error: 'user_not_found' }, 404)

  // A password change revokes every session issued under the old one — the
  // point of resetting after a compromise is that the attacker loses access,
  // which doesn't happen if their 7-day session survives. Revoke first, then
  // mint the new session so the caller stays signed in on this device only.
  await deleteAllUserSessions(c.env.SESSIONS, row.id)

  const user = toSessionUser(row)
  const sessionToken = await createSession(c.env.SESSIONS, user)
  return c.json({ sessionToken, user })
})

/** POST /auth/logout — invalidates the current session. */
auth.post('/logout', async (c) => {
  const token = bearerToken(c.req.header('Authorization'))
  if (token) await deleteSession(c.env.SESSIONS, token)
  return c.json({ ok: true })
})

/** GET /auth/me — the current session's user (401 if none). */
auth.get('/me', buyerAuth, (c) => {
  return c.json({ user: c.get('user') })
})
