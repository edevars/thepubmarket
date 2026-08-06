/**
 * API del Panel del Vendedor (`/seller/*`). Autoservicio de la tienda:
 * inventario propio (alta, precio, cantidad, pausa), cumplimiento de órdenes
 * según el método que eligió el comprador (enviar con guía / entregar, o
 * preparar para recoger / cerrar como recogida) y búsqueda en Scryfall.
 *
 * TODO el router va detrás de `sellerAuth`: sesión email+contraseña + fila activa en
 * `sellers` (c.get('seller')). Cada query filtra por el seller de la sesión —
 * nunca se acepta un sellerId del cliente.
 *
 * NO CUSTODIA: aquí no hay pagos. La "liquidación" que se muestra (comisión
 * vía application fee) es informativa; el dinero fluye directo en Stripe.
 */
import type { Db, SellerRow } from '@thepubmarket/db'
import { inventory, inventoryPhotos, orderItems, orders, sellers, users } from '@thepubmarket/db'
import {
  CONDITIONS,
  FINISHES,
  MAX_PHOTOS_PER_ITEM,
  type SellerPanelMe,
  TCGS,
  type Tcg,
} from '@thepubmarket/shared'
import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { CatalogError } from '../lib/catalog'
import { catalogProviderFor, supportedTcgs } from '../lib/catalog-providers'
import { createListing, type ListingInput, rowToInventoryItem } from '../lib/inventory'
import { orderToSellerOrder } from '../lib/orders'
import {
  buildPhotoKey,
  contentTypeFor,
  detectImageKind,
  loadPhotosByInventoryId,
  MAX_PHOTO_BYTES,
  rowToInventoryPhoto,
} from '../lib/photos'
import { rowToSeller } from '../lib/sellers'
import type { AppEnv } from '../types'

const createSchema = z.object({
  // Un tcg fuera de la lista soportada se rechaza aquí; un tcg válido pero
  // sin catálogo integrado lo rechaza createListing con `tcg_not_supported`.
  tcg: z.enum(TCGS as [Tcg, ...Tcg[]]).default('mtg'),
  /** Id de la impresión en el catálogo de su juego (UUID de Scryfall en MTG). */
  catalogId: z.string().min(1).max(64),
  condition: z.enum(CONDITIONS as [string, ...string[]]),
  finish: z.enum(FINISHES as [string, ...string[]]),
  language: z.string().min(2).max(8).default('es'),
  priceCents: z.number().int().min(1),
  quantity: z.number().int().min(1),
})

/** Query de `GET /seller/catalog/search`. */
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

/** Full ordering of a listing's photo ids (TASK-024). */
const reorderPhotosSchema = z.object({
  order: z.array(z.string().uuid()).min(1).max(MAX_PHOTOS_PER_ITEM),
})

const shipSchema = z.object({
  trackingNumber: z.string().trim().min(3).max(64),
  // Paquetería. Opcional a propósito: una guía sin paquetería sigue siendo
  // mejor que ninguna guía, pero sin ella el comprador no sabe dónde rastrear.
  // Texto libre: el catálogo de paqueterías mexicanas cambia más seguido de lo
  // que justificaría un enum en el schema.
  carrier: z.string().trim().min(2).max(60).nullish(),
})

/**
 * Órdenes que se cumplen por paquetería: las de envío a domicilio y las
 * anteriores a TASK-019, que no tienen método registrado. El NULL es
 * load-bearing, no tolerancia: son órdenes reales en producción y el único
 * cumplimiento que existía cuando se crearon era enviarlas.
 */
const shippingOrLegacy = or(isNull(orders.deliveryMethod), eq(orders.deliveryMethod, 'shipping'))

/** Órdenes que se cumplen en mostrador. Nunca incluye las de método nulo. */
const isPickup = eq(orders.deliveryMethod, 'pickup')

/**
 * Tienda de recolección de una orden, para devolverla completa tras una
 * transición. Puede ser otra tienda aliada, no siempre la de la sesión, y puede
 * haberse dado de baja (FK set-null): en ese caso la vista degrada sola.
 */
async function pickupStoreOf(
  db: Db,
  pickupSellerId: string | null,
): Promise<SellerRow | undefined> {
  if (!pickupSellerId) return undefined
  return (await db.select().from(sellers).where(eq(sellers.id, pickupSellerId)).get()) ?? undefined
}

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

  const db = c.get('db')
  const rows = await db
    .select()
    .from(inventory)
    .where(eq(inventory.sellerId, seller.id))
    .orderBy(desc(inventory.updatedAt), desc(inventory.id))
    .all()

  const photosByInventoryId = await loadPhotosByInventoryId(
    db,
    rows.map((r) => r.id),
    new URL(c.req.url).origin,
  )
  const sellerInfo = { name: seller.name, verified: seller.verified }
  return c.json({
    items: rows.map((row) =>
      rowToInventoryItem(row, sellerInfo, photosByInventoryId.get(row.id) ?? []),
    ),
  })
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
  return c.json(
    rowToInventoryItem(result.row, { name: seller.name, verified: seller.verified }),
    201,
  )
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
    // Ownership: solo filas del seller autenticado. Item ajeno = 404 opaco.
    .where(and(eq(inventory.id, id), eq(inventory.sellerId, seller.id)))
    .returning()

  if (!row) return c.json({ error: 'not_found' }, 404)
  // El item editado puede ya tener fotos (TASK-024); sin esto la respuesta del
  // PATCH mentiría con `photos: []` a un cliente que actualiza su estado desde
  // ella, aunque GET /inventory muestre las fotos reales para el mismo item.
  const photosByInventoryId = await loadPhotosByInventoryId(db, [row.id], new URL(c.req.url).origin)
  return c.json(
    rowToInventoryItem(
      row,
      { name: seller.name, verified: seller.verified },
      photosByInventoryId.get(row.id) ?? [],
    ),
  )
})

/**
 * Fotos del listing (TASK-024). Binarios en R2 (`ASSETS`), metadata en
 * `inventory_photos`. Subida PROXIADA por el Worker (no presigned): el mismo
 * código valida dueño, tipo, tamaño y tope antes de que el objeto exista.
 *
 * El servidor nunca confía en el Content-Type declarado ni en el nombre del
 * archivo del cliente — `detectImageKind` decide por los magic bytes, y la
 * llave de R2 la genera el servidor con UUIDs (`buildPhotoKey`).
 */

/** POST /seller/inventory/:id/photos — sube una foto real del ejemplar. */
sellerPanel.post('/inventory/:id/photos', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const inventoryId = c.req.param('id')
  const db = c.get('db')

  // Dueño: el listing debe ser de la sesión. Ajeno o inexistente → 404 opaco,
  // igual que el resto del panel (nunca se distingue uno de otro).
  const item = await db
    .select({ id: inventory.id })
    .from(inventory)
    .where(and(eq(inventory.id, inventoryId), eq(inventory.sellerId, seller.id)))
    .get()
  if (!item) return c.json({ error: 'not_found' }, 404)

  // Rechazo temprano si Content-Length ya declara un tamaño excesivo (evita
  // leer el body completo); el byteLength real de abajo atrapa un header
  // ausente o mentiroso.
  const declaredLength = Number(c.req.header('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PHOTO_BYTES) {
    return c.json({ error: 'photo_too_large' }, 400)
  }

  const buf = await c.req.arrayBuffer()
  if (buf.byteLength === 0) return c.json({ error: 'empty_body' }, 400)
  if (buf.byteLength > MAX_PHOTO_BYTES) {
    return c.json({ error: 'photo_too_large' }, 400)
  }

  const kind = detectImageKind(new Uint8Array(buf))
  if (!kind) return c.json({ error: 'invalid_image' }, 400)

  const before = await db
    .select({ n: count(inventoryPhotos.id) })
    .from(inventoryPhotos)
    .where(eq(inventoryPhotos.inventoryId, inventoryId))
    .get()
  if ((before?.n ?? 0) >= MAX_PHOTOS_PER_ITEM) {
    return c.json({ error: 'photo_limit_reached', limit: MAX_PHOTOS_PER_ITEM }, 409)
  }

  const photoId = crypto.randomUUID()
  const r2Key = buildPhotoKey({ sellerId: seller.id, inventoryId, photoId, kind })
  const contentType = contentTypeFor(kind)

  await c.env.ASSETS.put(r2Key, buf, { httpMetadata: { contentType } })

  const [row] = await db
    .insert(inventoryPhotos)
    .values({
      id: photoId,
      inventoryId,
      sellerId: seller.id,
      r2Key,
      contentType,
      sizeBytes: buf.byteLength,
      sortOrder: before?.n ?? 0,
    })
    .returning()

  if (!row) {
    // El objeto ya existe en R2 pero la fila no se pudo escribir: limpieza
    // best-effort para no dejar un objeto huérfano bajo el prefijo del seller.
    await c.env.ASSETS.delete(r2Key).catch(() => {})
    return c.json({ error: 'insert_failed' }, 500)
  }

  // Recuento POST-insert: cierra la carrera de dos subidas concurrentes que
  // leyeron el mismo conteo antes del tope (no hay transacción real entre el
  // SELECT y el INSERT en D1/Drizzle aquí). La que empuja el total por encima
  // del tope se revierte, la otra queda.
  const after = await db
    .select({ n: count(inventoryPhotos.id) })
    .from(inventoryPhotos)
    .where(eq(inventoryPhotos.inventoryId, inventoryId))
    .get()
  if ((after?.n ?? 0) > MAX_PHOTOS_PER_ITEM) {
    await db.delete(inventoryPhotos).where(eq(inventoryPhotos.id, row.id))
    await c.env.ASSETS.delete(r2Key).catch(() => {})
    return c.json({ error: 'photo_limit_reached', limit: MAX_PHOTOS_PER_ITEM }, 409)
  }

  return c.json(rowToInventoryPhoto(row, new URL(c.req.url).origin), 201)
})

/**
 * DELETE /seller/inventory/:id/photos/:photoId — borra una foto propia.
 *
 * Política de huérfanos: se borra primero la fila y después, best-effort, el
 * objeto de R2. Un objeto suelto en R2 es inalcanzable (servir se resuelve por
 * la fila) y cuesta centavos; el orden inverso mostraría imágenes rotas.
 */
sellerPanel.delete('/inventory/:id/photos/:photoId', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const inventoryId = c.req.param('id')
  const photoId = c.req.param('photoId')
  const db = c.get('db')

  const [row] = await db
    .delete(inventoryPhotos)
    .where(
      and(
        eq(inventoryPhotos.id, photoId),
        eq(inventoryPhotos.inventoryId, inventoryId),
        eq(inventoryPhotos.sellerId, seller.id),
      ),
    )
    .returning()

  // Ajeno, de otro listing, o ya borrada: las tres se ven igual desde afuera.
  if (!row) return c.json({ error: 'not_found' }, 404)

  await c.env.ASSETS.delete(row.r2Key).catch((err) => {
    console.error('seller-panel: R2 delete falló (huérfano tolerado)', row.r2Key, err)
  })

  return c.json({ ok: true })
})

/**
 * POST /seller/inventory/:id/photos/reorder — persiste un orden completo.
 *
 * El set de ids enviado debe coincidir EXACTO con las fotos actuales del
 * listing (mismo tamaño, mismos ids) — un set parcial o con ids ajenos se
 * rechaza en vez de aplicarse a medias. Cada UPDATE va filtrado por
 * `inventoryId` de forma independiente, así que aunque no hay una transacción
 * multi-fila, un id no puede reasignarse al orden de otro listing.
 */
sellerPanel.post('/inventory/:id/photos/reorder', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const inventoryId = c.req.param('id')
  const db = c.get('db')

  const parsed = reorderPhotosSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', issues: parsed.error.issues }, 400)
  }

  const item = await db
    .select({ id: inventory.id })
    .from(inventory)
    .where(and(eq(inventory.id, inventoryId), eq(inventory.sellerId, seller.id)))
    .get()
  if (!item) return c.json({ error: 'not_found' }, 404)

  const existing = await db
    .select({ id: inventoryPhotos.id })
    .from(inventoryPhotos)
    .where(eq(inventoryPhotos.inventoryId, inventoryId))
    .all()

  const existingIds = new Set(existing.map((p) => p.id))
  const submittedIds = new Set(parsed.data.order)
  const isExactMatch =
    existingIds.size === submittedIds.size && [...existingIds].every((id) => submittedIds.has(id))
  if (!isExactMatch) {
    return c.json({ error: 'photo_set_mismatch' }, 400)
  }

  await Promise.all(
    parsed.data.order.map((photoId, index) =>
      db
        .update(inventoryPhotos)
        .set({ sortOrder: index, updatedAt: sql`(unixepoch())` })
        .where(and(eq(inventoryPhotos.id, photoId), eq(inventoryPhotos.inventoryId, inventoryId))),
    ),
  )

  const rows = await db
    .select()
    .from(inventoryPhotos)
    .where(eq(inventoryPhotos.inventoryId, inventoryId))
    .orderBy(inventoryPhotos.sortOrder)
    .all()

  const origin = new URL(c.req.url).origin
  return c.json({ photos: rows.map((r) => rowToInventoryPhoto(r, origin)) })
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
  // Tiendas de recolección: puede ser esta misma tienda o una aliada, así que
  // se resuelven aparte en vez de asumir que es siempre el seller de la sesión.
  const pickupIds = [
    ...new Set(orderRows.map((o) => o.pickupSellerId).filter((x): x is string => !!x)),
  ]
  const [itemRows, buyerRows, pickupRows] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)).all(),
    db.select().from(users).where(inArray(users.id, buyerIds)).all(),
    pickupIds.length > 0
      ? db.select().from(sellers).where(inArray(sellers.id, pickupIds)).all()
      : Promise.resolve([]),
  ])

  const itemsByOrder = new Map<string, typeof itemRows>()
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? []
    list.push(item)
    itemsByOrder.set(item.orderId, list)
  }
  const buyerById = new Map(buyerRows.map((u) => [u.id, u]))
  const pickupById = new Map(pickupRows.map((s) => [s.id, s]))

  return c.json({
    items: orderRows.map((o) =>
      orderToSellerOrder(
        o,
        itemsByOrder.get(o.id) ?? [],
        buyerById.get(o.buyerUserId),
        o.pickupSellerId ? pickupById.get(o.pickupSellerId) : undefined,
      ),
    ),
  })
})

/**
 * Cumplimiento de órdenes (TASK-020). Cada método tiene su propia secuencia y
 * las cuatro transiciones son excluyentes entre sí:
 *
 *   envío       paid --/ship--> enviada --/deliver--> entregada
 *   recolección paid --/ready--> lista   --/collect--> recogida
 *
 * Todas las guardas viven en el WHERE del UPDATE: si la orden no está en el
 * estado que la transición requiere, no se actualiza ninguna fila y se responde
 * 409 en vez de fingir éxito. Eso cubre también el cruce de métodos (marcar
 * enviada una recolección) y la propiedad (orden de otra tienda = 409, no 404,
 * porque no se distingue de un estado inválido sin filtrar por dueño primero).
 */

/** POST /seller/orders/:id/ship — enviada con guía. Solo envío a domicilio. */
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
      carrier: parsed.data.carrier ?? null,
      shippedAt: sql`(unixepoch())`,
      updatedAt: sql`(unixepoch())`,
    })
    .where(
      and(
        eq(orders.id, id),
        eq(orders.sellerId, seller.id),
        eq(orders.status, 'paid'),
        shippingOrLegacy,
        isNull(orders.shippedAt),
      ),
    )
    .returning()

  if (!row) return c.json({ error: 'not_shippable' }, 409)
  return c.json(orderToSellerOrder(row, [], undefined))
})

/** POST /seller/orders/:id/deliver — entregada por paquetería (cierra en 'fulfilled'). */
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
        shippingOrLegacy,
        sql`${orders.shippedAt} IS NOT NULL`,
        isNull(orders.deliveredAt),
      ),
    )
    .returning()

  if (!row) return c.json({ error: 'not_deliverable' }, 409)
  return c.json(orderToSellerOrder(row, [], undefined))
})

/**
 * POST /seller/orders/:id/ready — lista para recoger. Solo recolección.
 *
 * Es el evento que el comprador está esperando: a partir de aquí puede ir a la
 * tienda. Marcarla NO cierra la orden; eso lo hace `/collect` cuando el
 * comprador se la lleva.
 */
sellerPanel.post('/orders/:id/ready', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const id = c.req.param('id')
  const db = c.get('db')

  const [row] = await db
    .update(orders)
    .set({ readyAt: sql`(unixepoch())`, updatedAt: sql`(unixepoch())` })
    .where(
      and(
        eq(orders.id, id),
        eq(orders.sellerId, seller.id),
        eq(orders.status, 'paid'),
        isPickup,
        isNull(orders.readyAt),
      ),
    )
    .returning()

  if (!row) return c.json({ error: 'not_pickup_ready' }, 409)
  return c.json(orderToSellerOrder(row, [], undefined, await pickupStoreOf(db, row.pickupSellerId)))
})

/** POST /seller/orders/:id/collect — recogida en mostrador (cierra en 'fulfilled'). */
sellerPanel.post('/orders/:id/collect', async (c) => {
  const seller = c.get('seller')
  if (!seller) return c.json({ error: 'not_a_seller' }, 403)
  const id = c.req.param('id')
  const db = c.get('db')

  const [row] = await db
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
        isPickup,
        sql`${orders.readyAt} IS NOT NULL`,
        isNull(orders.deliveredAt),
      ),
    )
    .returning()

  if (!row) return c.json({ error: 'not_collectable' }, 409)
  return c.json(orderToSellerOrder(row, [], undefined, await pickupStoreOf(db, row.pickupSellerId)))
})

/**
 * GET /seller/catalog/search?game=&q= — búsqueda en el catálogo del juego
 * (cache KV). `game` omitido = 'mtg', por los clientes previos al multi-juego.
 */
sellerPanel.get('/catalog/search', async (c) => {
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
    return c.json({ results: await provider.searchCards(parsed.data.q, c.env.SESSIONS) })
  } catch (err) {
    if (err instanceof CatalogError) {
      return c.json({ error: 'catalog_error', tcg: parsed.data.game, status: err.status }, 502)
    }
    throw err
  }
})
