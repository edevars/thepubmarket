/**
 * Órdenes del comprador (Fase 2). Requiere sesión; cada quien solo ve las suyas.
 *   - GET /orders      → lista las órdenes propias (más recientes primero).
 *   - GET /orders/:id  → detalle de una orden propia (para la página de éxito).
 */
import { orderItems, orders as ordersTable } from '@thepubmarket/db'
import type { OrderSummary } from '@thepubmarket/shared'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { orderToSummary } from '../lib/orders'
import { buyerAuth } from '../middleware/buyer-auth'
import type { AppEnv } from '../types'

export const ordersRoutes = new Hono<AppEnv>()

ordersRoutes.use('*', buyerAuth)

/** GET /orders — órdenes del comprador autenticado. */
ordersRoutes.get('/', async (c) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'unauthorized' }, 401)
  const db = c.get('db')

  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.buyerUserId, user.id))
    .orderBy(desc(ordersTable.createdAt))
    .all()
  if (rows.length === 0) return c.json({ orders: [] as OrderSummary[] })

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

  const result = rows.map((o) => orderToSummary(o, itemsByOrder.get(o.id) ?? []))
  return c.json({ orders: result })
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
