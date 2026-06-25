import type { Db } from '@thepubmarket/db'

/**
 * Tipado del contexto Hono para toda la app.
 *   - Bindings: el `Env` generado por wrangler (DB, SESSIONS, ASSETS, vars).
 *   - Variables: el cliente Drizzle inyectado por request (ver middleware en index.ts).
 */
export type AppEnv = {
  Bindings: Env
  Variables: { db: Db }
}
