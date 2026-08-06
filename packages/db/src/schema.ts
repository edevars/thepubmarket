/**
 * Esquema de datos de The Pub Market — fuente ÚNICA de verdad del modelo.
 * Definido con Drizzle (sqlite-core, dialecto de D1) y compartido entre workers.
 *
 * Reglas transversales (heredadas del diseño original):
 *   * Dinero SIEMPRE en enteros: centavos MXN. NUNCA floats. Columnas `*_cents`.
 *   * Moneda explícita en `currency` (default 'MXN') para futuras divisas.
 *   * IDs TEXT (UUID generado en la app con crypto.randomUUID).
 *   * Timestamps INTEGER unix segundos vía unixepoch().
 *
 * NO CUSTODIA DE FONDOS: una orden = UN seller (destination/direct charge de
 * Stripe Connect con application fee). No hay balance de plataforma ni columnas
 * de transfer. Ver `sellers.stripeConnectAccountId`, `orders.sellerId` y
 * `orders.platformFeeCents`.
 */

import type { SellerHours, Tcg } from '@thepubmarket/shared'
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/** Columnas de timestamp comunes (created_at / updated_at, unix segundos). */
const timestamps = {
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}

// =====================================================================
// users — compradores y administradores. Los sellers NO se auto-registran.
// =====================================================================
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    // Nullable: NULL means a legacy magic-link account with no password set
    // yet. Login detects this and routes the user through password reset.
    passwordHash: text('password_hash'),
    role: text('role', { enum: ['buyer', 'admin'] })
      .notNull()
      .default('buyer'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_users_email').on(t.email),
    check('users_role_check', sql`${t.role} IN ('buyer', 'admin')`),
  ],
)

// =====================================================================
// sellers — vendedores vetted (por invitación). The Pub Game Store es el ancla.
// Cada seller es una Stripe Connect account propia.
//
// INVARIANTE (modelo vetted, CLAUDE.md): las filas de esta tabla SOLO se crean
// por vía administrativa (seed o admin con `x-admin-key`). NINGUNA ruta pública
// inserta aquí, y `user_id` —lo que convierte a un usuario en vendedor— solo lo
// escribe `POST /admin/sellers/:id/link`. No hay auto-registro de sellers.
// Ver docs/ingenieria/invitacion-sellers.md.
// =====================================================================
export const sellers = sqliteTable(
  'sellers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status', { enum: ['invited', 'active', 'suspended'] })
      .notNull()
      .default('invited'),
    stripeConnectAccountId: text('stripe_connect_account_id'),
    // --- Perfil público de escaparate (solo vitrina; nada de pagos) ---
    // Columnas nullable a propósito: el alta mínima de un seller no las exige y
    // así la migración es puro ALTER TABLE ADD COLUMN (D1-friendly).
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    monogram: text('monogram'),
    city: text('city'),
    neighborhood: text('neighborhood'),
    memberSince: integer('member_since'),
    blurb: text('blurb'),
    favoriteGames: text('favorite_games', { mode: 'json' }).$type<Tcg[]>(),
    yearsInHobby: integer('years_in_hobby'),
    funFact: text('fun_fact'),
    address: text('address'),
    hours: text('hours', { mode: 'json' }).$type<SellerHours[]>(),
    whatsapp: text('whatsapp'),
    instagram: text('instagram'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_sellers_slug').on(t.slug),
    uniqueIndex('idx_sellers_stripe_connect_account_id').on(t.stripeConnectAccountId),
    // Resolución sesión→seller del panel (sellerAuth busca por user_id).
    index('idx_sellers_user_id').on(t.userId),
    check('sellers_status_check', sql`${t.status} IN ('invited', 'active', 'suspended')`),
  ],
)

// =====================================================================
// seller_invitations — bitácora APPEND-ONLY de invitaciones de vendedores.
// Cada `POST /admin/sellers/:id/link` escribe una fila: quién invitó, a qué
// email, a qué seller y cuándo. Nunca se actualiza ni se borra; re-vincular un
// seller a otro email agrega una fila más, así el historial queda íntegro.
//
// `invited_by` es la identidad declarada por el operador en `x-admin-actor`.
// Con clave compartida la atribución es POR CONVENCIÓN, no criptográfica: la
// clave no identifica a la persona. Ver docs/ingenieria/invitacion-sellers.md.
// =====================================================================
export const sellerInvitations = sqliteTable(
  'seller_invitations',
  {
    id: text('id').primaryKey(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    // Email invitado, normalizado a minúsculas (igual que en `users.email`).
    email: text('email').notNull(),
    // Usuario resuelto o creado al vincular. `set null` para no perder la fila
    // de bitácora si el usuario se borra.
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    invitedBy: text('invited_by').notNull(),
    ip: text('ip'),
    note: text('note'),
    createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    index('idx_seller_invitations_seller_id').on(t.sellerId),
    index('idx_seller_invitations_email').on(t.email),
  ],
)

// =====================================================================
// inventory — un single físico a la venta, ligado a una impresión de Scryfall.
// Guarda un snapshot de los datos canónicos de la carta para renderizar sin
// llamar a Scryfall en cada request. `condition` se valida con zod en la app.
// =====================================================================
export const inventory = sqliteTable(
  'inventory',
  {
    id: text('id').primaryKey(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    tcg: text('tcg').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    condition: text('condition'),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('MXN'),
    quantity: integer('quantity').notNull().default(0),
    status: text('status', { enum: ['active', 'inactive'] })
      .notNull()
      .default('active'),
    // Snapshot del catálogo de origen. `catalog_id` es el id de la impresión
    // en el catálogo de su juego (Scryfall para MTG, RiftCodex para Riftbound).
    // `scryfall_id`/`oracle_id` son legacy MTG: se siguen escribiendo para MTG
    // y las filas previas a catalog_id solo tienen scryfall_id.
    catalogId: text('catalog_id'),
    scryfallId: text('scryfall_id'),
    oracleId: text('oracle_id'),
    setCode: text('set_code'),
    setName: text('set_name'),
    collectorNumber: text('collector_number'),
    cardLang: text('card_lang'),
    rarity: text('rarity'),
    artist: text('artist'),
    // Atributos propios del juego (dominios, tipo, costes…) como blob JSON
    // pequeño: son de presentación y nada filtra ni ordena por ellos. Una
    // columna por atributo y por juego convertiría esta tabla en un mega-set
    // de nulos. Si algún día hay que filtrar por uno, se promueve a columna.
    cardAttributes: text('card_attributes'),
    finish: text('finish', { enum: ['nonfoil', 'foil'] })
      .notNull()
      .default('nonfoil'),
    // TODO: migrar imágenes a R2; por ahora referencia la URL de Scryfall.
    imageUrl: text('image_url'),
    ...timestamps,
  },
  (t) => [
    index('idx_inventory_seller_id').on(t.sellerId),
    index('idx_inventory_catalog_id').on(t.catalogId),
    index('idx_inventory_scryfall_id').on(t.scryfallId),
    index('idx_inventory_status').on(t.status),
    index('idx_inventory_set_code').on(t.setCode),
    index('idx_inventory_title_nocase').on(sql`${t.title} COLLATE NOCASE`),
    check('inventory_price_cents_check', sql`${t.priceCents} >= 0`),
    check('inventory_quantity_check', sql`${t.quantity} >= 0`),
    check('inventory_status_check', sql`${t.status} IN ('active', 'inactive')`),
    check('inventory_finish_check', sql`${t.finish} IN ('nonfoil', 'foil')`),
  ],
)

// =====================================================================
// inventory_photos — fotos REALES del ejemplar físico que sube el vendedor,
// complementarias a la imagen canónica de Scryfall (`inventory.image_url`).
// En singles la condición manda sobre el precio, así que esto es confianza,
// no decoración: el comprador juzga rayones, whitening, centrado y curvatura
// del foil antes de pagar.
//
// Tabla propia y NO una columna JSON en `inventory`: da integridad referencial
// (CASCADE), permite borrar/reordenar sin read-modify-write con carreras, y es
// puro CREATE TABLE (D1-friendly). En este esquema el JSON queda reservado para
// blobs pequeños de configuración, nunca para listas de entidades.
//
// `seller_id` está desnormalizado a propósito: la verificación de propiedad en
// el panel es un WHERE directo, sin join contra `inventory` (mismo patrón que
// apps/api/src/routes/seller-panel.ts).
//
// Aquí SOLO vive la metadata; el binario está en R2 bajo `r2_key`. POLÍTICA DE
// HUÉRFANOS: se borra primero la fila y después el objeto de R2 en best-effort.
// Un objeto suelto en R2 es inalcanzable (servir una foto se resuelve por la
// fila) y cuesta centavos; el orden inverso mostraría imágenes rotas. Sin cron
// de reconciliación en v1.
//
// El tope de 6 fotos por publicación se aplica en la app, no en el esquema.
// =====================================================================
export const inventoryPhotos = sqliteTable(
  'inventory_photos',
  {
    id: text('id').primaryKey(),
    inventoryId: text('inventory_id')
      .notNull()
      .references(() => inventory.id, { onDelete: 'cascade' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'cascade' }),
    /** Llave del objeto en R2. Única: dos filas nunca apuntan al mismo binario. */
    r2Key: text('r2_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** Orden de la galería, 0-based. Lo reasigna el vendedor al reordenar. */
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_inventory_photos_r2_key').on(t.r2Key),
    index('idx_inventory_photos_inventory_id').on(t.inventoryId),
    check('inventory_photos_size_bytes_check', sql`${t.sizeBytes} > 0`),
    check('inventory_photos_sort_order_check', sql`${t.sortOrder} >= 0`),
  ],
)

// =====================================================================
// orders — una orden referencia EXACTAMENTE UN seller (Stripe Connect).
// =====================================================================
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    buyerUserId: text('buyer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => sellers.id, { onDelete: 'restrict' }),
    status: text('status', {
      enum: ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'],
    })
      .notNull()
      .default('pending'),
    subtotalCents: integer('subtotal_cents').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('MXN'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    // --- Entrega: cómo llega la orden al comprador (TASK-019) ---
    // Se elige ANTES de pagar y queda fijada: el comprador ya pagó (o no) el
    // envío que corresponde, así que el vendedor no puede cambiar el método.
    //
    // `delivery_method` es NULLABLE por retrocompatibilidad: hay órdenes en
    // producción anteriores a esta columna y deben seguir leyéndose. Su valor
    // se valida con zod en la app, NO con un CHECK: agregar constraints a
    // `orders` obligaría a recrear la tabla, y D1 rechaza ese patrón (mismo
    // motivo por el que el enum de `status` no se amplía).
    deliveryMethod: text('delivery_method', { enum: ['shipping', 'pickup'] }),
    // Cobrado al comprador y liquidado al seller dentro del MISMO direct charge.
    // La plataforma no lo toca: la comisión se calcula solo sobre el subtotal
    // de producto, nunca sobre el envío. Ver CLAUDE.md (no custodia).
    shippingCents: integer('shipping_cents').notNull().default(0),
    // Dirección de entrega — solo cuando delivery_method = 'shipping'.
    shippingRecipient: text('shipping_recipient'),
    shippingPhone: text('shipping_phone'),
    shippingLine1: text('shipping_line1'),
    shippingLine2: text('shipping_line2'),
    shippingNeighborhood: text('shipping_neighborhood'),
    shippingCity: text('shipping_city'),
    shippingState: text('shipping_state'),
    shippingPostalCode: text('shipping_postal_code'),
    shippingCountry: text('shipping_country'),
    // Tienda aliada donde se recoge — solo cuando delivery_method = 'pickup'.
    // `set null` para no perder la orden si la tienda se da de baja; la vista
    // degrada a "tienda no disponible" en vez de romper.
    pickupSellerId: text('pickup_seller_id').references(() => sellers.id, { onDelete: 'set null' }),
    // --- Cumplimiento (lo gestiona el seller desde su panel; no toca pagos) ---
    // El estado de UI se DERIVA de estos timestamps; el enum de `status` NO se
    // amplía a propósito: cambiar su CHECK obligaría a recrear la tabla, patrón
    // que D1 rechaza.
    //
    //   envío:      paid sin shippedAt = por enviar → shippedAt = enviada →
    //               deliveredAt (+ status 'fulfilled') = entregada
    //   recolección: paid sin readyAt = por preparar → readyAt = lista para
    //               recoger → deliveredAt (+ 'fulfilled') = recogida
    //
    // `ready_at` es columna propia y no un `shipped_at` reutilizado: una orden
    // de recolección nunca se envía, y mezclarlas haría que cualquier consulta
    // de "qué mandamos por paquetería" contara recolecciones (TASK-020).
    trackingNumber: text('tracking_number'),
    /** Paquetería. Texto libre y opcional: sin ella la guía no se puede rastrear. */
    carrier: text('carrier'),
    shippedAt: integer('shipped_at'),
    readyAt: integer('ready_at'),
    deliveredAt: integer('delivered_at'),
    ...timestamps,
  },
  (t) => [
    index('idx_orders_buyer_user_id').on(t.buyerUserId),
    index('idx_orders_seller_id').on(t.sellerId),
    uniqueIndex('idx_orders_stripe_payment_intent_id').on(t.stripePaymentIntentId),
    check(
      'orders_status_check',
      sql`${t.status} IN ('pending', 'paid', 'fulfilled', 'cancelled', 'refunded')`,
    ),
    check('orders_subtotal_cents_check', sql`${t.subtotalCents} >= 0`),
    check('orders_platform_fee_cents_check', sql`${t.platformFeeCents} >= 0`),
    check('orders_total_cents_check', sql`${t.totalCents} >= 0`),
  ],
)

// =====================================================================
// order_items — líneas de una orden, con snapshots de título y precio.
// =====================================================================
export const orderItems = sqliteTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    inventoryId: text('inventory_id').references(() => inventory.id, { onDelete: 'set null' }),
    titleSnapshot: text('title_snapshot').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
  },
  (t) => [
    index('idx_order_items_order_id').on(t.orderId),
    index('idx_order_items_inventory_id').on(t.inventoryId),
    check('order_items_unit_price_cents_check', sql`${t.unitPriceCents} >= 0`),
    check('order_items_quantity_check', sql`${t.quantity} > 0`),
    check('order_items_line_total_cents_check', sql`${t.lineTotalCents} >= 0`),
  ],
)

// =====================================================================
// webhook_events — ledger de PROCESAMIENTO de webhooks de Stripe (TASK-022).
// La PK es el id del evento (`evt_…`). No es solo dedupe: un conflicto de PK
// distingue entre evento ya `processed` (se descarta) y evento `received` cuyo
// trabajo nunca terminó (se re-ejecuta en el redelivery de Stripe). Un evento
// que falla queda en `received` con `last_error` — esa es la dead-letter queue.
// =====================================================================
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  // 'received' | 'processed'. Sin CHECK: mismo criterio que delivery_method
  // (D1 rechaza recrear tablas); se valida en la app.
  status: text('status').notNull().default('received'),
  processedAt: integer('processed_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
})

// =====================================================================
// catalog_cards — catálogo canónico de cartas por juego, importado en bloque
// (TASK-036: Riftbound desde la API de dotgg). Es la contraparte LOCAL de los
// providers externos (Scryfall): una fila por impresión, espejo de
// `CardSnapshot` más textos de reglas y las llaves de imagen en R2.
//
// PK natural compuesta (tcg, catalog_id): es el target del upsert del importer
// y no hay un id propio que generar — deviación deliberada de la convención
// UUID. Sin check(): D1 rechaza recrear tablas, así que la evolución del
// esquema queda en puro ALTER TABLE ADD COLUMN y cualquier columna nueva se
// rellena gratis re-corriendo el importer (idempotente).
// =====================================================================
export const catalogCards = sqliteTable(
  'catalog_cards',
  {
    tcg: text('tcg').notNull(),
    /** Id de la impresión en su catálogo de origen ("UNL-131" en Riftbound). */
    catalogId: text('catalog_id').notNull(),
    // Concepto de Scryfall (la carta lógica de MTG); null en otros juegos.
    oracleId: text('oracle_id'),
    name: text('name').notNull(),
    setCode: text('set_code').notNull(),
    setName: text('set_name').notNull(),
    collectorNumber: text('collector_number').notNull(),
    lang: text('lang').notNull().default('en'),
    // En minúsculas, convención de los snapshots de Scryfall ('rare').
    rarity: text('rarity').notNull().default(''),
    artist: text('artist'),
    finishes: text('finishes', { mode: 'json' }).$type<string[]>(),
    // Texto de reglas ya limpio (sin HTML). Los tokens de icono estilo
    // `:rb_might:` se conservan verbatim: son data estructurada que el
    // frontend puede renderizar; quitarlos sería irreversible.
    rulesText: text('rules_text'),
    flavorText: text('flavor_text'),
    // Mismo criterio que inventory.cardAttributes: JSON de presentación.
    gameAttributes: text('game_attributes'),
    // Snapshot de precios de mercado (TCGplayer USD / Cardmarket EUR) tal cual
    // los reporta la fuente. Es REFERENCIA, nunca precio de venta: los sellers
    // fijan sus precios en MXN. Se refresca en cada corrida del importer;
    // `price_fetched_at` dice qué tan viejo es.
    priceData: text('price_data'),
    priceFetchedAt: integer('price_fetched_at'),
    // Procedencia de la imagen (static.dotgg.gg). Se conserva como fallback y
    // para re-descargar si el objeto de R2 faltara.
    sourceImageUrl: text('source_image_url'),
    sourceImageBackUrl: text('source_image_back_url'),
    // NULL = imagen aún no espejada en R2 (pendiente o fallida). El importer
    // re-intenta exactamente las filas con NULL en la siguiente corrida.
    imageR2Key: text('image_r2_key'),
    imageBackR2Key: text('image_back_r2_key'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.tcg, t.catalogId] }),
    // Búsqueda por nombre del provider local (LIKE, mismo patrón que
    // idx_inventory_title_nocase).
    index('idx_catalog_cards_name_nocase').on(sql`${t.name} COLLATE NOCASE`),
    index('idx_catalog_cards_set_code').on(t.setCode),
  ],
)

/** Todas las tablas, para pasarle el schema al cliente Drizzle. */
export const schema = {
  users,
  sellers,
  sellerInvitations,
  inventory,
  inventoryPhotos,
  orders,
  orderItems,
  webhookEvents,
  catalogCards,
}
