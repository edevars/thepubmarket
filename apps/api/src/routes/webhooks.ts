/**
 * Webhook de Stripe (Fase 2). Endpoint público pero protegido por firma.
 *
 * - Verifica la firma con `constructEventAsync` (SubtleCrypto, requerido en
 *   Workers) usando el signing secret del endpoint **Connect**.
 *
 * ENTREGA AT-LEAST-ONCE (TASK-022). No hay transacción posible entre D1,
 * Workflows y Durable Objects, así que la corrección es por convergencia:
 * `webhook_events` es un ledger claim → work → processed, y el retry de Stripe
 * es la cola de reintentos.
 *
 *   - Evento nuevo: se reclama (`received`), se procesa, se marca `processed`.
 *   - Redelivery de un `processed`: se descarta (dedupe, solo optimización).
 *   - Redelivery de un `received`: el trabajo anterior murió a medias —
 *     se RE-EJECUTA, no se descarta.
 *   - Fallo procesando: se guarda `last_error` y se responde 500 para que
 *     Stripe redeliverée. Un evento que muere siempre queda visible en
 *     `status='received'` (dead-letter queryable en D1).
 *
 * CONTRATO: por lo anterior, TODO case del switch debe ser idempotente Y
 * seguro ante ejecución concurrente (dos deliveries del mismo evento pueden
 * correr a la vez). Hoy: el Workflow es idempotente por instancia id=orderId,
 * `releaseAndCancel` exige `pending`, el flip de seller exige `invited`, el
 * pago fallido solo loguea. Si agregas un efecto (p.ej. correos de TASK-017),
 * hazlo idempotente por orden o muévelo al Workflow — no rompas el contrato.
 *
 * Efectos por evento:
 * - `checkout.session.completed` → arranca el Workflow post-pago (instancia con
 *   id = orderId, idempotente) y le pasa el PaymentIntent id, que solo existe a
 *   partir de este evento. `checkout.session.expired` → libera reservas y
 *   cancela la orden (ÚNICO evento que cancela de verdad: es cuando Stripe
 *   confirma que ya no se puede completar esa sesión).
 * - `payment_intent.payment_failed` → NO cancela ni libera el hold. Stripe deja
 *   la MISMA Checkout Session abierta para reintentar tras un rechazo de
 *   tarjeta; cancelar aquí perdía pagos exitosos de un reintento posterior
 *   (TASK-013). Solo se loguea para observabilidad/alerting.
 * - `account.updated` (TASK-007) → señal AUTORITATIVA de que un seller terminó
 *   el onboarding de Stripe Connect. El redirect a `return_url` desde el
 *   Account Link es solo UX; nunca se confía en él para el cambio de estado.
 *   Si `charges_enabled && details_submitted`, pasa de `invited` a `active`.
 */
import { orderItems, orders, sellers, webhookEvents } from '@thepubmarket/db'
import { and, eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import Stripe from 'stripe'
import { createStripe, paymentIntentIdFrom } from '../lib/stripe'
import type { AppEnv } from '../types'

export const webhooks = new Hono<AppEnv>()

/**
 * Libera los holds de reserva de una orden y la cancela (si seguía pending).
 * Cancelación DEFINITIVA — solo debe llamarse cuando Stripe confirma que la
 * Checkout Session ya no puede completarse (`checkout.session.expired`).
 */
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

  // Claim: el primer insert gana. Un conflicto de PK ya NO descarta de entrada:
  // solo un evento ya `processed` es duplicado; uno `received` es trabajo que
  // murió a medias y el redelivery lo re-ejecuta (ver contrato en el header).
  const db = c.get('db')
  try {
    await db.insert(webhookEvents).values({ id: event.id, type: event.type, attempts: 1 })
  } catch {
    const prior = await db.select().from(webhookEvents).where(eq(webhookEvents.id, event.id)).get()
    // Fila ilegible tras el conflicto = no fue conflicto de PK sino un error de
    // D1. Responder "duplicate" aquí perdería el evento; 500 → Stripe reintenta.
    if (!prior) return c.json({ error: 'claim_failed' }, 500)
    if (prior.status === 'processed') return c.json({ received: true, duplicate: true })
    await db
      .update(webhookEvents)
      .set({ attempts: prior.attempts + 1 })
      .where(eq(webhookEvents.id, event.id))
  }

  try {
    await processEvent(c, event)
  } catch (err) {
    // last_error es diagnóstico best-effort: si esta escritura también falla,
    // igual respondemos 500 y el redelivery vuelve a intentar todo.
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[webhooks] ${event.type} ${event.id} falló:`, err)
    await db
      .update(webhookEvents)
      .set({ lastError: msg.slice(0, 500) })
      .where(eq(webhookEvents.id, event.id))
      .catch(() => {})
    return c.json({ error: 'processing_failed' }, 500)
  }

  await db
    .update(webhookEvents)
    .set({ status: 'processed', processedAt: Math.floor(Date.now() / 1000) })
    .where(eq(webhookEvents.id, event.id))

  return c.json({ received: true })
})

/**
 * Efectos por tipo de evento. Lanza en fallo real → el caller responde 500 y
 * Stripe redeliverea. Un tipo no contemplado es trivialmente procesado.
 */
async function processEvent(c: Context<AppEnv>, event: Stripe.Event): Promise<void> {
  const db = c.get('db')
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const orderId = session.client_reference_id ?? session.metadata?.orderId
      if (orderId) {
        // Único momento en que el PaymentIntent id existe y llega solo: se lo
        // pasamos al Workflow, que lo persiste con reintentos (TASK-021).
        const paymentIntentId = paymentIntentIdFrom(session)
        if (!paymentIntentId) {
          console.warn(
            `[webhooks] checkout.session.completed order=${orderId} sin payment_intent — la orden queda sin id de pago`,
          )
        }
        // Instancia idempotente por orden. Solo se tolera "ya existe", y se
        // verifica con get() en vez de parsear el mensaje del error: si la
        // instancia no está, el fallo fue real y DEBE subir al 500 — tragarlo
        // dejaba órdenes pagadas en `pending` para siempre (TASK-022).
        try {
          await c.env.POST_PAYMENT.create({ id: orderId, params: { orderId, paymentIntentId } })
        } catch (createErr) {
          try {
            await c.env.POST_PAYMENT.get(orderId)
          } catch {
            throw createErr
          }
        }
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
      // No cancela: la Checkout Session sigue abierta y el comprador puede
      // reintentar con otra tarjeta (ver TASK-013). Solo se deja rastro para
      // observabilidad; la orden permanece `pending` hasta que la sesión
      // se complete o expire de verdad.
      const pi = event.data.object
      const orderId = pi.metadata?.orderId
      console.warn(
        `[webhooks] payment_intent.payment_failed order=${orderId ?? 'unknown'} pi=${pi.id} — no se cancela, la sesión sigue abierta para reintento`,
      )
      break
    }
    case 'account.updated': {
      // Evento Connect: llega con `event.account` (la cuenta conectada), no
      // con un objeto anidado con account id — el propio objeto ES la Account.
      const account = event.data.object
      if (!account.charges_enabled || !account.details_submitted) break

      // Solo hace el flip invited -> active; no toca sellers ya 'active' (idempotente
      // ante reenvíos/eventos repetidos de la misma cuenta) ni 'suspended'
      // (un admin la suspendió a propósito; un account.updated no debe reactivarla).
      const result = await db
        .update(sellers)
        .set({ status: 'active' })
        .where(and(eq(sellers.stripeConnectAccountId, account.id), eq(sellers.status, 'invited')))
        .returning({ id: sellers.id })

      if (result.length === 0) {
        // No es error: puede ser un reenvío, una cuenta que ya estaba activa,
        // o (no debería pasar) una cuenta sin seller asociado todavía.
        console.warn(
          `[webhooks] account.updated account=${account.id} — sin seller 'invited' que actualizar`,
        )
      }
      break
    }
  }
}
