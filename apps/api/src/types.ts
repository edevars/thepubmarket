import type { Db, SellerRow } from '@thepubmarket/db'
import type { AuthUser } from '@thepubmarket/shared'

/** Authenticated user resolved from the session (KV) by the buyerAuth middleware. */
export type SessionUser = AuthUser

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
