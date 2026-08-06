/**
 * Filtrado del inventario del Panel del Vendedor. Helpers puros para poder
 * probar la lógica sin montar `InventoryView` (mismo criterio que
 * `lib/catalog/game-filters.ts`).
 */
import type { Condition, InventoryItem, Tcg } from '@thepubmarket/shared'

export interface InventoryFilterState {
  q: string
  games: Tcg[]
  conds: Condition[]
}

/**
 * Juegos con al menos un item en el inventario COMPLETO del seller (nunca el
 * ya filtrado): el chip de un juego aparece en cuanto el seller tiene stock
 * de él y sigue visible aunque la búsqueda o los filtros de condición dejen
 * el resultado visible en cero — así el chip no "parpadea" a media
 * interacción. `order` fija el orden de aparición (usar `TCGS`).
 *
 * Un seller sin Riftbound simplemente no ve el chip: es DELIBERADO, no un
 * bug — filtrar a un juego sin ningún single publicado no tendría resultado
 * posible y solo añadiría ruido al toolbar. En cuanto publica su primer
 * single Riftbound (TASK-043), el chip aparece solo, sin configuración.
 */
export function presentGames(items: InventoryItem[], order: readonly Tcg[]): Tcg[] {
  return order.filter((g) => items.some((i) => i.tcg === g))
}

/** Aplica búsqueda por nombre + filtros de juego/condición (AND entre grupos, OR dentro de cada uno). */
export function filterInventory(
  items: InventoryItem[],
  filters: InventoryFilterState,
): InventoryItem[] {
  const query = filters.q.trim().toLowerCase()
  return items.filter((item) => {
    if (query && !item.card.name.toLowerCase().includes(query)) return false
    if (filters.games.length > 0 && !filters.games.includes(item.tcg)) return false
    if (filters.conds.length > 0 && !filters.conds.includes(item.condition)) return false
    return true
  })
}
