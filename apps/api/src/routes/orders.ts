/**
 * Órdenes del comprador (Fase 2). Requiere sesión; cada quien solo ve las suyas.
 *   - GET /orders      → lista propia enriquecida para "Mis compras" (BuyerOrder:
 *                        tienda, estado derivado, tracking, líneas con cond/set).
 *   - GET /orders/:id  → detalle de una orden propia (para la página de éxito).
 */
import { inventory, orderItems, orders as ordersTable, sellers } from '@thepubmarket/db'
import type { BuyerOrdersResponse } from '@thepubmarket/shared'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { orderToBuyerOrder, orderToSummary } from '../lib/orders'
import { buyerAuth } from '../middleware/buyer-auth'
import type { AppEnv } from '../types'

export const ordersRoutes = new Hono<AppEnv>()

ordersRoutes.use('*', buyerAuth)

/** GET /orders — órdenes del comprador autenticado (contrato BuyerOrder). */
ordersRoutes.get('/', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const db = c.get('db')

  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.buyerUserId, user.id))
    .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id))
    .all()
  if (rows.length === 0) return c.json({ items: [] } satisfies BuyerOrdersResponse)

  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((r) => r.id),
      ),
    )
    .all()
  const itemsByOrder = new Map<string, typeof items>()
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) ?? []
    list.push(it)
    itemsByOrder.set(it.orderId, list)
  }

  // Enriquecimiento: tienda (nombre/slug/verified) e inventario original de
  // cada línea (cond/set/imagen; puede ya no existir — FK set-null).
  const sellerIds = [...new Set(rows.map((o) => o.sellerId))]
  const inventoryIds = [...new Set(items.map((i) => i.inventoryId).filter((x): x is string => !!x))]
  const [sellerRows, inventoryRows] = await Promise.all([
    db.select().from(sellers).where(inArray(sellers.id, sellerIds)).all(),
    inventoryIds.length > 0
      ? db.select().from(inventory).where(inArray(inventory.id, inventoryIds)).all()
      : Promise.resolve([]),
  ])
  const sellerById = new Map(sellerRows.map((s) => [s.id, s]))
  const inventoryById = new Map(inventoryRows.map((i) => [i.id, i]))

  const body: BuyerOrdersResponse = {
    items: rows.map((o) =>
      orderToBuyerOrder(o, itemsByOrder.get(o.id) ?? [], sellerById.get(o.sellerId), inventoryById),
    ),
  }
  return c.json(body)
})

/** GET /orders/:id — detalle de una orden propia. */
ordersRoutes.get('/:id', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const db = c.get('db')

  const order = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, c.req.param('id')), eq(ordersTable.buyerUserId, user.id)))
    .get()
  if (!order) return c.json({ error: 'not_found' }, 404)

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).all()
  return c.json(orderToSummary(order, items))
})
