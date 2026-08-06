/**
 * Registro de catálogos por juego. Un `Tcg` aparece aquí cuando su catálogo
 * está integrado; publicar o buscar en uno que no está devuelve
 * `tcg_not_supported`.
 *
 * Vive aparte de `lib/catalog.ts` a propósito: ese módulo lo importan los
 * clientes concretos (scryfall, riftcodex), así que el registro no puede vivir
 * ahí sin ciclo de imports.
 *
 * Agregar un juego = escribir su cliente con la misma forma y sumarlo aquí.
 * Nada más en la API necesita enterarse.
 */

import type { CardSnapshot, Tcg } from '@thepubmarket/shared'
import * as riftcodex from './riftcodex'
import * as scryfall from './scryfall'

/** Lo que la API necesita de cualquier catálogo de cartas. */
export interface CatalogProvider {
  /** Trae una impresión por su id en ese catálogo. Lanza `CatalogError`. */
  getCardById(catalogId: string, kv: KVNamespace): Promise<CardSnapshot>
  /** Busca impresiones por nombre. Sin coincidencias = lista vacía. */
  searchCards(query: string, kv: KVNamespace): Promise<CardSnapshot[]>
}

const PROVIDERS: Partial<Record<Tcg, CatalogProvider>> = {
  mtg: scryfall,
  riftbound: riftcodex,
}

/** Catálogo del juego, o undefined si todavía no está integrado. */
export function catalogProviderFor(tcg: Tcg): CatalogProvider | undefined {
  return PROVIDERS[tcg]
}

/** Juegos que hoy se pueden buscar y publicar. Para mensajes de error. */
export function supportedTcgs(): Tcg[] {
  return Object.keys(PROVIDERS) as Tcg[]
}
