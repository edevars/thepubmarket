/**
 * Middleware de autenticación para el onboarding de Stripe Connect
 * (`/seller/connect/*`).
 *
 * Misma resolución de sesión que `sellerAuth`, pero MÁS permisivo: acepta
 * `status IN ('invited', 'active')` en vez de exigir `active`. Un seller
 * recién invitado (sin cuenta de Stripe todavía) necesita poder llegar a
 * estas rutas para arrancar su propio onboarding — con `sellerAuth` (que
 * exige `active`) nunca podría, porque pasa a `active` justo cuando termina
 * el onboarding (ver `webhooks.ts`, caso `account.updated`).
 *
 * `suspended` queda excluido a propósito: un seller suspendido no debe poder
 * (re)iniciar ni consultar su onboarding de Connect.
 */
import { sellers } from '@thepubmarket/db'
import { and, eq, inArray } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { bearerToken, getSession } from '../lib/auth'
import type { AppEnv } from '../types'

export const sellerConnectAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerToken(c.req.header('Authorization'))
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  const user = await getSession(c.env.SESSIONS, token)
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const seller = await c
    .get('db')
    .select()
    .from(sellers)
    .where(and(eq(sellers.userId, user.id), inArray(sellers.status, ['invited', 'active'])))
    .get()

  if (!seller) return c.json({ error: 'not_a_seller' }, 403)

  c.set('user', user)
  c.set('seller', seller)
  return next()
})
