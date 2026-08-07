/**
 * Admin interno: carga de inventario e invitación de vendedores vetted.
 * Todo aquí está protegido por `adminAuth` (clave compartida `x-admin-key`).
 *
 * Es el ÚNICO lugar del API que puede convertir a un usuario en vendedor
 * (`POST /sellers/:id/link` escribe `sellers.user_id`). No existe ruta pública
 * equivalente: el modelo es vetted, por invitación, sin auto-registro.
 *
 * Flujo: el operador busca la carta en el catálogo de su juego
 * (`/admin/catalog/search?game=`), toma su catalogId y publica un single
 * (`POST /admin/inventory`). Al publicar se guarda un snapshot de los datos
 * canónicos para que el catálogo público no dependa del proveedor en cada
 * render.
 *
 * Acceso a datos con Drizzle (@thepubmarket/db). Dinero SIEMPRE en enteros
 * (centavos MXN). Sin pagos ni reservas aquí.
 */

import {
  catalogCards,
  inventory,
  inventoryPhotos,
  sellerInvitations,
  sellers,
  users,
} from '@thepubmarket/db'
import {
  ANCHOR_SELLER_ID,
  CONDITIONS,
  FINISHES,
  MTG_CARD_TYPES,
  MTG_COLORS,
  TCGS,
  type Tcg,
} from '@thepubmarket/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { buildCardImageKey, ensureCardImage, isValidCatalogId } from '../lib/card-images'
import { CatalogError } from '../lib/catalog'
import { catalogProviderFor, supportedTcgs } from '../lib/catalog-providers'
import { createListing, type ListingInput, rowToInventoryItem } from '../lib/inventory'
import { loadPhotosByInventoryId } from '../lib/photos'
import { clientIp } from '../lib/rate-limit'
import type { AppEnv } from '../types'

const createSchema = z.object({
  // Un tcg fuera de la lista soportada se rechaza aquí; un tcg válido pero
  // sin catálogo integrado lo rechaza createListing con `tcg_not_supported`.
  tcg: z.enum(TCGS as [Tcg, ...Tcg[]]).default('mtg'),
  /** Id de la impresión en el catálogo de su juego (UUID de Scryfall en MTG). */
  catalogId: z.string().min(1).max(64),
  condition: z.enum(CONDITIONS as [string, ...string[]]),
  finish: z.enum(FINISHES as [string, ...string[]]),
  // Idioma del single ofrecido (ISO corto: 'en', 'es', 'ja'…).
  language: z.string().min(2).max(8).default('en'),
  priceCents: z.number().int().min(0),
  quantity: z.number().int().min(1),
  sellerId: z.string().uuid().default(ANCHOR_SELLER_ID),
})

/** Query de `GET /admin/catalog/search`. */
const searchQuerySchema = z.object({
  game: z.enum(TCGS as [Tcg, ...Tcg[]]).default('mtg'),
  q: z.string().min(1),
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

/**
 * GET /admin/catalog/search?game=&q= — lookup de cartas para encontrar el
 * catalogId a publicar. `game` omitido = 'mtg'.
 */
admin.get('/catalog/search', async (c) => {
  const parsed = searchQuerySchema.safeParse({
    game: c.req.query('game') ?? undefined,
    q: c.req.query('q')?.trim(),
  })
  if (!parsed.success) {
    return c.json({ error: 'invalid_query', issues: parsed.error.issues }, 400)
  }

  const provider = catalogProviderFor(parsed.data.game)
  if (!provider) {
    return c.json(
      { error: 'tcg_not_supported', tcg: parsed.data.game, supported: supportedTcgs() },
      400,
    )
  }

  try {
    const ctx = { db: c.get('db'), kv: c.env.SESSIONS, origin: new URL(c.req.url).origin }
    return c.json({ results: await provider.searchCards(parsed.data.q, ctx) })
  } catch (err) {
    if (err instanceof CatalogError) {
      return c.json({ error: 'catalog_error', tcg: parsed.data.game, status: err.status }, 502)
    }
    throw err
  }
})

/** POST /admin/inventory — publica un single ligado a una impresión de su catálogo. */
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
  const ctx = { db, kv: c.env.SESSIONS, origin: new URL(c.req.url).origin }
  const result = await createListing(ctx, offer as ListingInput, sellerId)
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

  const db = c.get('db')
  const [row] = await db
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

/**
 * DELETE /admin/inventory/photos/:photoId — borrado forzoso de una foto de
 * CUALQUIER seller (TASK-024). Es la palanca de moderación de v1: sellers
 * vetted por invitación, así que el operador quitando la foto directamente es
 * proporcional; no hay flujo de reporte de compradores.
 *
 * Sin filtro de dueño a propósito — a diferencia del panel, el admin puede
 * tocar cualquier fila. Misma política de huérfanos: fila primero, R2
 * best-effort después.
 */
admin.delete('/inventory/photos/:photoId', async (c) => {
  const photoId = c.req.param('photoId')
  const db = c.get('db')

  const [row] = await db.delete(inventoryPhotos).where(eq(inventoryPhotos.id, photoId)).returning()
  if (!row) return c.json({ error: 'not_found' }, 404)

  await c.env.ASSETS.delete(row.r2Key).catch((err) => {
    console.error('admin: R2 delete falló (huérfano tolerado)', row.r2Key, err)
  })

  return c.json({ ok: true })
})

/**
 * POST /admin/catalog/cards — ingesta del catálogo canónico (TASK-036).
 *
 * Recibe un batch de cartas YA mapeadas y limpias (el importer hace el parseo
 * del formato de la fuente; el Worker no interpreta HTML), hace upsert en
 * `catalog_cards` y espeja las imágenes desde su CDN de origen hacia R2.
 *
 * Idempotente por diseño: el upsert converge sobre la PK (tcg, catalog_id) y
 * una imagen ya presente en R2 se detecta con head() y no se re-descarga. Las
 * llaves de imagen solo se escriben en la fila cuando el objeto existe de
 * verdad, así `image_r2_key IS NULL` significa "imagen faltante" de forma
 * confiable y el importer puede re-intentar exactamente eso.
 *
 * El tope de 25 cartas por request existe por el límite de subrequests del
 * Worker (head+fetch+put por imagen); el importer manda batches de 10.
 */
const ingestCardSchema = z.object({
  catalogId: z.string().min(1).max(64).refine(isValidCatalogId, 'invalid catalog id'),
  name: z.string().min(1).max(200),
  setCode: z.string().min(1).max(16),
  setName: z.string().min(1).max(100),
  collectorNumber: z.string().min(1).max(16),
  lang: z.string().min(2).max(8).default('en'),
  rarity: z.string().max(40).default(''),
  artist: z.string().max(200).nullish(),
  finishes: z.array(z.enum(FINISHES as [string, ...string[]])).default([]),
  rulesText: z.string().max(4000).nullish(),
  flavorText: z.string().max(2000).nullish(),
  /** Blob de presentación por juego (RiftboundAttributes); se guarda como JSON. */
  gameAttributes: z.record(z.unknown()).nullish(),
  /** Snapshot de precios de mercado de la fuente; referencia, nunca precio de venta. */
  priceData: z.record(z.unknown()).nullish(),
  priceFetchedAt: z.number().int().positive().nullish(),
  sourceImageUrl: z.string().url().max(500).nullish(),
  sourceImageBackUrl: z.string().url().max(500).nullish(),
})

const ingestSchema = z.object({
  // Allowlist de juegos con importer, no TCGS completo: un tcg sin catálogo
  // local no debe aceptar escrituras aunque el enum global lo conozca.
  tcg: z.enum(['riftbound']),
  cards: z.array(ingestCardSchema).min(1).max(25),
})

/** Espeja las imágenes de una carta con concurrencia acotada por chunk. */
const IMAGE_CONCURRENCY = 5

admin.post('/catalog/cards', async (c) => {
  const parsed = ingestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }
  const { tcg, cards } = parsed.data
  const db = c.get('db')

  // 1. Upsert de todo el batch en UNA llamada a D1. Los campos de imagen NO se
  // tocan aquí: los escribe el paso 3 solo cuando el objeto existe en R2.
  const upserts = cards.map((card) =>
    db
      .insert(catalogCards)
      .values({
        tcg,
        catalogId: card.catalogId,
        name: card.name,
        setCode: card.setCode,
        setName: card.setName,
        collectorNumber: card.collectorNumber,
        lang: card.lang,
        rarity: card.rarity,
        artist: card.artist ?? null,
        finishes: card.finishes,
        rulesText: card.rulesText ?? null,
        flavorText: card.flavorText ?? null,
        gameAttributes: card.gameAttributes ? JSON.stringify(card.gameAttributes) : null,
        priceData: card.priceData ? JSON.stringify(card.priceData) : null,
        priceFetchedAt: card.priceFetchedAt ?? null,
        sourceImageUrl: card.sourceImageUrl ?? null,
        sourceImageBackUrl: card.sourceImageBackUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [catalogCards.tcg, catalogCards.catalogId],
        set: {
          name: card.name,
          setCode: card.setCode,
          setName: card.setName,
          collectorNumber: card.collectorNumber,
          lang: card.lang,
          rarity: card.rarity,
          artist: card.artist ?? null,
          finishes: card.finishes,
          rulesText: card.rulesText ?? null,
          flavorText: card.flavorText ?? null,
          gameAttributes: card.gameAttributes ? JSON.stringify(card.gameAttributes) : null,
          priceData: card.priceData ? JSON.stringify(card.priceData) : null,
          priceFetchedAt: card.priceFetchedAt ?? null,
          sourceImageUrl: card.sourceImageUrl ?? null,
          sourceImageBackUrl: card.sourceImageBackUrl ?? null,
          updatedAt: sql`(unixepoch())`,
        },
      }),
  )
  // db.batch exige tupla no vacía; zod ya garantiza cards.min(1).
  const [firstUpsert, ...restUpserts] = upserts
  if (firstUpsert) await db.batch([firstUpsert, ...restUpserts])

  // 2. Espejado de imágenes con concurrencia acotada.
  type ImageOutcome = {
    catalogId: string
    image: 'uploaded' | 'exists' | 'failed' | 'none'
    imageBack: 'uploaded' | 'exists' | 'failed' | 'none'
    imageKey: string | null
    imageBackKey: string | null
  }
  const outcomes: ImageOutcome[] = []
  for (let i = 0; i < cards.length; i += IMAGE_CONCURRENCY) {
    const chunk = cards.slice(i, i + IMAGE_CONCURRENCY)
    const results = await Promise.all(
      chunk.map(async (card): Promise<ImageOutcome> => {
        const frontKey = buildCardImageKey(tcg, card.catalogId, 'front')
        const backKey = buildCardImageKey(tcg, card.catalogId, 'back')
        const image = card.sourceImageUrl
          ? await ensureCardImage(c.env.ASSETS, frontKey, card.sourceImageUrl)
          : 'none'
        const imageBack = card.sourceImageBackUrl
          ? await ensureCardImage(c.env.ASSETS, backKey, card.sourceImageBackUrl)
          : 'none'
        return {
          catalogId: card.catalogId,
          image,
          imageBack,
          imageKey: image === 'uploaded' || image === 'exists' ? frontKey : null,
          imageBackKey: imageBack === 'uploaded' || imageBack === 'exists' ? backKey : null,
        }
      }),
    )
    outcomes.push(...results)
  }

  // 3. Fija las llaves de las imágenes que sí existen en R2 (una llamada D1).
  const keyWrites = outcomes.filter((o) => o.imageKey || o.imageBackKey)
  if (keyWrites.length > 0) {
    const [first, ...rest] = keyWrites.map((o) =>
      db
        .update(catalogCards)
        .set({
          ...(o.imageKey ? { imageR2Key: o.imageKey } : {}),
          ...(o.imageBackKey ? { imageBackR2Key: o.imageBackKey } : {}),
        })
        .where(and(eq(catalogCards.tcg, tcg), eq(catalogCards.catalogId, o.catalogId))),
    )
    if (first) await db.batch([first, ...rest])
  }

  const summary = {
    upserted: cards.length,
    imagesUploaded: outcomes.filter((o) => o.image === 'uploaded' || o.imageBack === 'uploaded')
      .length,
    imagesExisting: outcomes.filter((o) => o.image === 'exists').length,
    imagesFailed: outcomes.filter((o) => o.image === 'failed' || o.imageBack === 'failed').length,
  }
  return c.json({
    results: outcomes.map(({ catalogId, image, imageBack }) => ({
      catalogId,
      row: 'upserted',
      image,
      imageBack,
    })),
    summary,
  })
})

/**
 * Backfill de atributos de MTG (TASK-050). Cada single de MTG cargado antes de
 * TASK-049 quedó con `card_attributes = NULL` — el pipeline de alta no los
 * derivaba todavía. Estos dos endpoints son la mitad de lectura/escritura que
 * usa `scripts/backfill-mtg-attributes.mjs` para reconstruirlos desde Scryfall,
 * en local y en prod contra el mismo camino (misma auth, misma validación).
 *
 * `SAFE_MTG_ATTRS` replica el patrón de `catalog-filters.ts`: `json_extract`
 * sobre un blob inválido lanza en SQLite, así que primero se valida con
 * `json_valid` y solo entonces se extrae. Una fila con `card_attributes`
 * corrupto (no JSON, o JSON sin `colors`) cuenta como "faltante" igual que
 * NULL — ambas dejan a la carta fuera de los filtros de color/tipo.
 */
const SAFE_MTG_ATTRS = sql`iif(json_valid(${inventory.cardAttributes}), ${inventory.cardAttributes}, NULL)`
const missingAttributesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

/**
 * GET /admin/inventory/mtg-missing-attributes?limit= — filas de MTG sin
 * `card_attributes` válido. Devuelve el id de inventario y el id de la
 * impresión en Scryfall (`catalogId`, con fallback a `scryfallId` legacy vía
 * `catalogIdOf` — ver lib/inventory.ts) para que el script pueda resolverla
 * de nuevo contra `POST /cards/collection`.
 */
admin.get('/inventory/mtg-missing-attributes', async (c) => {
  const parsed = missingAttributesQuerySchema.safeParse({ limit: c.req.query('limit') })
  if (!parsed.success) {
    return c.json({ error: 'invalid_query', issues: parsed.error.issues }, 400)
  }
  const db = c.get('db')

  const rows = await db
    .select({ id: inventory.id, catalogId: inventory.catalogId, scryfallId: inventory.scryfallId })
    .from(inventory)
    .where(
      and(
        eq(inventory.tcg, 'mtg'),
        sql`(${inventory.cardAttributes} IS NULL OR json_extract(${SAFE_MTG_ATTRS}, '$.colors') IS NULL)`,
      ),
    )
    .orderBy(inventory.createdAt)
    .limit(parsed.data.limit)
    .all()

  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      scryfallId: row.catalogId ?? row.scryfallId ?? null,
    })),
  })
})

/** Forma de `MtgAttributes` (@thepubmarket/shared) — ver TASK-049. */
const mtgAttributesSchema = z.object({
  tcg: z.literal('mtg'),
  colors: z.array(z.enum([...MTG_COLORS] as [string, ...string[]])).min(1),
  types: z.array(z.enum([...MTG_CARD_TYPES] as [string, ...string[]])),
  typeLine: z.string().min(1).nullable(),
  manaValue: z.number().nullable(),
})

const attributesBatchSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      gameAttributes: mtgAttributesSchema,
    }),
  )
  .min(1)
  .max(200)

/**
 * POST /admin/inventory/attributes — aplica un batch de `card_attributes`
 * resueltos por el script de backfill. Todo o nada: si un solo item del batch
 * no tiene forma de `MtgAttributes`, se rechaza el batch completo (400) antes
 * de tocar la base — mejor que aplicar parcial y dejar al script sin saber qué
 * fila sí quedó actualizada.
 */
admin.post('/inventory/attributes', async (c) => {
  const parsed = attributesBatchSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }
  const items = parsed.data
  const db = c.get('db')

  // db.batch exige tupla no vacía; zod ya garantiza items.min(1).
  const [first, ...rest] = items.map((item) =>
    db
      .update(inventory)
      .set({ cardAttributes: JSON.stringify(item.gameAttributes), updatedAt: sql`(unixepoch())` })
      .where(and(eq(inventory.id, item.id), eq(inventory.tcg, 'mtg')))
      .returning({ id: inventory.id }),
  )
  const results = first ? await db.batch([first, ...rest]) : []
  const updatedIds = new Set(results.flat().map((r) => r.id))
  const notFound = items.map((i) => i.id).filter((id) => !updatedIds.has(id))

  return c.json({ updated: updatedIds.size, notFound })
})
