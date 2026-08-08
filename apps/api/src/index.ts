import { createDb } from '@thepubmarket/db'
import type { HealthResponse } from '@thepubmarket/shared'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { adminAuth } from './middleware/admin-auth'
import { sellerAuth } from './middleware/seller-auth'
import { sellerConnectAuth } from './middleware/seller-connect-auth'
import { address } from './routes/address'
import { admin } from './routes/admin'
import { auth } from './routes/auth'
import { cardImagesRoutes } from './routes/card-images'
import { catalog } from './routes/catalog'
import { checkout } from './routes/checkout'
import { ordersRoutes } from './routes/orders'
import { photosRoutes } from './routes/photos'
import { sellerConnect } from './routes/seller-connect'
import { sellerPanel } from './routes/seller-panel'
import { sellersRoutes } from './routes/sellers'
import { webhooks } from './routes/webhooks'
import type { AppEnv } from './types'

// `Env` es el tipo global generado por `wrangler types` en
// worker-configuration.d.ts a partir de los bindings de wrangler.jsonc
// (DB=D1, SESSIONS=KV, ASSETS=R2). Regenerar con `pnpm cf-typegen`.
const app = new Hono<AppEnv>()

// CORS: el frontend (apps/web) corre en otro origen y consume la API.
//
// ABIERTO A PROPÓSITO, y es deuda con fecha de caducidad. Con tokens Bearer en
// localStorage (ver apps/web/src/lib/session.ts), un CORS sin allowlist sería
// exposición real EN CUANTO haya sesiones de usuarios reales que robar. Hoy no
// las hay: no existe ni un comprador ni un vendedor real en ningún ambiente
// (ver docs/ingenieria/estado-actual.md, "Todo está en modo desarrollo").
//
// CERRAR ANTES DEL PRIMER COMPRADOR REAL. El origen ya es fijo, así que es
// cambiar esta línea por `cors({ origin: c.env.WEB_BASE_URL })` — no hay
// trabajo de diseño pendiente, solo la decisión de que ya toca.
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

// Buyer/seller auth (email + password + KV sessions).
app.route('/auth', auth)

// Catálogo público (solo lectura, sin auth).
app.route('/catalog', catalog)

// Tiendas públicas (perfil de vendedor, solo lectura, sin auth).
app.route('/sellers', sellersRoutes)

// Consulta de códigos postales para el formulario de envío (TASK-061.02).
// Sin auth: reference data pública, la petición no lleva datos del comprador.
app.route('/address', address)

// Fotos de inventario: streaming público de binarios desde R2 (TASK-025).
// Sin auth — misma exposición que las URLs de Scryfall ya embebidas en cada
// listing. Nunca acepta una llave de R2 del cliente, solo un id de foto.
app.route('/photos', photosRoutes)

// Imágenes canónicas del catálogo espejadas en R2 (TASK-036). Sin auth; las
// llaves son deterministas y la ruta valida los params antes de construirlas.
app.route('/card-images', cardImagesRoutes)

// Onboarding de Stripe Connect (autoservicio; sesión + fila 'invited' o
// 'active' en sellers — MÁS permisivo que sellerAuth). Se monta ANTES del
// `/seller/*` de abajo: Hono compone los handlers que matchean en orden de
// registro, así que estas rutas responden y terminan la cadena antes de que
// el sellerAuth general (que exige status='active') llegue a rechazarlas.
app.use('/seller/connect/*', sellerConnectAuth)
app.route('/seller/connect', sellerConnect)

// Panel del Vendedor (autoservicio; sesión email+contraseña + fila activa en sellers).
app.use('/seller/*', sellerAuth)
app.route('/seller', sellerPanel)

// Checkout y órdenes (requieren comprador autenticado; auth dentro de cada router).
app.route('/checkout', checkout)
app.route('/orders', ordersRoutes)

// Webhooks de Stripe (público, protegido por firma; NO lleva admin auth).
app.route('/webhooks', webhooks)

// Admin interno de carga. Protegido; NO exponer público.
// TODO: mover a Cloudflare Access (ver middleware/admin-auth.ts).
app.use('/admin/*', adminAuth)
app.route('/admin', admin)

export default app

// Clases exportadas requeridas por los bindings de wrangler.jsonc.
export { InventoryReservation } from './durable-objects/inventory-reservation'
export { PostPaymentWorkflow } from './workflows/post-payment'
