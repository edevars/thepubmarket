/**
 * Tiendas mock (Fase 2 — shell visual del hub de vendedor). Tipadas contra
 * `SellerSeed` para que el cableado a la tabla real `sellers` (D1) sea un cambio
 * de FUENTE de datos, no de tipos.
 *
 * Incluye a The Pub Game Store con el `ANCHOR_SELLER_ID` real del contrato; el
 * resto son vendedores inventados por invitación (modelo vetado, no auto-registro).
 */
import { ANCHOR_SELLER_ID } from '@thepubmarket/shared'
import type { SellerSeed } from './types'

/** Horario típico de tienda física en CDMX, reutilizado por varias tiendas. */
const STANDARD_HOURS: SellerSeed['hours'] = [
  { key: 'weekday', open: '12:00', close: '21:00' },
  { key: 'friSat', open: '12:00', close: '23:00' },
  { key: 'sunday', open: '13:00', close: '20:00' },
  { key: 'holidays', open: null, close: null },
]

export const MOCK_SELLERS: SellerSeed[] = [
  {
    id: ANCHOR_SELLER_ID,
    name: 'The Pub Game Store',
    slug: 'the-pub-game-store',
    status: 'active',
    verified: true,
    monogram: 'PG',
    city: 'CDMX',
    neighborhood: 'Condesa',
    memberSince: 2019,
    blurb:
      'La tienda ancla de The Pub Market: restaurante casual, mesas llenas de jugadores y el catálogo curado con el que arrancó todo. Singles de Magic con condición verificada.',
    favoriteGames: ['mtg', 'pokemon', 'lorcana'],
    yearsInHobby: 12,
    funFact:
      'El primer torneo de la casa fue un Friday Night Magic con 8 jugadores; hoy llenan el local cada semana.',
    address: 'Av. Michoacán 78, Hipódromo Condesa, CDMX',
    hours: STANDARD_HOURS,
    whatsapp: '525555123456',
    instagram: 'thepubgamestore',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    name: 'Bahamut Cards',
    slug: 'bahamut-cards',
    status: 'active',
    verified: true,
    monogram: 'BC',
    city: 'CDMX',
    neighborhood: 'Roma Norte',
    memberSince: 2023,
    blurb:
      'Singles competitivos de One Piece, Magic y Lorcana. Curaduría estricta, condición honesta y atención de jugador a jugador.',
    favoriteGames: ['onepiece', 'mtg', 'lorcana'],
    yearsInHobby: 14,
    funFact:
      'Su primera carta fue un Blue-Eyes White Dragon de 1999 que todavía conserva enmarcado sobre el mostrador.',
    address: 'Calle Colima 210, Roma Norte, CDMX',
    hours: STANDARD_HOURS,
    whatsapp: '525533221100',
    instagram: 'bahamutcards',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a3',
    name: 'Coliseo TCG',
    slug: 'coliseo-tcg',
    status: 'active',
    verified: true,
    monogram: 'CT',
    city: 'CDMX',
    neighborhood: 'Del Valle',
    memberSince: 2022,
    blurb:
      'Especialistas en Yu-Gi-Oh! y Pokémon. Cartas de torneo, sleeves impecables y stock que rota rápido.',
    favoriteGames: ['yugioh', 'pokemon'],
    yearsInHobby: 9,
    funFact:
      'Organizan un regional casero cada mes; el premio siempre incluye una carta sorpresa del dueño.',
    address: 'Av. Coyoacán 1435, Del Valle Centro, CDMX',
    hours: STANDARD_HOURS,
    whatsapp: '525577889900',
    instagram: 'coliseotcg',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a4',
    name: 'Eldrazi Corner',
    slug: 'eldrazi-corner',
    status: 'active',
    verified: true,
    monogram: 'EC',
    city: 'CDMX',
    neighborhood: 'Coyoacán',
    memberSince: 2024,
    blurb:
      'El rincón de Commander y singles de colección. Foils, cartas de reserva y ediciones especiales de Magic.',
    favoriteGames: ['mtg'],
    yearsInHobby: 7,
    funFact:
      'Empezó vendiendo cartas desde una mochila en las mesas de The Pub Game Store antes de abrir su propio stand.',
    address: 'Calle Francisco Sosa 55, Villa Coyoacán, CDMX',
    hours: STANDARD_HOURS,
    whatsapp: '525544009988',
    instagram: 'eldrazicorner',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a5',
    name: 'Nakama Singles',
    slug: 'nakama-singles',
    status: 'active',
    verified: true,
    monogram: 'NS',
    city: 'CDMX',
    neighborhood: 'Narvarte',
    memberSince: 2023,
    blurb:
      'One Piece y Lorcana en su punto. Cartas de líder, alt-arts y todo lo que necesitas para tu mejor mazo.',
    favoriteGames: ['onepiece', 'lorcana', 'pokemon'],
    yearsInHobby: 6,
    funFact:
      'El nombre viene de "nakama" (compañero); regalan una carta común a quien trae a un amigo nuevo al hobby.',
    address: 'Av. Cuauhtémoc 640, Narvarte Poniente, CDMX',
    hours: STANDARD_HOURS,
    whatsapp: '525566778811',
    instagram: 'nakamasingles',
  },
]
