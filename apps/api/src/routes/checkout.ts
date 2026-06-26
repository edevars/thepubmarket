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
import { inventory, orderItems, orders, sellers } from '@thepubmarket/db'
import type { CheckoutResponse } from '@thepubmarket/shared'
import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { computePlatformFeeCents } from '../lib/orders'
import { createCheckoutSession, createStripe } from '../lib/stripe'
import { buyerAuth } from '../middleware/buyer-auth'
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
})

export const checkout = new Hono<AppEnv>()

checkout.post('/', buyerAuth, async (c) => {
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
  const platformFeeCents = computePlatformFeeCents(subtotalCents, Number(c.env.PLATFORM_FEE_BPS))

  try {
    await db.insert(orders).values({
      id: orderId,
      buyerUserId: user.id,
      sellerId,
      status: 'pending',
      subtotalCents,
      platformFeeCents,
      totalCents: subtotalCents,
      currency: 'MXN',
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
      webBaseUrl: c.env.WEB_BASE_URL,
    })

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null)

    await db
      .update(orders)
      .set({ stripeCheckoutSessionId: session.id, stripePaymentIntentId: paymentIntentId })
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
