/**
 * Auth de compradores (Fase 2): magic link passwordless + sesiones en KV.
 *
 * Flujo (cross-origin, sin cookies):
 *   1. POST /auth/magic-link {email}  → genera token, envía link al email
 *      (el link apunta al FRONTEND: `${WEB_BASE_URL}/auth/verify?token=...`).
 *   2. POST /auth/verify {token}      → valida (un solo uso), crea/recupera el
 *      usuario, crea sesión y devuelve { sessionToken, user }.
 *   3. El frontend guarda sessionToken y lo envía como `Authorization: Bearer`.
 */
import { users } from '@thepubmarket/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  bearerToken,
  consumeMagicToken,
  createMagicToken,
  createSession,
  deleteSession,
} from '../lib/auth'
import { sendMagicLink } from '../lib/email'
import { buyerAuth } from '../middleware/buyer-auth'
import type { AppEnv, SessionUser } from '../types'

const emailSchema = z.object({ email: z.string().email().max(254) })
const verifySchema = z.object({ token: z.string().min(16).max(128) })

export const auth = new Hono<AppEnv>()

/** POST /auth/magic-link — envía un enlace de acceso al email indicado. */
auth.post('/magic-link', async (c) => {
  const parsed = emailSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_email' }, 400)

  const email = parsed.data.email.trim().toLowerCase()
  const token = await createMagicToken(c.env.SESSIONS, email)
  const link = `${c.env.WEB_BASE_URL}/auth/verify?token=${token}`
  await sendMagicLink(email, link)

  // Respuesta neutra: no revela si el email existe.
  return c.json({ ok: true })
})

/** POST /auth/verify — canjea el token de magic link por una sesión. */
auth.post('/verify', async (c) => {
  const parsed = verifySchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_token' }, 400)

  const email = await consumeMagicToken(c.env.SESSIONS, parsed.data.token)
  if (!email) return c.json({ error: 'invalid_or_expired' }, 400)

  const db = c.get('db')
  const existing = await db.select().from(users).where(eq(users.email, email)).get()
  const row =
    existing ??
    (
      await db.insert(users).values({ id: crypto.randomUUID(), email, role: 'buyer' }).returning()
    )[0]

  if (!row) return c.json({ error: 'user_upsert_failed' }, 500)

  const user: SessionUser = {
    id: row.id,
    email: row.email,
    role: row.role,
    displayName: row.displayName,
  }
  const sessionToken = await createSession(c.env.SESSIONS, user)
  return c.json({ sessionToken, user })
})

/** POST /auth/logout — invalida la sesión actual. */
auth.post('/logout', async (c) => {
  const token = bearerToken(c.req.header('Authorization'))
  if (token) await deleteSession(c.env.SESSIONS, token)
  return c.json({ ok: true })
})

/** GET /auth/me — usuario de la sesión actual (401 si no hay). */
auth.get('/me', buyerAuth, (c) => {
  return c.json({ user: c.get('user') })
})
