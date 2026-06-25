/**
 * Admin interno de carga de inventario (Fase 1). Protegido por `adminAuth`.
 *
 * Flujo: el operador busca la carta en Scryfall (`/admin/scryfall/search`),
 * toma su scryfall_id y publica un single (`POST /admin/inventory`). Al publicar
 * se guarda un snapshot de los datos canónicos de la carta para que el catálogo
 * público no dependa de Scryfall en cada render.
 *
 * Acceso a datos con Drizzle (@thepubmarket/db). Dinero SIEMPRE en enteros
 * (centavos MXN). Sin pagos ni reservas aquí.
 */

import { inventory } from '@thepubmarket/db'
import { ANCHOR_SELLER_ID, type CardSnapshot, CONDITIONS, FINISHES } from '@thepubmarket/shared'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { rowToInventoryItem } from '../lib/inventory'
import { getCardById, ScryfallError, searchCards } from '../lib/scryfall'
import type { AppEnv } from '../types'

const createSchema = z.object({
  scryfallId: z.string().uuid(),
  condition: z.enum(CONDITIONS as [string, ...string[]]),
  finish: z.enum(FINISHES as [string, ...string[]]),
  // Idioma del single ofrecido (ISO corto de Scryfall: 'en', 'es', 'ja'…).
  language: z.string().min(2).max(8).default('en'),
  priceCents: z.number().int().min(0),
  quantity: z.number().int().min(1),
  sellerId: z.string().uuid().default(ANCHOR_SELLER_ID),
})

const updateSchema = z
  .object({
    priceCents: z.number().int().min(0).optional(),
    quantity: z.number().int().min(0).optional(),
    condition: z.enum(CONDITIONS as [string, ...string[]]).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no_fields_to_update' })

export const admin = new Hono<AppEnv>()

/** GET /admin/scryfall/search?q= — lookup de cartas para encontrar el scryfall_id. */
admin.get('/scryfall/search', async (c) => {
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

/** POST /admin/inventory — publica un single ligado a una impresión de Scryfall. */
admin.post('/inventory', async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }
  const input = parsed.data

  // Trae el snapshot canónico de la carta (cache KV → Scryfall).
  let card: CardSnapshot
  try {
    card = await getCardById(input.scryfallId, c.env.SESSIONS)
  } catch (err) {
    if (err instanceof ScryfallError) {
      const code = err.status === 404 ? 404 : 502
      return c.json({ error: 'card_not_found_or_scryfall_error', status: err.status }, code)
    }
    throw err
  }

  // El acabado pedido debe existir para esa impresión (cuando Scryfall lo informa).
  if (card.finishes.length > 0 && !card.finishes.includes(input.finish)) {
    return c.json({ error: 'finish_not_available', available: card.finishes }, 400)
  }

  const [row] = await c
    .get('db')
    .insert(inventory)
    .values({
      id: crypto.randomUUID(),
      sellerId: input.sellerId,
      tcg: 'mtg',
      title: card.name,
      scryfallId: card.scryfallId,
      oracleId: card.oracleId,
      setCode: card.setCode,
      setName: card.setName,
      collectorNumber: card.collectorNumber,
      cardLang: input.language,
      rarity: card.rarity,
      artist: card.artist,
      finish: input.finish as 'nonfoil' | 'foil',
      condition: input.condition,
      priceCents: input.priceCents,
      quantity: input.quantity,
      status: 'active',
      // Snapshot de la URL de Scryfall. TODO: migrar imágenes a R2.
      imageUrl: card.imageUrl,
    })
    .returning()

  if (!row) return c.json({ error: 'insert_failed' }, 500)
  return c.json(rowToInventoryItem(row), 201)
})

/** PATCH /admin/inventory/:id — edita precio, cantidad, condición o estado. */
admin.patch('/inventory/:id', async (c) => {
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
    .where(eq(inventory.id, id))
    .returning()

  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(rowToInventoryItem(row))
})

/** POST /admin/inventory/:id/deactivate — retira el item del catálogo. */
admin.post('/inventory/:id/deactivate', async (c) => {
  const id = c.req.param('id')

  const [row] = await c
    .get('db')
    .update(inventory)
    .set({ status: 'inactive', updatedAt: sql`(unixepoch())` })
    .where(eq(inventory.id, id))
    .returning({ id: inventory.id })

  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({ ok: true })
})
