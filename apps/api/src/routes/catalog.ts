/**
 * API pública de catálogo (Fase 1). Solo lectura, sin auth.
 *
 * Sirve inventario activo desde D1 (vía Drizzle) usando los snapshots de carta
 * guardados en cada fila — NO llama a Scryfall en el render. Búsqueda básica por
 * nombre/set con LIKE + índices (servicio de búsqueda externo llega en Fase 5).
 */

import { inventory, sellers } from '@thepubmarket/db'
import type { CatalogGamesResponse, Tcg } from '@thepubmarket/shared'
import { TCGS } from '@thepubmarket/shared'
import { and, asc, count, desc, eq, gt, inArray, like, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { rowToInventoryItem } from '../lib/inventory'
import { loadPhotosByInventoryId } from '../lib/photos'
import type { AppEnv } from '../types'

const DEFAULT_LIMIT = 24
// Tope alto: en Fase 1 (un solo seller, catálogo pequeño) el frontend trae el
// inventario activo en una página y filtra en cliente. La paginación real / un
// servicio de búsqueda llegan cuando el catálogo crezca (Fase 5).
const MAX_LIMIT = 200

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

/**
 * Interpreta el filtro de juego. Ausente/vacío = sin filtro; un juego fuera de
 * `TCGS` es un error explícito y no un catálogo vacío silencioso, que se vería
 * igual que "no hay nada de ese juego".
 */
export function parseTcgParam(raw: string | undefined): { tcg?: Tcg; invalid: boolean } {
  const value = raw?.trim()
  if (!value) return { invalid: false }
  return TCGS.includes(value as Tcg) ? { tcg: value as Tcg, invalid: false } : { invalid: true }
}

export const catalog = new Hono<AppEnv>()

/**
 * GET /catalog — lista paginada de inventario disponible.
 * Query: q (nombre, LIKE), tcg (juego exacto), set (set_code exacto),
 * seller (id exacto), limit, offset. Disponible = status 'active' y quantity > 0.
 */
catalog.get('/', async (c) => {
  const db = c.get('db')
  const q = c.req.query('q')?.trim()
  const set = c.req.query('set')?.trim()
  const seller = c.req.query('seller')?.trim()
  const { tcg, invalid } = parseTcgParam(c.req.query('tcg'))
  if (invalid) return c.json({ error: 'invalid_tcg', supported: TCGS }, 400)
  const limit = parseIntParam(c.req.query('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  const offset = parseIntParam(c.req.query('offset'), 0, 0, Number.MAX_SAFE_INTEGER)

  const filters: SQL[] = [eq(inventory.status, 'active'), gt(inventory.quantity, 0)]
  // SQLite LIKE es case-insensitive para ASCII; el índice usa COLLATE NOCASE.
  if (q) filters.push(like(inventory.title, `%${q}%`))
  if (tcg) filters.push(eq(inventory.tcg, tcg))
  if (set) filters.push(eq(inventory.setCode, set))
  if (seller) filters.push(eq(inventory.sellerId, seller))
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

  const sellerIds = [...new Set(rows.map((r) => r.sellerId))]
  const [sellerRows, photosByInventoryId] = await Promise.all([
    sellerIds.length > 0
      ? db.select().from(sellers).where(inArray(sellers.id, sellerIds)).all()
      : Promise.resolve([]),
    loadPhotosByInventoryId(
      db,
      rows.map((r) => r.id),
      new URL(c.req.url).origin,
    ),
  ])
  const sellerById = new Map(sellerRows.map((s) => [s.id, s]))

  return c.json({
    items: rows.map((row) => {
      const seller = sellerById.get(row.sellerId)
      return rowToInventoryItem(
        row,
        { name: seller?.name ?? '', verified: seller?.verified ?? false },
        photosByInventoryId.get(row.id) ?? [],
      )
    }),
    total: totalRow?.total ?? 0,
    limit,
    offset,
  })
})

/**
 * GET /catalog/games — cuántos singles disponibles hay por juego.
 *
 * Va ANTES de `/:id` a propósito: registrada después, Hono trataría "games"
 * como el id de un item.
 *
 * Existe para que el filtro de juego pueda vivir en el servidor sin romper la
 * navegación: la barra lateral necesita los conteos de TODOS los juegos, no
 * solo el que se está viendo, o el comprador no podría cambiarse de juego.
 */
catalog.get('/games', async (c) => {
  const db = c.get('db')
  const rows = await db
    .select({ tcg: inventory.tcg, total: count() })
    .from(inventory)
    .where(and(eq(inventory.status, 'active'), gt(inventory.quantity, 0)))
    .groupBy(inventory.tcg)
    .orderBy(desc(count()))
    .all()

  const body: CatalogGamesResponse = {
    items: rows.map((r) => ({ tcg: r.tcg as Tcg, count: r.total })),
  }
  return c.json(body)
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
  const [seller, photosByInventoryId] = await Promise.all([
    db.select().from(sellers).where(eq(sellers.id, row.sellerId)).get(),
    loadPhotosByInventoryId(db, [row.id], new URL(c.req.url).origin),
  ])
  return c.json(
    rowToInventoryItem(
      row,
      { name: seller?.name ?? '', verified: seller?.verified ?? false },
      photosByInventoryId.get(row.id) ?? [],
    ),
  )
})
