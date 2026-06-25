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

import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
    ...timestamps,
  },
  (t) => [
    uniqueIndex('idx_sellers_slug').on(t.slug),
    uniqueIndex('idx_sellers_stripe_connect_account_id').on(t.stripeConnectAccountId),
    check('sellers_status_check', sql`${t.status} IN ('invited', 'active', 'suspended')`),
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
    // Snapshot de Scryfall.
    scryfallId: text('scryfall_id'),
    oracleId: text('oracle_id'),
    setCode: text('set_code'),
    setName: text('set_name'),
    collectorNumber: text('collector_number'),
    cardLang: text('card_lang'),
    rarity: text('rarity'),
    artist: text('artist'),
    finish: text('finish', { enum: ['nonfoil', 'foil'] })
      .notNull()
      .default('nonfoil'),
    // TODO: migrar imágenes a R2; por ahora referencia la URL de Scryfall.
    imageUrl: text('image_url'),
    ...timestamps,
  },
  (t) => [
    index('idx_inventory_seller_id').on(t.sellerId),
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

/** Todas las tablas, para pasarle el schema al cliente Drizzle. */
export const schema = { users, sellers, inventory, orders, orderItems }
