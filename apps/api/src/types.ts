import type { Db, SellerRow } from '@thepubmarket/db'

/** Usuario autenticado resuelto desde la sesión (KV) por el middleware buyerAuth. */
export interface SessionUser {
  id: string
  email: string
  role: 'buyer' | 'admin'
  displayName: string | null
}

/**
 * Tipado del contexto Hono para toda la app.
 *   - Bindings: el `Env` generado por wrangler (DB, SESSIONS, ASSETS, RESERVATION,
 *     POST_PAYMENT, secrets de Stripe, vars).
 *   - Variables: cliente Drizzle por request; tras buyerAuth, el usuario de
 *     sesión; tras sellerAuth, además la tienda del usuario.
 */
export type AppEnv = {
  Bindings: Env
  Variables: { db: Db; user?: SessionUser; seller?: SellerRow }
}
