/**
 * Webhook de Stripe (Fase 2). Endpoint público pero protegido por firma.
 *
 * - Verifica la firma con `constructEventAsync` (SubtleCrypto, requerido en
 *   Workers) usando el signing secret del endpoint **Connect**.
 * - Idempotencia: inserta el `event.id` en `webhook_events`; si ya existe, el
 *   evento es un reintento y se ignora (no re-ejecuta efectos).
 * - `checkout.session.completed` → arranca el Workflow post-pago (instancia con
 *   id = orderId, idempotente). `expired`/`payment_failed` → libera reservas y
 *   cancela la orden.
 */
import { orderItems, orders, webhookEvents } from '@thepubmarket/db'
import { eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import Stripe from 'stripe'
import { createStripe } from '../lib/stripe'
import type { AppEnv } from '../types'

export const webhooks = new Hono<AppEnv>()

/** Libera los holds de reserva de una orden y la cancela (si seguía pending). */
async function releaseAndCancel(c: Context<AppEnv>, orderId: string) {
  const db = c.get('db')
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get()
  if (order?.status !== 'pending') return

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all()
  await Promise.all(
    items
      .filter((it) => it.inventoryId)
      .map((it) =>
        c.env.RESERVATION.get(c.env.RESERVATION.idFromName(it.inventoryId as string)).release(
          orderId,
        ),
      ),
  )
  await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, orderId))
}

webhooks.post('/stripe', async (c) => {
  const sig = c.req.header('stripe-signature')
  if (!sig) return c.json({ error: 'missing_signature' }, 400)

  const raw = await c.req.text()
  const stripe = createStripe(c.env.STRIPE_SECRET_KEY)

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
  } catch {
    return c.json({ error: 'invalid_signature' }, 400)
  }

  // Idempotencia: el primer insert gana; un reintento choca con la PK y se ignora.
  const db = c.get('db')
  try {
    await db.insert(webhookEvents).values({ id: event.id, type: event.type })
  } catch {
    return c.json({ received: true, duplicate: true })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const orderId = session.client_reference_id ?? session.metadata?.orderId
      if (orderId) {
        // Instancia idempotente por orden; si ya existe, ignora el error.
        await c.env.POST_PAYMENT.create({ id: orderId, params: { orderId } }).catch(() => {})
      }
      break
    }
    case 'checkout.session.expired': {
      const session = event.data.object
      const orderId = session.client_reference_id ?? session.metadata?.orderId
      if (orderId) await releaseAndCancel(c, orderId)
      break
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object
      const orderId = pi.metadata?.orderId
      if (orderId) await releaseAndCancel(c, orderId)
      break
    }
  }

  return c.json({ received: true })
})
