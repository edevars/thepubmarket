/**
 * API del Panel del Vendedor (`/seller/*`). Autoservicio de la tienda:
 * inventario propio (alta, precio, cantidad, pausa), órdenes con envío
 * (marcar enviada con guía / entregada) y búsqueda en Scryfall para el alta.
 *
 * TODO el router va detrás de `sellerAuth`: sesión magic-link + fila activa en
 * `sellers` (c.get('seller')). Cada query filtra por el seller de la sesión —
 * nunca se acepta un sellerId del cliente.
 *
 * NO CUSTODIA: aquí no hay pagos. La "liquidación" que se muestra (comisión
 * vía application fee) es informativa; el dinero fluye directo en Stripe.
 */
import { inventory, orderItems, orders, users } from '@thepubmarket/db'
import { CONDITIONS, FINISHES, type SellerPanelMe } from '@thepubmarket/shared'
import { and, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createListing, type ListingInput, rowToInventoryItem } from '../lib/inventory'
import { orderToSellerOrder } from '../lib/orders'
import { ScryfallError, searchCards } from '../lib/scryfall'
import { rowToSeller } from '../lib/sellers'
import type { AppEnv } from '../types'

const createSchema = z.object({
  scryfallId: z.string().uuid(),
  condition: z.enum(CONDITIONS as [string, ...string[]]),
  finish: z.enum(FINISHES as [string, ...string[]]),
  language: z.string().min(2).max(8).default('es'),
  priceCents: z.number().int().min(1),
  quantity: z.number().int().min(1),
})

const updateSchema = z
  .object({
    priceCents: z.number().int().min(0).optional(),
    quantity: z.number().int().min(0).optional(),
    condition: z.enum(CONDITIONS as [string, ...string[]]).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no_fields_to_update' })

const shipSchema = z.object({ trackingNumber: z.string().trim().min(3).max(64) })

export const sellerPanel = new Hono<AppEnv>()

/** GET /seller/me — identidad de la tienda + comisión vigente. */
sellerPanel.get('/me', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const db = c.get('db')

  const row = await db
    .select({ n: count(inventory.id) })
    .from(inventory)
    .where(
      and(
        eq(inventory.sellerId, seller.id),
        eq(inventory.status, 'active'),
        gt(inventory.quantity, 0),
      ),
    )
    .get()

  const body: SellerPanelMe = {
    seller: rowToSeller({ ...seller, singlesCount: row?.n ?? 0 }),
    feeBps: Number(c.env.PLATFORM_FEE_BPS) || 0,
  }
  return c.json(body)
})

/**
 * GET /seller/inventory — TODO el inventario del seller (incluye pausadas y
 * sin stock; el catálogo público solo muestra activas con stock).
 */
sellerPanel.get('/inventory', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)

  const rows = await c
    .get('db')
    .select()
    .from(inventory)
    .where(eq(inventory.sellerId, seller.id))
    .orderBy(desc(inventory.updatedAt), desc(inventory.id))
    .all()

  return c.json({ items: rows.map(rowToInventoryItem) })
})

/** POST /seller/inventory — publica un single (sellerId = sesión, siempre). */
sellerPanel.post('/inventory', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)

  const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }

  const result = await createListing(
    c.get('db'),
    c.env.SESSIONS,
    parsed.data as ListingInput,
    seller.id,
  )
  if (!result.ok) {
    return c.json({ error: result.error, ...result.extra }, result.status)
  }
  return c.json(rowToInventoryItem(result.row), 201)
})

/** PATCH /seller/inventory/:id — edita precio/cantidad/condición/estado propio. */
sellerPanel.patch('/inventory/:id', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const id = c.req.param('id')

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }
  const input = parsed.data

  const [row] = await c
    .get('db')
    .update(inventory)
    .set({
      ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: sql`(unixepoch())`,
    })
    // Ownership: solo filas del seller autenticado. Item ajeno = 404 opaco.
    .where(and(eq(inventory.id, id), eq(inventory.sellerId, seller.id)))
    .returning()

  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(rowToInventoryItem(row))
})

/** GET /seller/orders — órdenes de la tienda con líneas y comprador enmascarado. */
sellerPanel.get('/orders', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const db = c.get('db')

  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.sellerId, seller.id))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .all()

  if (orderRows.length === 0) return c.json({ items: [] })

  const orderIds = orderRows.map((o) => o.id)
  const buyerIds = [...new Set(orderRows.map((o) => o.buyerUserId))]
  const [itemRows, buyerRows] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)).all(),
    db.select().from(users).where(inArray(users.id, buyerIds)).all(),
  ])

  const itemsByOrder = new Map<string, typeof itemRows>()
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? []
    list.push(item)
    itemsByOrder.set(item.orderId, list)
  }
  const buyerById = new Map(buyerRows.map((u) => [u.id, u]))

  return c.json({
    items: orderRows.map((o) =>
      orderToSellerOrder(o, itemsByOrder.get(o.id) ?? [], buyerById.get(o.buyerUserId)),
    ),
  })
})

/** POST /seller/orders/:id/ship — marca enviada con guía. Solo pagadas sin enviar. */
sellerPanel.post('/orders/:id/ship', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const id = c.req.param('id')

  const parsed = shipSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }

  const [row] = await c
    .get('db')
    .update(orders)
    .set({
      trackingNumber: parsed.data.trackingNumber,
      shippedAt: sql`(unixepoch())`,
      updatedAt: sql`(unixepoch())`,
    })
    .where(
      and(
        eq(orders.id, id),
        eq(orders.sellerId, seller.id),
        eq(orders.status, 'paid'),
        isNull(orders.shippedAt),
      ),
    )
    .returning()

  if (!row) return c.json({ error: 'not_shippable' }, 409)
  return c.json(orderToSellerOrder(row, [], undefined))
})

/** POST /seller/orders/:id/deliver — marca entregada (cierra en 'fulfilled'). */
sellerPanel.post('/orders/:id/deliver', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const id = c.req.param('id')

  const [row] = await c
    .get('db')
    .update(orders)
    .set({
      deliveredAt: sql`(unixepoch())`,
      status: 'fulfilled',
      updatedAt: sql`(unixepoch())`,
    })
    .where(
      and(
        eq(orders.id, id),
        eq(orders.sellerId, seller.id),
        eq(orders.status, 'paid'),
        sql`${orders.shippedAt} IS NOT NULL`,
        isNull(orders.deliveredAt),
      ),
    )
    .returning()

  if (!row) return c.json({ error: 'not_deliverable' }, 409)
  return c.json(orderToSellerOrder(row, [], undefined))
})

/** GET /seller/scryfall/search?q= — búsqueda para el alta (cache KV). */
sellerPanel.get('/scryfall/search', async (c) => {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ error: 'missing_query' }, 400)
  try {
    return c.json({ results: await searchCards(q, c.env.SESSIONS) })
  } catch (err) {
    if (err instanceof ScryfallError) {
      return c.json({ error: 'scryfall_error', status: err.status }, 502)
    }
    throw err
  }
})
