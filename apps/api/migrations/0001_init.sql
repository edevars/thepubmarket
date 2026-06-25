-- Migration 0001 — Esquema inicial de The Pub Market (Fase 0)
--
-- Reglas transversales:
--   * Dinero SIEMPRE en enteros: centavos MXN. NUNCA floats. Columnas `*_cents`.
--   * Moneda explícita en `currency` (default 'MXN') para soportar futuras divisas.
--   * IDs TEXT (UUID generado en la aplicación con crypto.randomUUID) para evitar
--     enumeración de recursos.
--   * Timestamps INTEGER unix segundos vía unixepoch().
--
-- DECISIÓN CRÍTICA — NO CUSTODIA DE FONDOS:
--   La plataforma NUNCA toca, retiene ni redirige fondos (fuera de IFPE / Ley
--   Fintech). El pago será un destination/direct charge de Stripe Connect a la
--   cuenta conectada del seller, con application fee para la comisión de la
--   plataforma. El dinero va directo comprador -> seller; la plataforma solo
--   cobra su fee. Este esquema NO modela "separate charges & transfers" (que
--   implicaría que el dinero pase por un balance de la plataforma).
--   Ver columnas `sellers.stripe_connect_account_id`, `orders.seller_id` y
--   `orders.platform_fee_cents`.

PRAGMA foreign_keys = ON;

-- =====================================================================
-- users — compradores y administradores.
-- No hay flujo de auto-registro de sellers: los sellers entran por invitación
-- (vetted). Un usuario admin gestiona invitaciones en fases posteriores.
-- =====================================================================
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'buyer'
                  CHECK (role IN ('buyer', 'admin')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_users_email ON users (email);

-- =====================================================================
-- sellers — vendedores vetted (por invitación). The Pub Game Store es el ancla.
-- Cada seller es una Stripe Connect account propia, con su onboarding, payout y
-- obligaciones fiscales. `stripe_connect_account_id` se incluye desde día uno
-- aunque los pagos no se implementen en Fase 0.
-- =====================================================================
CREATE TABLE sellers (
  id                         TEXT PRIMARY KEY,
  -- Usuario que administra al seller (dueño de la cuenta en la plataforma).
  user_id                    TEXT REFERENCES users (id) ON DELETE SET NULL,
  name                       TEXT NOT NULL,
  slug                       TEXT NOT NULL UNIQUE,
  -- Modelo vetted: nace 'invited', pasa a 'active' tras onboarding aprobado.
  status                     TEXT NOT NULL DEFAULT 'invited'
                               CHECK (status IN ('invited', 'active', 'suspended')),
  -- ID de la cuenta conectada de Stripe (acct_...). NULL hasta completar
  -- onboarding. UNIQUE: una Connect account no puede mapear a dos sellers.
  stripe_connect_account_id  TEXT UNIQUE,
  created_at                 INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at                 INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_sellers_slug ON sellers (slug);
CREATE UNIQUE INDEX idx_sellers_stripe_connect_account_id
  ON sellers (stripe_connect_account_id);

-- =====================================================================
-- inventory — listings de cada seller. Esquema genérico en Fase 0 (sin
-- catálogo/Scryfall todavía). Producto inicial: singles de MTG.
-- =====================================================================
CREATE TABLE inventory (
  id           TEXT PRIMARY KEY,
  seller_id    TEXT NOT NULL REFERENCES sellers (id) ON DELETE CASCADE,
  tcg          TEXT NOT NULL,                 -- p.ej. 'mtg', 'pokemon', 'yugioh'
  title        TEXT NOT NULL,                 -- nombre de la carta / producto
  description  TEXT,
  condition    TEXT,                          -- p.ej. 'NM', 'LP', 'sealed'
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),  -- centavos MXN
  currency     TEXT NOT NULL DEFAULT 'MXN',
  quantity     INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'inactive')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_inventory_seller_id ON inventory (seller_id);

-- =====================================================================
-- orders — una orden referencia EXACTAMENTE UN seller.
--
-- Por qué un solo seller por orden: cada pago es un destination/direct charge a
-- la Connect account de ESE seller con application fee. Un carrito con items de
-- varios sellers se divide en varias órdenes (una por seller), de modo que cada
-- cobro va directo al seller correspondiente y la plataforma nunca custodia
-- fondos. `platform_fee_cents` documenta la comisión, cobrada SOLO vía
-- application fee. `stripe_payment_intent_id` se llena en la fase de pagos.
-- =====================================================================
CREATE TABLE orders (
  id                       TEXT PRIMARY KEY,
  buyer_user_id            TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  seller_id                TEXT NOT NULL REFERENCES sellers (id) ON DELETE RESTRICT,
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN (
                               'pending', 'paid', 'fulfilled', 'cancelled', 'refunded'
                             )),
  subtotal_cents           INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  platform_fee_cents       INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  total_cents              INTEGER NOT NULL CHECK (total_cents >= 0),
  currency                 TEXT NOT NULL DEFAULT 'MXN',
  -- Stripe PaymentIntent (pi_...). NULL hasta iniciar el cobro. No hay campos de
  -- transfer/payout: el dinero no pasa por la plataforma.
  stripe_payment_intent_id TEXT UNIQUE,
  created_at               INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at               INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_orders_buyer_user_id ON orders (buyer_user_id);
CREATE INDEX idx_orders_seller_id ON orders (seller_id);

-- =====================================================================
-- order_items — líneas de una orden. Se guardan snapshots de título y precio
-- al momento de la compra para que cambios posteriores en inventory no alteren
-- el histórico de la orden.
-- =====================================================================
CREATE TABLE order_items (
  id               TEXT PRIMARY KEY,
  order_id         TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  -- Referencia al listing; SET NULL si el listing se borra (el snapshot persiste).
  inventory_id     TEXT REFERENCES inventory (id) ON DELETE SET NULL,
  title_snapshot   TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),  -- centavos MXN
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);

CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_order_items_inventory_id ON order_items (inventory_id);
