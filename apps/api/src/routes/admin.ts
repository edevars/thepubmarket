/**
 * Admin interno: carga de inventario e invitación de vendedores vetted.
 * Todo aquí está protegido por `adminAuth` (clave compartida `x-admin-key`).
 *
 * Es el ÚNICO lugar del API que puede convertir a un usuario en vendedor
 * (`POST /sellers/:id/link` escribe `sellers.user_id`). No existe ruta pública
 * equivalente: el modelo es vetted, por invitación, sin auto-registro.
 *
 * Flujo: el operador busca la carta en Scryfall (`/admin/scryfall/search`),
 * toma su scryfall_id y publica un single (`POST /admin/inventory`). Al publicar
 * se guarda un snapshot de los datos canónicos de la carta para que el catálogo
 * público no dependa de Scryfall en cada render.
 *
 * Acceso a datos con Drizzle (@thepubmarket/db). Dinero SIEMPRE en enteros
 * (centavos MXN). Sin pagos ni reservas aquí.
 */

import { inventory, sellerInvitations, sellers, users } from '@thepubmarket/db'
import { ANCHOR_SELLER_ID, CONDITIONS, FINISHES } from '@thepubmarket/shared'
import { desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createListing, type ListingInput, rowToInventoryItem } from '../lib/inventory'
import { clientIp } from '../lib/rate-limit'
import { ScryfallError, searchCards } from '../lib/scryfall'
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
  const { sellerId, ...offer } = parsed.data
  const db = c.get('db')

  const seller = await db.select().from(sellers).where(eq(sellers.id, sellerId)).get()
  if (!seller) return c.json({ error: 'seller_not_found' }, 404)

  // Lógica de alta compartida con el panel del seller (lib/inventory).
  const result = await createListing(db, c.env.SESSIONS, offer as ListingInput, sellerId)
  if (!result.ok) {
    return c.json({ error: result.error, ...result.extra }, result.status)
  }
  return c.json(
    rowToInventoryItem(result.row, { name: seller.name, verified: seller.verified }),
    201,
  )
})

/**
 * POST /admin/sellers/:id/link — vincula (invita) un seller con el usuario
 * dueño de un email. Crea el usuario si no existe (al registrarse con ese mismo
 * email reclama la cuenta y entra al panel). Modelo vetted: la invitación es
 * manual, no hay auto-registro de sellers.
 *
 * Auditoría (TASK-010): cada invocación escribe una fila en `seller_invitations`
 * — quién invitó (`x-admin-actor`), a qué email, a qué seller y cuándo. La
 * bitácora es append-only: re-vincular agrega otra fila, no pisa la anterior.
 * El header `x-admin-actor` es OBLIGATORIO; sin él no hay a quién atribuir la
 * acción y la petición se rechaza con 400. Ver docs/ingenieria/invitacion-sellers.md.
 */
const linkSchema = z.object({
  email: z.string().email(),
  // Contexto libre para la bitácora ("acordado con X en la tienda el 24/07").
  note: z.string().trim().max(500).optional(),
})
const actorSchema = z.string().email().max(254)

admin.post('/sellers/:id/link', async (c) => {
  const sellerId = c.req.param('id')

  const actorParsed = actorSchema.safeParse(c.req.header('x-admin-actor')?.trim().toLowerCase())
  if (!actorParsed.success) {
    return c.json({ error: 'missing_admin_actor' }, 400)
  }
  const invitedBy = actorParsed.data

  const parsed = linkSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }
  const email = parsed.data.email.trim().toLowerCase()
  const db = c.get('db')

  const seller = await db.select().from(sellers).where(eq(sellers.id, sellerId)).get()
  if (!seller) return c.json({ error: 'not_found' }, 404)

  const existing = await db.select().from(users).where(eq(users.email, email)).get()
  const user =
    existing ??
    (
      await db.insert(users).values({ id: crypto.randomUUID(), email, role: 'buyer' }).returning()
    )[0]
  if (!user) return c.json({ error: 'insert_failed' }, 500)

  await db
    .update(sellers)
    .set({ userId: user.id, updatedAt: sql`(unixepoch())` })
    .where(eq(sellers.id, sellerId))

  // La bitácora se escribe DESPUÉS del vínculo: si el update falla, no queda
  // registrada una invitación que en realidad nunca ocurrió.
  const invitationId = crypto.randomUUID()
  await db.insert(sellerInvitations).values({
    id: invitationId,
    sellerId,
    email,
    userId: user.id,
    invitedBy,
    ip: clientIp(c.req.header('cf-connecting-ip')),
    note: parsed.data.note,
  })

  return c.json({ ok: true, sellerId, userId: user.id, email, invitationId, invitedBy })
})

/**
 * GET /admin/sellers/:id/invitations — bitácora de invitaciones del seller, de
 * la más reciente a la más antigua. Una bitácora que no se puede leer no es
 * auditoría: este endpoint es la mitad de lectura de `POST .../link`.
 */
admin.get('/sellers/:id/invitations', async (c) => {
  const sellerId = c.req.param('id')
  const db = c.get('db')

  const seller = await db.select().from(sellers).where(eq(sellers.id, sellerId)).get()
  if (!seller) return c.json({ error: 'not_found' }, 404)

  const items = await db
    .select()
    .from(sellerInvitations)
    .where(eq(sellerInvitations.sellerId, sellerId))
    .orderBy(desc(sellerInvitations.createdAt))
    .all()

  return c.json({
    seller: { id: seller.id, name: seller.name, status: seller.status, userId: seller.userId },
    items,
  })
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
  const seller = await c.get('db').select().from(sellers).where(eq(sellers.id, row.sellerId)).get()
  return c.json(
    rowToInventoryItem(row, { name: seller?.name ?? '', verified: seller?.verified ?? false }),
  )
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
