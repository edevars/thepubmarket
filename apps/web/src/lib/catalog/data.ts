/**
 * Frontera de acceso a datos del catálogo. Llama a la API real del Worker
 * (`apps/api`, GET /catalog) vía `lib/api.ts`. El resto de la app consume SOLO
 * este módulo; nadie importa el cliente HTTP ni los mocks directamente.
 *
 * Filtrado: en Fase 1 (un solo seller, catálogo pequeño) traemos el inventario
 * activo en una página y filtramos en cliente con `applyFilters`. La paginación
 * real / búsqueda externa llegan cuando el catálogo crezca (Fase 5).
 *
 * Fallback offline: con `NEXT_PUBLIC_USE_MOCKS=true` se sirven los mocks de
 * `mock-data.ts` (útil para desarrollar sin la API levantada).
 */
import type { CatalogGameCount, Condition, InventoryItem, Tcg } from '@thepubmarket/shared'
import { fetchCatalog, fetchCatalogGameCounts, fetchCatalogItem } from '@/lib/api'
import { matchesGameFilters } from './game-filters'
import { cardKey, dedupeByCard, offersOfSameCard } from './grouping'
import { MOCK_LISTINGS } from './mock-data'

/**
 * Trae todo el inventario activo en una sola página (tope alto de la API).
 * TASK-053: las facetas de juego (domain/color/rarity/…) y el conteo por
 * valor de `facet-counts.ts` ahora se calculan en CLIENTE sobre este mismo
 * set (ver `catalog/page.tsx`, que ya no manda `game` a `getCatalog`), para
 * que los conteos de valores NO seleccionados sean computables. CAVEAT: si un
 * juego supera `FETCH_LIMIT` items, tanto el filtrado de facetas en cliente
 * como sus conteos quedan truncados a esta página — los filtros de faceta del
 * lado API (`catalog-filters.ts` en el Worker) siguen siendo el contrato real
 * y se mantienen probados ahí; esto solo deja de ejercitarlos desde el
 * catálogo web hasta que llegue paginación real (Fase 5).
 */
const FETCH_LIMIT = 200
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true'

export interface CatalogFilters {
  /**
   * Búsqueda por nombre (substring, case-insensitive). Se aplica en el
   * SERVIDOR (`GET /catalog?q=`, LIKE sobre el título) — ver `loadActive`. El
   * filtro cliente de `applyFilters` se conserva porque los mocks y las listas
   * ya cargadas también lo necesitan; sobre datos reales es idempotente.
   */
  q?: string
  /**
   * Juego. Se aplica en el SERVIDOR (`GET /catalog?tcg=`), no aquí: si se
   * filtrara en cliente, el tope de `FETCH_LIMIT` recortaría antes de filtrar
   * y un juego con pocos singles podría no aparecer.
   */
  tcg?: Tcg
  conditions?: Condition[]
  /** Idiomas de la impresión ('es' | 'en' | 'jp'). */
  languages?: string[]
  foilOnly?: boolean
  /** Rango de precio en centavos MXN. */
  minCents?: number
  maxCents?: number
  /**
   * Filtros propios del juego activo (TASK-039/040): param -> valores
   * seleccionados, p.ej. `{ domain: ['Fury'], energy: ['3'] }` para
   * Riftbound. Viaja a la API igual que `tcg` — ver `game-filters.ts`.
   */
  game?: Record<string, string[]>
}

/**
 * Aplica los filtros sobre una lista ya cargada (reutilizable en cliente).
 * `tcg`/`game` también se respetan aquí para que los mocks y las listas ya
 * cargadas se comporten igual que la API, pero en producción llegan ya
 * filtrados.
 */
export function applyFilters(items: InventoryItem[], f: CatalogFilters): InventoryItem[] {
  const q = f.q?.trim().toLowerCase()
  return items.filter((item) => {
    if (q && !item.card.name.toLowerCase().includes(q)) return false
    if (f.tcg && item.tcg !== f.tcg) return false
    if (f.conditions?.length && !f.conditions.includes(item.condition)) return false
    if (f.languages?.length && !f.languages.includes(item.language)) return false
    if (f.foilOnly && item.finish !== 'foil') return false
    if (f.minCents != null && item.priceCents < f.minCents) return false
    if (f.maxCents != null && item.priceCents > f.maxCents) return false
    if (f.game && !matchesGameFilters(item, f.game)) return false
    return true
  })
}

/**
 * Carga el inventario activo (API real o mocks según el toggle).
 *
 * `q` viaja al SERVIDOR (TASK-059). Antes no lo hacía y el término se aplicaba
 * en cliente sobre la página ya truncada, así que buscar solo encontraba algo
 * dentro de los primeros `FETCH_LIMIT` items por título: con 502 singles de
 * Riftbound, la ventana buscable iba de "Affectionate Poro" a "Jayce - Man of
 * Progress" y "Rengar" no existía para el buscador. A diferencia de las
 * facetas de juego —que se quedan en cliente a propósito, porque el motor de
 * conteo con autoexclusión necesita ver los items de los valores NO
 * seleccionados— el término de búsqueda NO alimenta ningún conteo por valor:
 * acota el universo entero, así que filtrarlo en la base es correcto y es la
 * única forma de alcanzar el catálogo completo.
 */
async function loadActive(
  filters: Pick<CatalogFilters, 'tcg' | 'game' | 'q'>,
): Promise<InventoryItem[]> {
  if (USE_MOCKS) return MOCK_LISTINGS.filter((i) => i.status === 'active')
  const { items } = await fetchCatalog({
    limit: FETCH_LIMIT,
    q: filters.q,
    tcg: filters.tcg,
    gameFilters: filters.game,
  })
  return items
}

/**
 * Lista del catálogo. Sin filtros devuelve todo el inventario activo. El
 * juego y sus filtros propios viajan a la API; el resto se aplica sobre lo ya
 * cargado.
 */
export async function getCatalog(filters: CatalogFilters = {}): Promise<InventoryItem[]> {
  return applyFilters(await loadActive(filters), filters)
}

/** Singles disponibles por juego, para el filtro y los mosaicos de la home. */
export async function getGameCounts(): Promise<CatalogGameCount[]> {
  if (USE_MOCKS) {
    const counts = new Map<Tcg, number>()
    for (const item of MOCK_LISTINGS.filter((i) => i.status === 'active')) {
      counts.set(item.tcg, (counts.get(item.tcg) ?? 0) + 1)
    }
    return [...counts].map(([tcg, count]) => ({ tcg, count })).sort((a, b) => b.count - a.count)
  }
  return fetchCatalogGameCounts()
}

/** Detalle de un item por id. Null si no existe / no está activo. */
export async function getItem(id: string): Promise<InventoryItem | null> {
  if (USE_MOCKS) return MOCK_LISTINGS.find((i) => i.id === id && i.status === 'active') ?? null
  return fetchCatalogItem(id)
}

/**
 * Catálogo con UNA publicación por carta (TASK-062): la representante de cada
 * grupo, que es la de precio más cercano al promedio de esa carta. Es lo que
 * alimenta cualquier grid que no calcule sus propias facetas — la home y las
 * relacionadas. El catálogo y la tienda agrupan ellos mismos DESPUÉS de
 * filtrar, porque una carta cuenta como resultado solo si le queda alguna
 * oferta que pase los filtros.
 */
async function getCards(filters: CatalogFilters = {}): Promise<InventoryItem[]> {
  return dedupeByCard(await getCatalog(filters))
}

/**
 * Destacados de la home. En Fase 1 son slices del inventario real; la curación
 * manual de destacados es un refinamiento posterior.
 */
export async function getFeatured(): Promise<InventoryItem[]> {
  return (await getCards()).slice(0, 5)
}

/** Recién llegados de la home (slice del inventario real). */
export async function getNewArrivals(): Promise<InventoryItem[]> {
  return (await getCards()).slice(5, 10)
}

/** Cartas en abanico del hero (3 del inventario real). */
export async function getHeroCards(): Promise<InventoryItem[]> {
  return (await getCards()).slice(0, 3)
}

/**
 * Cartas relacionadas a un item (mismo juego primero), hasta `limit`. Excluye
 * la carta que se está viendo por IDENTIDAD, no por id de fila: sus otras
 * ofertas ya se listan en la ficha y no son "relacionadas".
 */
export async function getRelated(item: InventoryItem, limit = 4): Promise<InventoryItem[]> {
  const key = cardKey(item)
  const all = (await getCards()).filter((i) => cardKey(i) !== key)
  const sameGame = all.filter((i) => i.tcg === item.tcg)
  const rest = all.filter((i) => i.tcg !== item.tcg)
  return [...sameGame, ...rest].slice(0, limit)
}

/**
 * TODAS las ofertas activas de la misma carta (incluida la que se está
 * viendo), de menor a mayor precio, para comparar condición/precio/tienda.
 *
 * Se piden a la API por id de impresión en vez de buscarlas dentro del
 * catálogo ya cargado: con más de mil publicaciones activas y páginas de 200
 * ordenadas por título, las hermanas de una carta que ordene tarde en el
 * alfabeto nunca caían en la página traída y la ficha las daba por
 * inexistentes (misma clase de bug que TASK-059). Lo que la API devuelva de
 * más —misma impresión pero otro idioma o acabado— lo descarta `cardKey`.
 */
export async function getPurchaseOptions(item: InventoryItem): Promise<InventoryItem[]> {
  const printing = item.card.catalogId?.trim()
  // Sin id de impresión no hay con qué buscar hermanas: la carta es esta fila.
  if (!printing) return [item]

  const candidates = USE_MOCKS
    ? MOCK_LISTINGS
    : (await fetchCatalog({ catalogId: printing, tcg: item.tcg, limit: FETCH_LIMIT })).items

  return offersOfSameCard(
    item,
    candidates.filter((i) => i.status === 'active'),
  )
}
