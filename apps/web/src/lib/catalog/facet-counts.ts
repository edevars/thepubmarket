/**
 * Motor de conteo por faceta (TASK-053), consumido por el sidebar (TASK-054).
 * Conteo con AUTOEXCLUSIÓN: el conteo del valor `v` de una faceta `F` se
 * calcula aplicando TODOS los filtros activos EXCEPTO los de `F` — así un
 * checkbox ya marcado no colapsa su propio conteo a 0 ni oculta las demás
 * opciones de la misma faceta que seguirían dando resultados si se
 * cambiaran. Es la razón por la que `catalog/page.tsx` deja de mandar las
 * facetas a la API (TASK-053): si el servidor ya filtró por ellas, los items
 * de los valores NO seleccionados nunca llegan y su conteo sería
 * incomputable.
 *
 * Módulo puro (sin React) — reusa `applyFilters`/`matchesGameFilters` para no
 * duplicar la semántica de matching, así que un cambio en esas funciones se
 * refleja aquí automáticamente.
 */
import { CONDITIONS, type Condition, type InventoryItem } from '@thepubmarket/shared'
import { applyFilters, type CatalogFilters } from './data'
import type { GameFacet } from './game-filters'

/** Set de filtros activos sobre el que se calculan los conteos (self-exclusion). */
export interface FacetCountFilters {
  q?: string
  conditions: Condition[]
  languages: string[]
  foilOnly: boolean
  minCents?: number
  maxCents?: number
  /** Filtros propios del juego activo (param -> valores seleccionados). */
  game: Record<string, string[]>
}

function toCatalogFilters(
  filters: FacetCountFilters,
  overrides: Partial<CatalogFilters> = {},
): CatalogFilters {
  return {
    q: filters.q,
    conditions: filters.conditions,
    languages: filters.languages,
    foilOnly: filters.foilOnly,
    minCents: filters.minCents,
    maxCents: filters.maxCents,
    game: filters.game,
    ...overrides,
  }
}

/** Conteo por condición, excluyendo el propio filtro de condición. */
export function countConditions(
  items: InventoryItem[],
  filters: FacetCountFilters,
): Record<Condition, number> {
  const pool = applyFilters(items, toCatalogFilters(filters, { conditions: [] }))
  const counts = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<Condition, number>
  for (const item of pool) counts[item.condition] += 1
  return counts
}

/** Conteo por idioma, excluyendo el propio filtro de idioma. */
export function countLanguages(
  items: InventoryItem[],
  filters: FacetCountFilters,
): Record<string, number> {
  const pool = applyFilters(items, toCatalogFilters(filters, { languages: [] }))
  const counts: Record<string, number> = {}
  for (const item of pool) counts[item.language] = (counts[item.language] ?? 0) + 1
  return counts
}

/** Conteo de items foil, excluyendo el propio filtro de foil. */
export function countFoil(items: InventoryItem[], filters: FacetCountFilters): number {
  const pool = applyFilters(items, toCatalogFilters(filters, { foilOnly: false }))
  return pool.filter((item) => item.finish === 'foil').length
}

/**
 * Conteo por valor de una faceta propia de juego (domain/type/rarity/…),
 * excluyendo el propio filtro de esa faceta (pero respetando el resto,
 * incluidas OTRAS facetas del mismo juego).
 */
export function countGameFacetValues(
  items: InventoryItem[],
  filters: FacetCountFilters,
  facet: GameFacet,
): Record<string, number> {
  const nextGame = { ...filters.game }
  delete nextGame[facet.param]
  const pool = applyFilters(items, toCatalogFilters(filters, { game: nextGame }))
  const counts: Record<string, number> = {}
  for (const item of pool) {
    for (const value of facet.valuesOf(item)) counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}
