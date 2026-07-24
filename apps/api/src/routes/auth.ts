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
  deleteSession,
} from '../lib/auth'
import { sendPasswordResetEmail } from '../lib/email'
import { hashPassword, verifyPassword } from '../lib/password'
import { checkRateLimit, clientIp } from '../lib/rate-limit'
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

/** POST /auth/register — creates an account (or claims a legacy passwordless one). */
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

/** POST /auth/login — verifies email+password, returns a session. */
auth.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)

  const ip = clientIp(c.req.header('cf-connecting-ip'))
  const email = parsed.data.email.trim().toLowerCase()
  const ipOk = await checkRateLimit(c.env.SESSIONS, 'login:ip', ip, 20, 10 * 60)
  const emailOk = await checkRateLimit(c.env.SESSIONS, 'login:email', email, 8, 10 * 60)
  if (!ipOk || !emailOk) return c.json({ error: 'rate_limited' }, 429)

  const db = c.get('db')
  const row = await db.select().from(users).where(eq(users.email, email)).get()
  if (!row) return c.json({ error: 'invalid_credentials' }, 401)
  if (!row.passwordHash) return c.json({ error: 'password_not_set' }, 403)

  const valid = await verifyPassword(parsed.data.password, row.passwordHash)
  if (!valid) return c.json({ error: 'invalid_credentials' }, 401)

  const user = toSessionUser(row)
  const sessionToken = await createSession(c.env.SESSIONS, user)
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

  // Known limitation: this doesn't invalidate the user's other existing
  // sessions (no user→sessions reverse index in KV today). Acceptable at
  // current volume; revisit if this becomes a live threat.
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
