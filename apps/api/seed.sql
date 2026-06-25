-- Seed — datos base de The Pub Market.
--
-- NO es una migración de schema: son datos. Se aplica con `wrangler d1 execute`
-- (db:seed:local / db:seed:remote), separado del flujo de migraciones de Drizzle,
-- para que nunca corra como parte del versionado de esquema.
--
-- Idempotente (INSERT OR IGNORE): re-ejecutar no duplica ni falla.

-- Seller ancla: The Pub Game Store (espejo de ANCHOR_SELLER_ID en @thepubmarket/shared).
-- status 'active' porque ya opera. user_id NULL: el admin se asocia después.
-- stripe_connect_account_id NULL: los pagos (Stripe Connect, sin custodia) son de Fase 2.
INSERT OR IGNORE INTO sellers (id, user_id, name, slug, status)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  NULL,
  'The Pub Game Store',
  'the-pub-game-store',
  'active'
);
