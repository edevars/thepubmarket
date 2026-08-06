/**
 * Order lifecycle emails (TASK-017).
 *
 * One place that turns an order id into a rendered message and hands it to
 * `sendEmail`. Everything here obeys two rules:
 *
 * - **Never throws.** The order is the source of truth; the email is
 *   best-effort. A missing recipient, a dead provider or a malformed row logs
 *   and returns. Callers can `await` these without guarding.
 * - **No second path to the provider.** Rendering lives in email-templates.ts,
 *   sending in email.ts. This module only assembles data.
 *
 * Idempotency is NOT implemented here — it comes from the callers:
 * post-payment runs each send inside its own checkpointed `step.do`, and the
 * panel's ship/ready transitions are guarded UPDATEs that answer 409 the
 * second time. Adding a send anywhere else means bringing your own guarantee.
 */

import { type Db, inventory, orderItems, orders, sellers, users } from '@thepubmarket/db'
import type { SellerHours } from '@thepubmarket/shared'
import { eq } from 'drizzle-orm'
import { sendEmail } from './email'
import {
  type OrderEmailData,
  type OrderEmailDelivery,
  type OrderEmailStore,
  orderConfirmationEmail,
  orderReadyEmail,
  orderShippedEmail,
  sellerNewOrderEmail,
} from './email-templates'

/** Same folio the panel and /compras show, so support can match them up. */
function shortId(orderId: string): string {
  return `#TPM-${orderId.slice(0, 4).toUpperCase()}`
}

type OrderRow = typeof orders.$inferSelect
type SellerRow = typeof sellers.$inferSelect

/** A store as the emails need it. `hours` is a JSON column and may be null. */
function toEmailStore(seller: SellerRow): OrderEmailStore {
  return {
    name: seller.name,
    address: seller.address,
    hours: (seller.hours as SellerHours[] | null) ?? [],
  }
}

/** Address lines, skipping the parts the buyer left empty. */
function addressLines(order: OrderRow): string[] {
  const cityLine = [order.shippingNeighborhood, order.shippingCity, order.shippingState]
    .filter(Boolean)
    .join(', ')
  return [
    order.shippingLine1,
    order.shippingLine2,
    cityLine || null,
    order.shippingPostalCode ? `C.P. ${order.shippingPostalCode}` : null,
  ].filter((l): l is string => Boolean(l))
}

async function resolveDelivery(db: Db, order: OrderRow): Promise<OrderEmailDelivery> {
  if (order.deliveryMethod === 'shipping') {
    return {
      method: 'shipping',
      recipient: order.shippingRecipient ?? '',
      phone: order.shippingPhone,
      lines: addressLines(order),
    }
  }
  if (order.deliveryMethod === 'pickup' && order.pickupSellerId) {
    const store = await db.select().from(sellers).where(eq(sellers.id, order.pickupSellerId)).get()
    // The pickup store FK is set-null on delete: a removed store degrades to
    // "por confirmar" instead of an email claiming a counter that is gone.
    if (store) return { method: 'pickup', store: toEmailStore(store) }
  }
  return { method: null }
}

interface OrderEmailContext {
  order: OrderRow
  seller: SellerRow
  data: OrderEmailData
  buyerEmail: string | null
}

/**
 * Loads everything an order email renders from. Returns null when the order or
 * its store is gone — nothing to send, and nothing worth throwing over.
 *
 * `actionUrl` is filled by the caller since buyer and seller go to different
 * places; the base is passed in so this stays free of env plumbing.
 */
async function loadOrderContext(
  db: Db,
  orderId: string,
  webBaseUrl: string,
  audience: 'buyer' | 'seller',
): Promise<OrderEmailContext | null> {
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get()
  if (!order) return null

  const seller = await db.select().from(sellers).where(eq(sellers.id, order.sellerId)).get()
  if (!seller) return null

  // Left join in spirit: the inventory row can be gone (FK set-null), and the
  // line still has to render from its own snapshot.
  const lines = await db
    .select({ item: orderItems, inv: inventory })
    .from(orderItems)
    .leftJoin(inventory, eq(orderItems.inventoryId, inventory.id))
    .where(eq(orderItems.orderId, orderId))
    .all()

  const buyer = await db.select().from(users).where(eq(users.id, order.buyerUserId)).get()

  return {
    order,
    seller,
    buyerEmail: buyer?.email ?? null,
    data: {
      shortId: shortId(order.id),
      storeName: seller.name,
      items: lines.map(({ item, inv }) => ({
        name: item.titleSnapshot,
        setCode: inv?.setCode ?? null,
        condition: inv?.condition ?? null,
        quantity: item.quantity,
        lineTotalCents: item.lineTotalCents,
      })),
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      delivery: await resolveDelivery(db, order),
      actionUrl: audience === 'buyer' ? `${webBaseUrl}/compras` : `${webBaseUrl}/panel`,
    },
  }
}

/** The store's inbox: the user account linked to the seller, if any. */
async function sellerEmail(db: Db, seller: SellerRow): Promise<string | null> {
  if (!seller.userId) return null
  const user = await db.select().from(users).where(eq(users.id, seller.userId)).get()
  return user?.email ?? null
}

/** Runs a send, absorbing anything it throws. The order never pays for email. */
async function bestEffort(label: string, orderId: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[order-email] ${label} failed for order ${orderId}: ${reason}`)
  }
}

/** Buyer's purchase confirmation. Sent once payment is settled. */
export async function sendOrderConfirmation(env: Env, db: Db, orderId: string): Promise<void> {
  await bestEffort('confirmation', orderId, async () => {
    const ctx = await loadOrderContext(db, orderId, env.WEB_BASE_URL, 'buyer')
    if (!ctx) return
    if (!ctx.buyerEmail) {
      console.warn(`[order-email] order ${orderId} has no buyer email — confirmation skipped`)
      return
    }
    await sendEmail(env, ctx.buyerEmail, orderConfirmationEmail(ctx.data))
  })
}

/** Store's "there is a new paid order" notice. */
export async function sendSellerNewOrderNotice(env: Env, db: Db, orderId: string): Promise<void> {
  await bestEffort('seller-notice', orderId, async () => {
    const ctx = await loadOrderContext(db, orderId, env.WEB_BASE_URL, 'seller')
    if (!ctx) return
    const to = await sellerEmail(db, ctx.seller)
    if (!to) {
      // A vetted seller with no claimed account yet. Real state, not an error:
      // the order is still visible in the panel once they claim it.
      console.warn(
        `[order-email] seller ${ctx.seller.id} has no linked user — new-order notice skipped for ${orderId}`,
      )
      return
    }
    await sendEmail(env, to, sellerNewOrderEmail(ctx.data))
  })
}

/** Buyer's shipping notice, with the tracking number captured in the panel. */
export async function sendOrderShipped(env: Env, db: Db, orderId: string): Promise<void> {
  await bestEffort('shipped', orderId, async () => {
    const ctx = await loadOrderContext(db, orderId, env.WEB_BASE_URL, 'buyer')
    if (!ctx?.buyerEmail) return
    if (!ctx.order.trackingNumber) {
      console.warn(`[order-email] order ${orderId} marked shipped without tracking — not sent`)
      return
    }
    await sendEmail(
      env,
      ctx.buyerEmail,
      orderShippedEmail({
        shortId: ctx.data.shortId,
        storeName: ctx.data.storeName,
        trackingNumber: ctx.order.trackingNumber,
        carrier: ctx.order.carrier,
        actionUrl: ctx.data.actionUrl,
      }),
    )
  })
}

/** Buyer's "it's on the counter" notice. Pickup orders only. */
export async function sendOrderReady(env: Env, db: Db, orderId: string): Promise<void> {
  await bestEffort('ready', orderId, async () => {
    const ctx = await loadOrderContext(db, orderId, env.WEB_BASE_URL, 'buyer')
    if (!ctx?.buyerEmail) return
    // The pickup store, not the selling store: they can differ.
    const store =
      ctx.data.delivery.method === 'pickup' ? ctx.data.delivery.store : toEmailStore(ctx.seller)
    await sendEmail(
      env,
      ctx.buyerEmail,
      orderReadyEmail({ shortId: ctx.data.shortId, store, actionUrl: ctx.data.actionUrl }),
    )
  })
}
