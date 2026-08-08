/**
 * Sellers públicos (tiendas). Solo lectura, sin auth: es el escaparate.
 *
 * `singlesCount` se agrega con LEFT JOIN + `distinctCardCount` — los filtros de
 * inventario van en el ON del JOIN (no en el WHERE) para que las tiendas sin
 * stock cuenten 0 en vez de desaparecer. Cuenta CARTAS, no publicaciones
 * (TASK-062): es el número que el comprador puede verificar contando tarjetas
 * en el grid de la tienda. El panel del propio seller (`seller-panel.ts`) sí
 * cuenta publicaciones, que es lo que ahí se administra.
 */
import { inventory, sellers } from '@thepubmarket/db'
import { and, asc, eq, getTableColumns, gt } from 'drizzle-orm'
import { Hono } from 'hono'
import { distinctCardCount } from '../lib/inventory'
import { rowToSeller } from '../lib/sellers'
import type { AppEnv } from '../types'

/** Inventario disponible del seller: activo y con stock. */
const availableInventoryOn = and(
  eq(inventory.sellerId, sellers.id),
  eq(inventory.status, 'active'),
  gt(inventory.quantity, 0),
)

export const sellersRoutes = new Hono<AppEnv>()

sellersRoutes.get('/', async (c) => {
  const db = c.get('db')

  const rows = await db
    .select({ ...getTableColumns(sellers), singlesCount: distinctCardCount })
    .from(sellers)
    .leftJoin(inventory, availableInventoryOn)
    .where(eq(sellers.status, 'active'))
    .groupBy(sellers.id)
    .orderBy(asc(sellers.memberSince), asc(sellers.name))
    .all()

  return c.json({ items: rows.map(rowToSeller) })
})

sellersRoutes.get('/:slug', async (c) => {
  const db = c.get('db')
  const slug = c.req.param('slug')

  const row = await db
    .select({ ...getTableColumns(sellers), singlesCount: distinctCardCount })
    .from(sellers)
    .leftJoin(inventory, availableInventoryOn)
    .where(and(eq(sellers.slug, slug), eq(sellers.status, 'active')))
    .groupBy(sellers.id)
    .get()

  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(rowToSeller(row))
})
