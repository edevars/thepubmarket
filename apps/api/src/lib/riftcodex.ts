/**
 * Cliente de RiftCodex — catálogo de cartas de Riftbound.
 *
 * Mismo trato que Scryfall para MTG: no reimplementamos un catálogo propio,
 * traemos la impresión por su id (inmutable → cacheable) y buscamos por nombre
 * para que el vendedor encuentre la carta a publicar.
 *
 * RiftCodex es un proyecto FAN no oficial (sin relación con Riot) y su API
 * está marcada como work in progress. Dos rarezas observadas en vivo que
 * explican decisiones de este archivo:
 *
 *   - `/cards/search?query=` devuelve 0 resultados para cualquier término: el
 *     índice full-text todavía no funciona. Por eso la búsqueda usa
 *     `/cards/name?fuzzy=`, que sí responde y trae todas las impresiones.
 *   - Un id inexistente responde 500, NO 404. El proveedor no sabe decir "no
 *     existe", así que un id inválido se reporta como falla del upstream.
 *
 * No requiere autenticación. Mandamos User-Agent identificable por cortesía y
 * un timeout propio: sin él un proveedor colgado se lleva la petición entera.
 */

import type { CardSnapshot } from '@thepubmarket/shared'
import {
  CARD_CACHE_TTL_SECONDS,
  CATALOG_TIMEOUT_MS,
  CatalogError,
  SEARCH_CACHE_TTL_SECONDS,
} from './catalog'

const RIFTCODEX_BASE = 'https://api.riftcodex.com'

// TODO: poner un contacto/URL real cuando exista el dominio en producción.
const RIFTCODEX_HEADERS: HeadersInit = {
  'User-Agent': 'ThePubMarket/0.1 (+https://thepubmarket.mx; contacto@thepubmarket.mx)',
  Accept: 'application/json',
}

/** Impresiones por búsqueda. El máximo que acepta la API es 100. */
const SEARCH_PAGE_SIZE = 60

const cardKey = (id: string) => `riftcodex:card:${id}`
const searchKey = (query: string) => `riftcodex:search:${query.trim().toLowerCase()}`

/**
 * Subconjunto de la respuesta de RiftCodex que nos interesa. Todo lo anidado
 * va opcional a propósito: la API es WIP y preferimos degradar un campo antes
 * que reventar el alta de una publicación.
 */
interface RiftCodexCard {
  id: string
  name: string
  collector_number?: number
  classification?: { rarity?: string }
  set?: { set_id?: string; label?: string }
  media?: { image_url?: string | null; artist?: string | null }
}

/** Envoltura paginada de los endpoints de lista. */
interface RiftCodexPage {
  items: RiftCodexCard[]
}

/** Normaliza una carta cruda de RiftCodex al snapshot que guardamos/servimos. */
export function normalizeCard(raw: RiftCodexCard): CardSnapshot {
  return {
    tcg: 'riftbound',
    catalogId: raw.id,
    // `oracleId` es un concepto de Scryfall (la carta lógica de MTG).
    oracleId: null,
    // El nombre ya distingue las variantes: "Jinx - Loose Cannon (Signature)",
    // "(Alternate Art)", "(Overnumbered)". Son entradas de catálogo distintas,
    // no acabados de una misma impresión.
    name: raw.name,
    setCode: raw.set?.set_id ?? '',
    setName: raw.set?.label ?? '',
    collectorNumber: raw.collector_number?.toString() ?? '',
    // RiftCodex no expone idioma; su catálogo está en inglés.
    lang: 'en',
    // A minúsculas para igualar la convención de los snapshots de Scryfall
    // ('rare', 'common'); RiftCodex las manda capitalizadas.
    rarity: raw.classification?.rarity?.toLowerCase() ?? '',
    artist: raw.media?.artist ?? null,
    // RiftCodex no informa acabados. Vacío = `createListing` acepta cualquiera.
    finishes: [],
    imageUrl: raw.media?.image_url ?? null,
  }
}

/** GET contra RiftCodex con timeout. Cualquier falla sale como CatalogError. */
async function fetchRiftCodex(url: string | URL): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: RIFTCODEX_HEADERS,
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    })
  } catch (err) {
    // Timeout o falla de red: sin esto el error sube crudo al handler.
    const reason = err instanceof Error ? err.message : 'network error'
    throw new CatalogError(`RiftCodex request failed (${reason})`, 504)
  }
  if (!res.ok) {
    throw new CatalogError(`RiftCodex request failed (${res.status})`, res.status)
  }
  return res
}

/**
 * Trae una impresión por su id de RiftCodex, con cache en KV. Lanza
 * CatalogError si la API falla; ojo: un id inexistente llega aquí como 500 del
 * proveedor, no como 404 (RiftCodex no distingue el caso).
 */
export async function getCardById(id: string, kv: KVNamespace): Promise<CardSnapshot> {
  const cached = await kv.get<CardSnapshot>(cardKey(id), 'json')
  if (cached) return cached

  const res = await fetchRiftCodex(`${RIFTCODEX_BASE}/cards/${encodeURIComponent(id)}`)
  const snapshot = normalizeCard((await res.json()) as RiftCodexCard)
  await kv.put(cardKey(id), JSON.stringify(snapshot), {
    expirationTtl: CARD_CACHE_TTL_SECONDS,
  })
  return snapshot
}

/**
 * Busca impresiones por nombre para el lookup del vendedor. Usa el endpoint
 * difuso (`/cards/name?fuzzy=`) porque el full-text de RiftCodex hoy devuelve
 * vacío. Una búsqueda sin coincidencias es lista vacía, no error.
 */
export async function searchCards(query: string, kv: KVNamespace): Promise<CardSnapshot[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const cached = await kv.get<CardSnapshot[]>(searchKey(trimmed), 'json')
  if (cached) return cached

  const url = new URL(`${RIFTCODEX_BASE}/cards/name`)
  url.searchParams.set('fuzzy', trimmed)
  url.searchParams.set('size', String(SEARCH_PAGE_SIZE))

  const res = await fetchRiftCodex(url)
  const page = (await res.json()) as RiftCodexPage
  const results = (page.items ?? []).map(normalizeCard)
  await kv.put(searchKey(trimmed), JSON.stringify(results), {
    expirationTtl: SEARCH_CACHE_TTL_SECONDS,
  })
  return results
}
