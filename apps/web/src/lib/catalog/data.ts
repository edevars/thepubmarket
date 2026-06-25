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
import type { Condition, InventoryItem, Tcg } from '@thepubmarket/shared'
import { fetchCatalog, fetchCatalogItem } from '@/lib/api'
import { MOCK_LISTINGS } from './mock-data'

/** Trae todo el inventario activo en una sola página (tope alto de la API). */
const FETCH_LIMIT = 200
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true'

export interface CatalogFilters {
  /** Búsqueda por nombre (substring, case-insensitive). */
  q?: string
  tcgs?: Tcg[]
  conditions?: Condition[]
  /** Idiomas de la impresión ('es' | 'en' | 'jp'). */
  languages?: string[]
  foilOnly?: boolean
  /** Rango de precio en centavos MXN. */
  minCents?: number
  maxCents?: number
}

/** Aplica los filtros sobre una lista ya cargada (reutilizable en cliente). */
export function applyFilters(items: InventoryItem[], f: CatalogFilters): InventoryItem[] {
  const q = f.q?.trim().toLowerCase()
  return items.filter((item) => {
    if (q && !item.card.name.toLowerCase().includes(q)) return false
    if (f.tcgs?.length && !f.tcgs.includes(item.tcg)) return false
    if (f.conditions?.length && !f.conditions.includes(item.condition)) return false
    if (f.languages?.length && !f.languages.includes(item.language)) return false
    if (f.foilOnly && item.finish !== 'foil') return false
    if (f.minCents != null && item.priceCents < f.minCents) return false
    if (f.maxCents != null && item.priceCents > f.maxCents) return false
    return true
  })
}

/** Carga el inventario activo (API real o mocks según el toggle). */
async function loadActive(): Promise<InventoryItem[]> {
  if (USE_MOCKS) return MOCK_LISTINGS.filter((i) => i.status === 'active')
  const { items } = await fetchCatalog({ limit: FETCH_LIMIT })
  return items
}

/** Lista del catálogo. Sin filtros devuelve todo el inventario activo. */
export async function getCatalog(filters: CatalogFilters = {}): Promise<InventoryItem[]> {
  return applyFilters(await loadActive(), filters)
}

/** Detalle de un item por id. Null si no existe / no está activo. */
export async function getItem(id: string): Promise<InventoryItem | null> {
  if (USE_MOCKS) return MOCK_LISTINGS.find((i) => i.id === id && i.status === 'active') ?? null
  return fetchCatalogItem(id)
}

/**
 * Destacados de la home. En Fase 1 son slices del inventario real; la curación
 * manual de destacados es un refinamiento posterior.
 */
export async function getFeatured(): Promise<InventoryItem[]> {
  return (await getCatalog()).slice(0, 5)
}

/** Recién llegados de la home (slice del inventario real). */
export async function getNewArrivals(): Promise<InventoryItem[]> {
  return (await getCatalog()).slice(5, 10)
}

/** Cartas en abanico del hero (3 del inventario real). */
export async function getHeroCards(): Promise<InventoryItem[]> {
  return (await getCatalog()).slice(0, 3)
}

/** Cartas relacionadas a un item (mismo juego primero), hasta `limit`. */
export async function getRelated(item: InventoryItem, limit = 4): Promise<InventoryItem[]> {
  const all = await getCatalog()
  const sameGame = all.filter((i) => i.tcg === item.tcg && i.id !== item.id)
  const rest = all.filter((i) => i.tcg !== item.tcg && i.id !== item.id)
  return [...sameGame, ...rest].slice(0, limit)
}
