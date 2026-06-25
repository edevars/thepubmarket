/**
 * Frontera de acceso a datos del catálogo. HOY devuelve mocks; en una sesión
 * futura estas mismas funciones llamarán a `apps/api` (GET /catalog). El resto
 * de la app NO debe importar `mock-data` directamente: solo este módulo.
 *
 * Las firmas son `async` a propósito para que el cambio a la API real no toque
 * a los consumidores.
 */
import type { Condition, InventoryItem, Tcg } from '@thepubmarket/shared'
import { MOCK_LISTINGS } from './mock-data'

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

/** Lista del catálogo. Sin filtros devuelve todo el inventario activo. */
export async function getCatalog(filters: CatalogFilters = {}): Promise<InventoryItem[]> {
  const active = MOCK_LISTINGS.filter((i) => i.status === 'active')
  return applyFilters(active, filters)
}

/** Detalle de un item por id. Null si no existe / no está activo. */
export async function getItem(id: string): Promise<InventoryItem | null> {
  const item = MOCK_LISTINGS.find((i) => i.id === id && i.status === 'active')
  return item ?? null
}

const FEATURED_IDS = ['ragavan', 'sheoldred', 'charizard', 'luffy', 'teferi']
const NEW_ARRIVAL_IDS = ['sol-ring', 'counterspell', 'elsa', 'blueeyes', 'bolt']

function pickByIds(items: InventoryItem[], ids: string[]): InventoryItem[] {
  return ids
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is InventoryItem => i != null)
}

/** Destacados de la home. */
export async function getFeatured(): Promise<InventoryItem[]> {
  return pickByIds(await getCatalog(), FEATURED_IDS)
}

/** Recién llegados de la home. */
export async function getNewArrivals(): Promise<InventoryItem[]> {
  return pickByIds(await getCatalog(), NEW_ARRIVAL_IDS)
}

/** Cartas en abanico del hero (3, con disponibilidad para evitar overlays). */
export async function getHeroCards(): Promise<InventoryItem[]> {
  return pickByIds(await getCatalog(), ['teferi', 'ragavan', 'charizard'])
}

/** Cartas relacionadas a un item (mismo juego), hasta `limit`. */
export async function getRelated(item: InventoryItem, limit = 4): Promise<InventoryItem[]> {
  const all = await getCatalog()
  const sameGame = all.filter((i) => i.tcg === item.tcg && i.id !== item.id)
  const rest = all.filter((i) => i.tcg !== item.tcg && i.id !== item.id)
  return [...sameGame, ...rest].slice(0, limit)
}
