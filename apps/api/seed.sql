-- Seed — datos base de The Pub Market.
--
-- NO es una migración de schema: son datos. Se aplica con `wrangler d1 execute`
-- (db:seed:local / db:seed:remote), separado del flujo de migraciones de Drizzle,
-- para que nunca corra como parte del versionado de esquema.
--
-- Idempotente (INSERT ... ON CONFLICT DO UPDATE): re-ejecutar no duplica ni falla,
-- y puebla las columnas de perfil aunque la fila ya exista (p.ej. el ancla en la
-- D1 desplegada antes de la migración 0003).
--
-- IMPORTANTE: el DO UPDATE nunca toca `user_id` ni `stripe_connect_account_id` —
-- pueden tener valores reales en producción (pagos / asociación de cuenta).
--
-- Reparto de inventario: `scripts/load-inventory.mjs` NO es idempotente y asigna
-- todo al ancla; tras recargar inventario hay que re-correr db:seed:* para que
-- los UPDATE por título redistribuyan las cartas entre tiendas.

-- =====================================================================
-- Sellers (vetted, por invitación). El ancla espeja ANCHOR_SELLER_ID de
-- @thepubmarket/shared. status 'active' porque ya operan.
-- =====================================================================

INSERT INTO sellers (
  id, user_id, name, slug, status, verified, monogram, city, neighborhood,
  member_since, blurb, favorite_games, years_in_hobby, fun_fact,
  address, hours, whatsapp, instagram
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  NULL,
  'The Pub Game Store', 'the-pub-game-store', 'active',
  1, 'PG', 'CDMX', 'Condesa', 2019,
  'La tienda ancla de The Pub Market: restaurante casual, mesas llenas de jugadores y el catálogo curado con el que arrancó todo. Singles de Magic con condición verificada.',
  '["mtg","pokemon","lorcana"]', 12,
  'El primer torneo de la casa fue un Friday Night Magic con 8 jugadores; hoy llenan el local cada semana.',
  'Av. Michoacán 78, Hipódromo Condesa, CDMX',
  '[{"key":"weekday","open":"12:00","close":"21:00"},{"key":"friSat","open":"12:00","close":"23:00"},{"key":"sunday","open":"13:00","close":"20:00"},{"key":"holidays","open":null,"close":null}]',
  '525555123456', 'thepubgamestore'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, slug = excluded.slug, status = excluded.status,
  verified = excluded.verified, monogram = excluded.monogram,
  city = excluded.city, neighborhood = excluded.neighborhood,
  member_since = excluded.member_since, blurb = excluded.blurb,
  favorite_games = excluded.favorite_games, years_in_hobby = excluded.years_in_hobby,
  fun_fact = excluded.fun_fact, address = excluded.address, hours = excluded.hours,
  whatsapp = excluded.whatsapp, instagram = excluded.instagram,
  updated_at = unixepoch();

INSERT INTO sellers (
  id, user_id, name, slug, status, verified, monogram, city, neighborhood,
  member_since, blurb, favorite_games, years_in_hobby, fun_fact,
  address, hours, whatsapp, instagram
) VALUES (
  '00000000-0000-4000-8000-0000000000a2',
  NULL,
  'Bahamut Cards', 'bahamut-cards', 'active',
  1, 'BC', 'CDMX', 'Roma Norte', 2023,
  'Singles competitivos de One Piece, Magic y Lorcana. Curaduría estricta, condición honesta y atención de jugador a jugador.',
  '["onepiece","mtg","lorcana"]', 14,
  'Su primera carta fue un Blue-Eyes White Dragon de 1999 que todavía conserva enmarcado sobre el mostrador.',
  'Calle Colima 210, Roma Norte, CDMX',
  '[{"key":"weekday","open":"12:00","close":"21:00"},{"key":"friSat","open":"12:00","close":"23:00"},{"key":"sunday","open":"13:00","close":"20:00"},{"key":"holidays","open":null,"close":null}]',
  '525533221100', 'bahamutcards'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, slug = excluded.slug, status = excluded.status,
  verified = excluded.verified, monogram = excluded.monogram,
  city = excluded.city, neighborhood = excluded.neighborhood,
  member_since = excluded.member_since, blurb = excluded.blurb,
  favorite_games = excluded.favorite_games, years_in_hobby = excluded.years_in_hobby,
  fun_fact = excluded.fun_fact, address = excluded.address, hours = excluded.hours,
  whatsapp = excluded.whatsapp, instagram = excluded.instagram,
  updated_at = unixepoch();

INSERT INTO sellers (
  id, user_id, name, slug, status, verified, monogram, city, neighborhood,
  member_since, blurb, favorite_games, years_in_hobby, fun_fact,
  address, hours, whatsapp, instagram
) VALUES (
  '00000000-0000-4000-8000-0000000000a3',
  NULL,
  'Coliseo TCG', 'coliseo-tcg', 'active',
  1, 'CT', 'CDMX', 'Del Valle', 2022,
  'Especialistas en Yu-Gi-Oh! y Pokémon. Cartas de torneo, sleeves impecables y stock que rota rápido.',
  '["yugioh","pokemon"]', 9,
  'Organizan un regional casero cada mes; el premio siempre incluye una carta sorpresa del dueño.',
  'Av. Coyoacán 1435, Del Valle Centro, CDMX',
  '[{"key":"weekday","open":"12:00","close":"21:00"},{"key":"friSat","open":"12:00","close":"23:00"},{"key":"sunday","open":"13:00","close":"20:00"},{"key":"holidays","open":null,"close":null}]',
  '525577889900', 'coliseotcg'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, slug = excluded.slug, status = excluded.status,
  verified = excluded.verified, monogram = excluded.monogram,
  city = excluded.city, neighborhood = excluded.neighborhood,
  member_since = excluded.member_since, blurb = excluded.blurb,
  favorite_games = excluded.favorite_games, years_in_hobby = excluded.years_in_hobby,
  fun_fact = excluded.fun_fact, address = excluded.address, hours = excluded.hours,
  whatsapp = excluded.whatsapp, instagram = excluded.instagram,
  updated_at = unixepoch();

INSERT INTO sellers (
  id, user_id, name, slug, status, verified, monogram, city, neighborhood,
  member_since, blurb, favorite_games, years_in_hobby, fun_fact,
  address, hours, whatsapp, instagram
) VALUES (
  '00000000-0000-4000-8000-0000000000a4',
  NULL,
  'Eldrazi Corner', 'eldrazi-corner', 'active',
  1, 'EC', 'CDMX', 'Coyoacán', 2024,
  'El rincón de Commander y singles de colección. Foils, cartas de reserva y ediciones especiales de Magic.',
  '["mtg"]', 7,
  'Empezó vendiendo cartas desde una mochila en las mesas de The Pub Game Store antes de abrir su propio stand.',
  'Calle Francisco Sosa 55, Villa Coyoacán, CDMX',
  '[{"key":"weekday","open":"12:00","close":"21:00"},{"key":"friSat","open":"12:00","close":"23:00"},{"key":"sunday","open":"13:00","close":"20:00"},{"key":"holidays","open":null,"close":null}]',
  '525544009988', 'eldrazicorner'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, slug = excluded.slug, status = excluded.status,
  verified = excluded.verified, monogram = excluded.monogram,
  city = excluded.city, neighborhood = excluded.neighborhood,
  member_since = excluded.member_since, blurb = excluded.blurb,
  favorite_games = excluded.favorite_games, years_in_hobby = excluded.years_in_hobby,
  fun_fact = excluded.fun_fact, address = excluded.address, hours = excluded.hours,
  whatsapp = excluded.whatsapp, instagram = excluded.instagram,
  updated_at = unixepoch();

INSERT INTO sellers (
  id, user_id, name, slug, status, verified, monogram, city, neighborhood,
  member_since, blurb, favorite_games, years_in_hobby, fun_fact,
  address, hours, whatsapp, instagram
) VALUES (
  '00000000-0000-4000-8000-0000000000a5',
  NULL,
  'Nakama Singles', 'nakama-singles', 'active',
  1, 'NS', 'CDMX', 'Narvarte', 2023,
  'One Piece y Lorcana en su punto. Cartas de líder, alt-arts y todo lo que necesitas para tu mejor mazo.',
  '["onepiece","lorcana","pokemon"]', 6,
  'El nombre viene de nakama (compañero); regalan una carta común a quien trae a un amigo nuevo al hobby.',
  'Av. Cuauhtémoc 640, Narvarte Poniente, CDMX',
  '[{"key":"weekday","open":"12:00","close":"21:00"},{"key":"friSat","open":"12:00","close":"23:00"},{"key":"sunday","open":"13:00","close":"20:00"},{"key":"holidays","open":null,"close":null}]',
  '525566778811', 'nakamasingles'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name, slug = excluded.slug, status = excluded.status,
  verified = excluded.verified, monogram = excluded.monogram,
  city = excluded.city, neighborhood = excluded.neighborhood,
  member_since = excluded.member_since, blurb = excluded.blurb,
  favorite_games = excluded.favorite_games, years_in_hobby = excluded.years_in_hobby,
  fun_fact = excluded.fun_fact, address = excluded.address, hours = excluded.hours,
  whatsapp = excluded.whatsapp, instagram = excluded.instagram,
  updated_at = unixepoch();

-- =====================================================================
-- Vínculo usuario→seller para el Panel del Vendedor (pruebas del dueño).
-- Crea el usuario si no existe (el login por magic link lo encontrará por
-- email) y lo asocia al ancla SOLO si el ancla no tiene dueño ya (nunca pisa
-- un vínculo real). Invitaciones futuras: POST /admin/sellers/:id/link.
-- =====================================================================

INSERT OR IGNORE INTO users (id, email, role)
VALUES ('00000000-0000-4000-8000-00000000e001', 'enrique.devars@gmail.com', 'buyer');

UPDATE sellers
SET user_id = (SELECT id FROM users WHERE email = 'enrique.devars@gmail.com'),
    updated_at = unixepoch()
WHERE id = '00000000-0000-4000-8000-000000000001' AND user_id IS NULL;

-- =====================================================================
-- Reparto de inventario entre tiendas (determinista por título, idempotente).
-- El ancla conserva: Ragavan, Sheoldred, Path to Exile, Teferi, Mother of Runes.
-- =====================================================================

UPDATE inventory SET seller_id = '00000000-0000-4000-8000-0000000000a2'
WHERE title IN ('Counterspell', 'Brainstorm', 'Cyclonic Rift', 'Snapcaster Mage');

UPDATE inventory SET seller_id = '00000000-0000-4000-8000-0000000000a3'
WHERE title IN ('Lightning Bolt', 'Fatal Push', 'Thoughtseize');

UPDATE inventory SET seller_id = '00000000-0000-4000-8000-0000000000a4'
WHERE title IN ('Sol Ring', 'Mana Crypt', 'Demonic Tutor');

UPDATE inventory SET seller_id = '00000000-0000-4000-8000-0000000000a5'
WHERE title IN ('Llanowar Elves', 'Birds of Paradise', 'Swords to Plowshares');
