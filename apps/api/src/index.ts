import { createDb } from '@thepubmarket/db'
import type { HealthResponse } from '@thepubmarket/shared'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { adminAuth } from './middleware/admin-auth'
import { admin } from './routes/admin'
import { catalog } from './routes/catalog'
import type { AppEnv } from './types'

// `Env` es el tipo global generado por `wrangler types` en
// worker-configuration.d.ts a partir de los bindings de wrangler.jsonc
// (DB=D1, SESSIONS=KV, ASSETS=R2). Regenerar con `pnpm cf-typegen`.
const app = new Hono<AppEnv>()

// CORS: el frontend (apps/web) corre en otro origen y consume la API.
// En Fase 1 abrimos el origen; en fases con auth se restringe por allowlist.
app.use('*', cors())

// Cliente Drizzle por request, disponible en los handlers como `c.get('db')`.
// El esquema vive en el paquete compartido @thepubmarket/db.
app.use('*', (c, next) => {
  c.set('db', createDb(c.env.DB))
  return next()
})

/**
 * Health check. Verifica que el Worker responde y que hay conectividad real
 * con D1 ejecutando un SELECT trivial. El frontend usa esto para pintar el
 * estado en verde/rojo y validar el wiring end-to-end.
 */
app.get('/health', async (c) => {
  const timestamp = Math.floor(Date.now() / 1000)

  try {
    await c.get('db').run(sql`SELECT 1`)
    const body: HealthResponse = { status: 'ok', db: 'ok', timestamp }
    return c.json(body)
  } catch (err) {
    console.error('health: D1 check failed', err)
    const body: HealthResponse = { status: 'error', db: 'error', timestamp }
    return c.json(body, 503)
  }
})

// Catálogo público (solo lectura, sin auth).
app.route('/catalog', catalog)

// Admin interno de carga. Protegido; NO exponer público.
// TODO: mover a Cloudflare Access (ver middleware/admin-auth.ts).
app.use('/admin/*', adminAuth)
app.route('/admin', admin)

export default app
