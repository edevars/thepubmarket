/**
 * Registro de catálogos por juego. Un `Tcg` aparece aquí cuando su catálogo
 * está integrado; publicar o buscar en uno que no está devuelve
 * `tcg_not_supported`.
 *
 * Vive aparte de `lib/catalog.ts` a propósito: ese módulo lo importan los
 * clientes concretos (scryfall, catalog-db), así que el registro no puede
 * vivir ahí sin ciclo de imports.
 *
 * Los providers reciben un `CatalogContext` en vez de solo KV: el provider
 * local (catalog-db) lee de D1 y arma URLs de imagen con el origin del
 * request; los HTTP (scryfall) solo usan el KV de cache. Cada uno toma del
 * contexto lo que necesita.
 *
 * Agregar un juego = escribir su cliente con la misma forma (o llenarle
 * `catalog_cards` con un importer y usar `localCatalogProvider`) y sumarlo
 * aquí. Nada más en la API necesita enterarse.
 */

import type { Db } from '@thepubmarket/db'
import type { CardSnapshot, Tcg } from '@thepubmarket/shared'
import { localCatalogProvider } from './catalog-db'
import * as scryfall from './scryfall'

/** Todo lo que cualquier provider puede necesitar para resolver una consulta. */
export interface CatalogContext {
  db: Db
  kv: KVNamespace
  /** Origin del request (`https://api...`), para URLs absolutas de imagen. */
  origin: string
}

/** Lo que la API necesita de cualquier catálogo de cartas. */
export interface CatalogProvider {
  /** Trae una impresión por su id en ese catálogo. Lanza `CatalogError`. */
  getCardById(catalogId: string, ctx: CatalogContext): Promise<CardSnapshot>
  /** Busca impresiones por nombre. Sin coincidencias = lista vacía. */
  searchCards(query: string, ctx: CatalogContext): Promise<CardSnapshot[]>
}

const PROVIDERS: Partial<Record<Tcg, CatalogProvider>> = {
  mtg: scryfall,
  // Catálogo local en D1, importado desde dotgg (TASK-036/037). Sustituye a
  // RiftCodex, que no podía buscar ni distinguir un id inexistente de un 500.
  riftbound: localCatalogProvider('riftbound'),
}

/** Catálogo del juego, o undefined si todavía no está integrado. */
export function catalogProviderFor(tcg: Tcg): CatalogProvider | undefined {
  return PROVIDERS[tcg]
}

/** Juegos que hoy se pueden buscar y publicar. Para mensajes de error. */
export function supportedTcgs(): Tcg[] {
  return Object.keys(PROVIDERS) as Tcg[]
}
