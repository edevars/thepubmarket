import type { HealthResponse } from '@thepubmarket/shared'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

// `Env` es el tipo global generado por `wrangler types` en
// worker-configuration.d.ts a partir de los bindings de wrangler.jsonc
// (DB=D1, SESSIONS=KV, ASSETS=R2). Regenerar con `pnpm cf-typegen`.
const app = new Hono<{ Bindings: Env }>()

// CORS: el frontend (apps/web) corre en otro origen y consume /health.
// En Fase 0 abrimos el origen; en fases con auth se restringe por allowlist.
app.use('*', cors())

/**
 * Health check. Verifica que el Worker responde y que hay conectividad real
 * con D1 ejecutando un SELECT trivial. El frontend usa esto para pintar el
 * estado en verde/rojo y validar el wiring end-to-end.
 */
app.get('/health', async (c) => {
  const timestamp = Math.floor(Date.now() / 1000)

  try {
    await c.env.DB.prepare('SELECT 1').first()
    const body: HealthResponse = { status: 'ok', db: 'ok', timestamp }
    return c.json(body)
  } catch (err) {
    console.error('health: D1 check failed', err)
    const body: HealthResponse = { status: 'error', db: 'error', timestamp }
    return c.json(body, 503)
  }
})

export default app
