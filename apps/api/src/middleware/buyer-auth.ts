/**
 * Middleware de autenticación de comprador. Lee `Authorization: Bearer <token>`,
 * resuelve la sesión en KV y expone el usuario como `c.get('user')`. Responde 401
 * si no hay sesión válida. Usar en rutas que requieren comprador autenticado
 * (checkout, órdenes propias).
 */
import { createMiddleware } from 'hono/factory'
import { bearerToken, getSession } from '../lib/auth'
import type { AppEnv } from '../types'

export const buyerAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerToken(c.req.header('Authorization'))
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  const user = await getSession(c.env.SESSIONS, token)
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  c.set('user', user)
  return next()
})
