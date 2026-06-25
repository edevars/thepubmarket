/**
 * API pública de catálogo (Fase 1). Solo lectura, sin auth.
 *
 * Sirve inventario activo desde D1 (vía Drizzle) usando los snapshots de carta
 * guardados en cada fila — NO llama a Scryfall en el render. Búsqueda básica por
 * nombre/set con LIKE + índices (servicio de búsqueda externo llega en Fase 5).
 */

import { inventory } from '@thepubmarket/db'
import { and, asc, count, eq, gt, like, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { rowToInventoryItem } from '../lib/inventory'
import type { AppEnv } from '../types'

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 60

/** Parsea un entero de query param dentro de [min, max], con fallback. */
function parseIntParam(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(raw)
  if (!Number.isInteger(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

export const catalog = new Hono<AppEnv>()

/**
 * GET /catalog — lista paginada de inventario disponible.
 * Query: q (nombre, LIKE), set (set_code exacto), limit, offset.
 * Disponible = status 'active' y quantity > 0.
 */
catalog.get('/', async (c) => {
  const db = c.get('db')
  const q = c.req.query('q')?.trim()
  const set = c.req.query('set')?.trim()
  const limit = parseIntParam(c.req.query('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  const offset = parseIntParam(c.req.query('offset'), 0, 0, Number.MAX_SAFE_INTEGER)

  const filters: SQL[] = [eq(inventory.status, 'active'), gt(inventory.quantity, 0)]
  // SQLite LIKE es case-insensitive para ASCII; el índice usa COLLATE NOCASE.
  if (q) filters.push(like(inventory.title, `%${q}%`))
  if (set) filters.push(eq(inventory.setCode, set))
  const where = and(...filters)

  const totalRow = await db.select({ total: count() }).from(inventory).where(where).get()

  const rows = await db
    .select()
    .from(inventory)
    .where(where)
    .orderBy(asc(inventory.title), asc(inventory.id))
    .limit(limit)
    .offset(offset)
    .all()

  return c.json({
    items: rows.map(rowToInventoryItem),
    total: totalRow?.total ?? 0,
    limit,
    offset,
  })
})

/**
 * GET /catalog/:id — detalle de un item disponible. 404 si no existe o no está
 * activo. Los datos de carta vienen del snapshot, no de Scryfall.
 */
catalog.get('/:id', async (c) => {
  const db = c.get('db')
  const id = c.req.param('id')

  const row = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.id, id), eq(inventory.status, 'active')))
    .get()

  if (!row) {
    return c.json({ error: 'not_found' }, 404)
  }
  return c.json(rowToInventoryItem(row))
})
