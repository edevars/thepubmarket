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

import type { CardSnapshot } from '@thepubmarket/shared'

const SCRYFALL_BASE = 'https://api.scryfall.com'

// TODO: poner un contacto/URL real cuando exista el dominio en producción.
const SCRYFALL_HEADERS: HeadersInit = {
  'User-Agent': 'ThePubMarket/0.1 (+https://thepubmarket.mx; contacto@thepubmarket.mx)',
  Accept: 'application/json',
}

/** Las cartas son inmutables → cache largo. 30 días en segundos. */
const CARD_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30
/** Las búsquedas cambian → cache corto. 10 minutos en segundos. */
const SEARCH_CACHE_TTL_SECONDS = 60 * 10

const cardKey = (scryfallId: string) => `scryfall:card:${scryfallId}`
const searchKey = (query: string) => `scryfall:search:${query.trim().toLowerCase()}`

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
  finishes?: string[]
  image_uris?: { normal?: string }
  card_faces?: Array<{ image_uris?: { normal?: string } }>
}

interface ScryfallList {
  data: ScryfallCard[]
}

export class ScryfallError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ScryfallError'
  }
}

/** Normaliza una carta cruda de Scryfall al snapshot que guardamos/servimos. */
export function normalizeCard(raw: ScryfallCard): CardSnapshot {
  // Cartas de doble cara no traen image_uris arriba; usamos la primera cara.
  // TODO: migrar imágenes a R2 en fase posterior.
  const imageUrl = raw.image_uris?.normal ?? raw.card_faces?.[0]?.image_uris?.normal ?? null

  return {
    scryfallId: raw.id,
    oracleId: raw.oracle_id ?? '',
    name: raw.name,
    setCode: raw.set,
    setName: raw.set_name,
    collectorNumber: raw.collector_number,
    lang: raw.lang,
    rarity: raw.rarity,
    finishes: raw.finishes ?? [],
    imageUrl,
  }
}

/**
 * Trae una impresión por scryfall_id, con cache en KV. Devuelve el snapshot
 * normalizado. Lanza ScryfallError si la carta no existe o la API falla.
 */
export async function getCardById(scryfallId: string, kv: KVNamespace): Promise<CardSnapshot> {
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
export async function searchCards(query: string, kv: KVNamespace): Promise<CardSnapshot[]> {
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
