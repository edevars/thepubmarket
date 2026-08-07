/**
 * Cliente de Scryfall — fuente de verdad de cartas MTG.
 *
 * No reimplementamos un catálogo propio: Scryfall es canónico. Aquí solo:
 *   - traemos datos de una impresión por su scryfall_id (inmutable → cacheable),
 *   - buscamos impresiones para que el admin encuentre la carta a publicar.
 *
 * Rate limit de Scryfall: ~10 req/s. Nos apoyamos en el cache de KV para no
 * pegarle en cada render; el admin que carga en lote debe espaciar llamadas.
 * Scryfall exige enviar User-Agent y Accept identificables en cada request.
 */

import { type CardSnapshot, MTG_CARD_TYPES, type MtgAttributes } from '@thepubmarket/shared'
import { CARD_CACHE_TTL_SECONDS, CatalogError, SEARCH_CACHE_TTL_SECONDS } from './catalog'
import type { CatalogContext } from './catalog-providers'

const SCRYFALL_BASE = 'https://api.scryfall.com'

// TODO: poner un contacto/URL real cuando exista el dominio en producción.
const SCRYFALL_HEADERS: HeadersInit = {
  'User-Agent': 'ThePubMarket/0.1 (+https://thepubmarket.mx; contacto@thepubmarket.mx)',
  Accept: 'application/json',
}

// :v2: (TASK-049): antes de esto `normalizeCard` guardaba `gameAttributes:
// null` para todo MTG. Bump del prefijo para que los snapshots cacheados sin
// atributos expiren solos en vez de servirse indefinidamente hasta su TTL
// natural — no hace falta invalidar KV a mano.
const cardKey = (scryfallId: string) => `scryfall:card:v2:${scryfallId}`
const searchKey = (query: string) => `scryfall:search:v2:${query.trim().toLowerCase()}`

/** Subconjunto de la respuesta de Scryfall que nos interesa. */
interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  set: string
  set_name: string
  collector_number: string
  lang: string
  rarity: string
  artist?: string
  finishes?: string[]
  image_uris?: { normal?: string }
  card_faces?: Array<{ image_uris?: { normal?: string }; colors?: string[]; type_line?: string }>
  /** Ausente en cartas de doble cara: cada cara tiene la suya en `card_faces`. */
  colors?: string[]
  /** Ausente en cartas de doble cara: ver `card_faces[0].type_line`. */
  type_line?: string
  /** Valor de maná. Puede venir con decimales raros (ninguno hoy), por eso number. */
  cmc?: number
}

interface ScryfallList {
  data: ScryfallCard[]
}

/** Falla de Scryfall. Es un `CatalogError` para que el alta la trate igual
 * que la de cualquier otro catálogo. */
export class ScryfallError extends CatalogError {
  constructor(message: string, status: number) {
    super(message, status)
    this.name = 'ScryfallError'
  }
}

/**
 * Deriva `MtgAttributes` de una carta cruda (TASK-049). Reglas:
 *
 * - `colors`: el campo top-level si viene y no está vacío; si no, la unión de
 *   los colores de cada cara (`card_faces[].colors`); si sigue vacío (carta
 *   colorless, p.ej. un artefacto), `['C']` — así el filtro de color nunca
 *   necesita un caso especial de NULL/array vacío.
 * - `types`: tokens de la línea de tipo de la cara FRONTAL (antes del '—'),
 *   intersectados con MTG_CARD_TYPES (descarta supertipos como 'Legendary' y
 *   subtipos como 'Human').
 * - `typeLine`: la línea de tipo completa de la cara frontal, o null.
 * - `manaValue`: `cmc` tal cual, o null si Scryfall no lo reporta.
 */
function buildMtgAttributes(raw: ScryfallCard): MtgAttributes {
  const topColors = raw.colors ?? []
  const colors =
    topColors.length > 0
      ? topColors
      : (() => {
          const union = new Set<string>()
          for (const face of raw.card_faces ?? []) {
            for (const c of face.colors ?? []) union.add(c)
          }
          return [...union]
        })()

  const typeLine = raw.type_line ?? raw.card_faces?.[0]?.type_line ?? null
  const types = typeLine
    ? (typeLine.split('—')[0]?.trim().split(/\s+/).filter(Boolean) ?? []).filter((t) =>
        (MTG_CARD_TYPES as readonly string[]).includes(t),
      )
    : []

  return {
    tcg: 'mtg',
    colors: colors.length > 0 ? colors : ['C'],
    types,
    typeLine,
    manaValue: raw.cmc ?? null,
  }
}

/** Normaliza una carta cruda de Scryfall al snapshot que guardamos/servimos. */
export function normalizeCard(raw: ScryfallCard): CardSnapshot {
  // Cartas de doble cara no traen image_uris arriba; usamos la primera cara.
  // TODO: migrar imágenes a R2 en fase posterior.
  const imageUrl = raw.image_uris?.normal ?? raw.card_faces?.[0]?.image_uris?.normal ?? null

  return {
    tcg: 'mtg',
    catalogId: raw.id,
    oracleId: raw.oracle_id ?? null,
    name: raw.name,
    setCode: raw.set,
    setName: raw.set_name,
    collectorNumber: raw.collector_number,
    lang: raw.lang,
    rarity: raw.rarity,
    artist: raw.artist ?? null,
    finishes: raw.finishes ?? [],
    imageUrl,
    gameAttributes: buildMtgAttributes(raw),
  }
}

/**
 * Trae una impresión por scryfall_id, con cache en KV. Devuelve el snapshot
 * normalizado. Lanza ScryfallError si la carta no existe o la API falla.
 */
export async function getCardById(scryfallId: string, ctx: CatalogContext): Promise<CardSnapshot> {
  // Scryfall solo necesita el KV de cache del contexto; db/origin son del
  // provider local (catalog-db).
  const kv = ctx.kv
  const cached = await kv.get<CardSnapshot>(cardKey(scryfallId), 'json')
  if (cached) return cached

  const res = await fetch(`${SCRYFALL_BASE}/cards/${encodeURIComponent(scryfallId)}`, {
    headers: SCRYFALL_HEADERS,
  })
  if (!res.ok) {
    throw new ScryfallError(`Scryfall card lookup failed (${res.status})`, res.status)
  }

  const snapshot = normalizeCard((await res.json()) as ScryfallCard)
  await kv.put(cardKey(scryfallId), JSON.stringify(snapshot), {
    expirationTtl: CARD_CACHE_TTL_SECONDS,
  })
  return snapshot
}

/**
 * Busca impresiones para el lookup del admin. `unique=prints` para listar cada
 * impresión por separado. Cachea el resultado brevemente en KV. Una búsqueda
 * sin resultados (404 de Scryfall) devuelve lista vacía, no error.
 */
export async function searchCards(query: string, ctx: CatalogContext): Promise<CardSnapshot[]> {
  const kv = ctx.kv
  const trimmed = query.trim()
  if (!trimmed) return []

  const cached = await kv.get<CardSnapshot[]>(searchKey(trimmed), 'json')
  if (cached) return cached

  const url = new URL(`${SCRYFALL_BASE}/cards/search`)
  url.searchParams.set('q', trimmed)
  url.searchParams.set('unique', 'prints')

  const res = await fetch(url, { headers: SCRYFALL_HEADERS })
  if (res.status === 404) {
    // Scryfall responde 404 cuando no hay coincidencias.
    await kv.put(searchKey(trimmed), JSON.stringify([]), {
      expirationTtl: SEARCH_CACHE_TTL_SECONDS,
    })
    return []
  }
  if (!res.ok) {
    throw new ScryfallError(`Scryfall search failed (${res.status})`, res.status)
  }

  const list = (await res.json()) as ScryfallList
  const results = list.data.map(normalizeCard)
  await kv.put(searchKey(trimmed), JSON.stringify(results), {
    expirationTtl: SEARCH_CACHE_TTL_SECONDS,
  })
  return results
}
