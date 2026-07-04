/**
 * Middleware de autenticación de vendedor (Panel del Vendedor).
 *
 * Misma sesión magic-link que buyerAuth; la identidad de seller NO vive en el
 * token: se resuelve EN VIVO buscando la fila de `sellers` con
 * `user_id = sesión.user.id` (índice idx_sellers_user_id). Así, vincular a un
 * usuario (seed o /admin/sellers/:id/link) surte efecto sin re-login, y
 * suspender un seller lo saca del panel al instante.
 *
 * 401 sin sesión válida; 403 `not_a_seller` si el usuario no tiene tienda
 * activa. No toca `users.role` (identidad seller = fila en sellers).
 */
import { sellers } from '@thepubmarket/db'
import { and, eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { bearerToken, getSession } from '../lib/auth'
import type { AppEnv } from '../types'

export const sellerAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerToken(c.req.header('Authorization'))
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  const user = await getSession(c.env.SESSIONS, token)
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const seller = await c
    .get('db')
    .select()
    .from(sellers)
    .where(and(eq(sellers.userId, user.id), eq(sellers.status, 'active')))
    .get()

  if (!seller) return c.json({ error: 'not_a_seller' }, 403)

  c.set('user', user)
  c.set('seller', seller)
  return next()
})
