/**
 * Filtros "locales" del catálogo (TASK-053): condición, idioma, foil, rango
 * de precio y orden. A diferencia de `q`/`game`/facetas de juego (que
 * disparan `router.push` porque cambian lo que el servidor pidió a la API),
 * estos filtros se aplican sobre una lista YA cargada — su cambio nunca
 * necesita un round-trip al servidor, así que viven en la URL vía
 * `history.replaceState` (ver `CatalogView.tsx`) en vez de navegación.
 *
 * Espejo deliberado de las convenciones de `game-filters.ts`
 * (`parse.../serialize...`, tolerante a valores corruptos, nunca lanza) para
 * que ambos módulos se lean igual — la diferencia es el canal de escritura
 * en la URL, no el shape del parseo.
 */
import { CONDITIONS, type Condition } from '@thepubmarket/shared'

export type SortOrder = 'relevance' | 'price_asc' | 'price_desc' | 'newest'

export const SORT_ORDERS: readonly SortOrder[] = ['relevance', 'price_asc', 'price_desc', 'newest']

const DEFAULT_SORT: SortOrder = 'relevance'

export interface LocalFilters {
  conditions: Condition[]
  languages: string[]
  foilOnly: boolean
  /** Pesos MXN como string cruda del input (vacío = sin límite). */
  minPesos: string
  maxPesos: string
  sort: SortOrder
}

export const EMPTY_LOCAL_FILTERS: LocalFilters = {
  conditions: [],
  languages: [],
  foilOnly: false,
  minPesos: '',
  maxPesos: '',
  sort: DEFAULT_SORT,
}

/** Idiomas válidos reconocidos por la URL (mismo vocabulario que `FILTER_LANGUAGES`). */
const VALID_LANGUAGES = ['es', 'en', 'jp']

function isSortOrder(v: string): v is SortOrder {
  return (SORT_ORDERS as readonly string[]).includes(v)
}

/** Recorta espacios, separa por coma y descarta vacíos. */
function splitCsv(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/** Solo dígitos positivos (pesos enteros); cualquier otra cosa se ignora. */
function sanitizePesos(raw: string | null): string {
  if (!raw) return ''
  return /^\d+$/.test(raw) ? raw : ''
}

/**
 * Lee `cond/lang/foil/min/max/sort` de `URLSearchParams`. Tolerante a
 * cualquier valor corrupto o fuera de vocabulario — un param inválido se
 * ignora en vez de romper el render, igual que `parseGameFiltersFromSearchParams`.
 */
export function parseLocalFilters(searchParams: URLSearchParams): LocalFilters {
  const conditions = splitCsv(searchParams.get('cond')).filter((c): c is Condition =>
    (CONDITIONS as readonly string[]).includes(c),
  )
  const languages = splitCsv(searchParams.get('lang')).filter((l) => VALID_LANGUAGES.includes(l))
  const foilOnly = searchParams.get('foil') === '1'
  const minPesos = sanitizePesos(searchParams.get('min'))
  const maxPesos = sanitizePesos(searchParams.get('max'))
  const sortRaw = searchParams.get('sort')
  const sort = sortRaw && isSortOrder(sortRaw) ? sortRaw : DEFAULT_SORT

  return {
    conditions: [...new Set(conditions)],
    languages: [...new Set(languages)],
    foilOnly,
    minPesos,
    maxPesos,
    sort,
  }
}

/**
 * Variante que lee de un `Record` de searchParams del server component
 * (Next entrega objetos, no `URLSearchParams`, en `page.tsx`).
 */
export function parseLocalFiltersFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): LocalFilters {
  const params = new URLSearchParams()
  for (const key of ['cond', 'lang', 'foil', 'min', 'max', 'sort']) {
    const raw = searchParams[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value != null) params.set(key, value)
  }
  return parseLocalFilters(params)
}

/**
 * Escribe `cond/lang/foil/min/max/sort` sobre un `URLSearchParams` existente
 * (in-place: borra las claves que ya no aplican, deja el resto intacto para
 * que el llamador pueda mezclar con `q`/`game`/facetas sin pisarlos).
 */
export function applyLocalFiltersToSearchParams(
  params: URLSearchParams,
  filters: LocalFilters,
): void {
  if (filters.conditions.length > 0) params.set('cond', [...filters.conditions].sort().join(','))
  else params.delete('cond')

  if (filters.languages.length > 0) params.set('lang', [...filters.languages].sort().join(','))
  else params.delete('lang')

  if (filters.foilOnly) params.set('foil', '1')
  else params.delete('foil')

  if (filters.minPesos) params.set('min', filters.minPesos)
  else params.delete('min')

  if (filters.maxPesos) params.set('max', filters.maxPesos)
  else params.delete('max')

  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort)
  else params.delete('sort')
}

/** Serializa a querystring suelto (sin `?`), útil para tests de round-trip. */
export function serializeLocalFilters(filters: LocalFilters): string {
  const params = new URLSearchParams()
  applyLocalFiltersToSearchParams(params, filters)
  return params.toString()
}

/** ¿Hay algún filtro local activo (para contadores de UI)? */
export function countActiveLocalFilters(filters: LocalFilters): number {
  return (
    filters.conditions.length +
    filters.languages.length +
    (filters.foilOnly ? 1 : 0) +
    (filters.minPesos || filters.maxPesos ? 1 : 0)
  )
}
