/**
 * Checkout (Fase 2). Requiere comprador autenticado.
 *
 * Flujo: valida que el carrito es de UN solo seller → reserva cada item en su
 * Durable Object → crea la orden (pending) + líneas → crea la Stripe Checkout
 * Session como **direct charge** en la cuenta Connect del seller (application
 * fee) → devuelve la URL de pago. Si algo falla, libera las reservas.
 *
 * NO CUSTODIA: el cargo se crea en la cuenta del seller; la plataforma solo
 * cobra `application_fee_amount`.
 */
import {
  inventory,
  orderItems,
  orders,
  sellers,
  sepomexCorpusMeta,
  sepomexSettlements,
} from '@thepubmarket/db'
import type { CheckoutResponse } from '@thepubmarket/shared'
import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { checkShippingAddress } from '../lib/address-check'
import {
  addressColumns,
  deliverySchema,
  isEligiblePickupPoint,
  shippingCentsFor,
  toPickupPoint,
} from '../lib/delivery'
import { computePlatformFeeCents } from '../lib/orders'
import { lookupPostalCode } from '../lib/postal-codes'
import { createCheckoutSession, createStripe } from '../lib/stripe'
import { buyerAuth } from '../middleware/buyer-auth'
import { turnstileGuard } from '../middleware/turnstile'
import type { AppEnv } from '../types'

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        inventoryId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(20),
  // Obligatorio: una orden sin método de entrega es una orden que la tienda no
  // puede cumplir. Nótese que el cliente elige el MÉTODO, nunca el monto.
  delivery: deliverySchema,
})

export const checkout = new Hono<AppEnv>()

/**
 * GET /checkout/pickup-points?sellerId= — tiendas donde se puede recoger una
 * orden de ese vendedor: la propia y cualquier otra ACTIVA de la misma ciudad.
 *
 * Público y de solo lectura, igual que `GET /sellers`: no revela nada que el
 * escaparate no muestre ya. La regla de elegibilidad vive SOLO aquí; el cliente
 * pinta lo que reciba y `POST /checkout` la vuelve a aplicar antes de cobrar,
 * así que una lista manipulada en el navegador no compra nada.
 *
 * Devolver lista vacía es un resultado válido (vendedor sin ciudad registrada):
 * el front debe ofrecer envío a domicilio, no romperse.
 */
checkout.get('/pickup-points', async (c) => {
  const sellerId = c.req.query('sellerId')
  if (!sellerId) return c.json({ error: 'missing_seller_id' }, 400)

  const db = c.get('db')
  const sellingStore = await db.select().from(sellers).where(eq(sellers.id, sellerId)).get()
  if (!sellingStore) return c.json({ error: 'not_found' }, 404)

  // Lista curada por invitación: son decenas de tiendas, no miles. Traerlas
  // todas y filtrar en memoria evita replicar la normalización de ciudad en
  // SQL, que es justo donde se desincronizaría de los tests.
  const candidates = await db.select().from(sellers).all()
  const items = candidates
    .filter((row) => isEligiblePickupPoint(row, sellingStore))
    .map((row) => toPickupPoint(row, sellingStore.id))
    // La tienda vendedora primero: es la única sin espera de traslado.
    .sort(
      (a, b) => Number(b.isSellingStore) - Number(a.isSellingStore) || a.name.localeCompare(b.name),
    )

  return c.json({ items })
})

// `turnstileGuard` va ANTES de buyerAuth: un bot con token de sesión robado se
// frena antes de tocar KV, los Durable Objects de reserva y la API de Stripe.
checkout.post('/', turnstileGuard, buyerAuth, async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)

  const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)

  const lines = parsed.data.items
  const ids = lines.map((l) => l.inventoryId)
  if (new Set(ids).size !== ids.length) {
    return c.json({ error: 'duplicate_items' }, 400)
  }

  const db = c.get('db')
  const rows = await db.select().from(inventory).where(inArray(inventory.id, ids)).all()
  const byId = new Map(rows.map((r) => [r.id, r]))

  // Validaciones de disponibilidad básica y de seller único.
  for (const line of lines) {
    const row = byId.get(line.inventoryId)
    if (!row) return c.json({ error: 'item_unavailable', inventoryId: line.inventoryId }, 400)
    if (row.status !== 'active') {
      return c.json({ error: 'item_unavailable', inventoryId: line.inventoryId }, 400)
    }
    if (row.quantity < line.quantity) {
      return c.json({ error: 'insufficient_stock', inventoryId: line.inventoryId }, 409)
    }
  }
  const sellerIds = new Set(rows.map((r) => r.sellerId))
  if (sellerIds.size > 1) {
    return c.json({ error: 'multiple_sellers' }, 400)
  }
  const sellerId = rows[0]?.sellerId
  if (!sellerId) return c.json({ error: 'item_unavailable' }, 400)

  const seller = await db.select().from(sellers).where(eq(sellers.id, sellerId)).get()
  if (!seller?.stripeConnectAccountId) {
    return c.json({ error: 'seller_not_payable' }, 400)
  }

  // Entrega: el cliente eligió MÉTODO; el monto se deriva aquí. Un pickup
  // se valida contra la misma regla que alimenta la lista que vio el
  // comprador — no basta con que mande un uuid de tienda cualquiera.
  const delivery = parsed.data.delivery
  if (delivery.method === 'pickup') {
    const point = await db
      .select()
      .from(sellers)
      .where(eq(sellers.id, delivery.pickupSellerId))
      .get()
    if (!point || !isEligiblePickupPoint(point, seller)) {
      return c.json({ error: 'pickup_point_unavailable' }, 400)
    }
  }
  const shippingCents = shippingCentsFor(delivery.method)

  // Cotejo de la dirección contra el corpus SEPOMEX (TASK-061.04). Es
  // DESCRIPTIVO: ningún resultado impide pagar. Reutiliza el mismo lookup
  // cacheado que consultó el navegador del comprador, así que el veredicto se
  // calcula contra exactamente lo que él vio en el formulario.
  let addressCheckColumns: {
    shippingCity?: string
    shippingState?: string
    shippingNeighborhood?: string | null
    shippingAddressMatch: string
    shippingAddressOriginal: string | null
    shippingCorpusVersion: string | null
  } | null = null
  if (delivery.method === 'shipping') {
    const lookup = await lookupPostalCode(
      {
        kv: c.env.SESSIONS,
        loadSettlements: (cp) =>
          db.select().from(sepomexSettlements).where(eq(sepomexSettlements.postalCode, cp)),
        loadCorpusVersion: async () => {
          const [meta] = await db
            .select({ version: sepomexCorpusMeta.version })
            .from(sepomexCorpusMeta)
            .limit(1)
          return meta?.version ?? null
        },
      },
      delivery.address.postalCode,
    )
    const check = checkShippingAddress(delivery.address, lookup.response)
    addressCheckColumns = {
      shippingCity: check.city,
      shippingState: check.state,
      shippingNeighborhood: check.neighborhood,
      shippingAddressMatch: check.verdict,
      shippingAddressOriginal: check.original ? JSON.stringify(check.original) : null,
      shippingCorpusVersion: check.corpusVersion,
    }
  }

  const orderId = crypto.randomUUID()

  // Reserva atómica por item (Durable Object). Si alguno falla, libera lo reservado.
  const reserved: string[] = []
  const releaseAll = async () => {
    await Promise.all(
      reserved.map((id) =>
        c.env.RESERVATION.get(c.env.RESERVATION.idFromName(id)).release(orderId),
      ),
    )
  }
  for (const line of lines) {
    const stub = c.env.RESERVATION.get(c.env.RESERVATION.idFromName(line.inventoryId))
    const res = await stub.reserve(line.inventoryId, orderId, line.quantity)
    if (!res.ok) {
      await releaseAll()
      return c.json(
        { error: 'reservation_failed', inventoryId: line.inventoryId, reason: res.reason },
        409,
      )
    }
    reserved.push(line.inventoryId)
  }

  // Orden + líneas (snapshots de título y precio).
  const itemRows = lines.map((line) => {
    const row = byId.get(line.inventoryId)
    if (!row) throw new Error('unreachable: item desapareció tras validar')
    return {
      id: crypto.randomUUID(),
      orderId,
      inventoryId: row.id,
      titleSnapshot: row.title,
      unitPriceCents: row.priceCents,
      quantity: line.quantity,
      lineTotalCents: row.priceCents * line.quantity,
    }
  })
  const subtotalCents = itemRows.reduce((s, i) => s + i.lineTotalCents, 0)
  // Comisión SOLO sobre producto: el envío liquida íntegro al seller, que es
  // quien paga la paquetería. Ver lib/delivery.ts y CLAUDE.md (no custodia).
  const platformFeeCents = computePlatformFeeCents(subtotalCents, Number(c.env.PLATFORM_FEE_BPS))
  const totalCents = subtotalCents + shippingCents

  try {
    await db.insert(orders).values({
      id: orderId,
      buyerUserId: user.id,
      sellerId,
      status: 'pending',
      subtotalCents,
      platformFeeCents,
      totalCents,
      currency: 'MXN',
      deliveryMethod: delivery.method,
      shippingCents,
      ...(delivery.method === 'shipping'
        ? { ...addressColumns(delivery.address), ...addressCheckColumns }
        : { pickupSellerId: delivery.pickupSellerId }),
    })
    await db.insert(orderItems).values(itemRows)

    const stripe = createStripe(c.env.STRIPE_SECRET_KEY)
    const session = await createCheckoutSession({
      stripe,
      connectedAccountId: seller.stripeConnectAccountId,
      orderId,
      buyerEmail: user.email,
      lines: itemRows.map((i) => ({
        name: i.titleSnapshot,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
      })),
      applicationFeeCents: platformFeeCents,
      shippingCents,
      shippingLabel: 'Envío a domicilio',
      webBaseUrl: c.env.WEB_BASE_URL,
    })

    // Solo la sesión. NO leas `session.payment_intent` aquí: en `mode: payment`
    // el PaymentIntent no existe hasta que el comprador empieza a pagar, así que
    // ese campo es SIEMPRE null en este punto (TASK-021 — durante meses dejó la
    // columna NULL en todas las órdenes). El id se persiste desde el Workflow
    // post-pago con el que trae `checkout.session.completed`.
    await db
      .update(orders)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(orders.id, orderId))

    if (!session.url) throw new Error('stripe no devolvió url de checkout')

    const body: CheckoutResponse = { orderId, url: session.url }
    return c.json(body, 201)
  } catch (err) {
    // Falla creando la sesión: libera reservas y cancela la orden.
    await releaseAll()
    await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, orderId))
    console.error('checkout: error creando la sesión de Stripe', err)
    return c.json({ error: 'checkout_failed' }, 502)
  }
})
