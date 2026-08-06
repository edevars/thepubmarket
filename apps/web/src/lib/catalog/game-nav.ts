/**
 * Deriva las entradas de navegación por juego para el header (TASK-041) a
 * partir de la lista canónica de TCGs (`TCGS`, `@thepubmarket/shared`) y del
 * conteo de inventario activo por juego. Único punto donde se decide "qué
 * juegos mostramos y a dónde llevan" — nada de JSX ni links hardcodeados por
 * juego en los componentes del header. Un juego sin inventario se marca
 * `available: false` (los componentes lo pintan como "Pronto", sin link),
 * mismo criterio que `BrowseByGame` en la home.
 */
import type { CatalogGameCount, Tcg } from '@thepubmarket/shared'
import { TCGS } from '@thepubmarket/shared'
import { TCG_META } from './display'

export interface GameNavItem {
  tcg: Tcg
  /** Nombre propio del juego (TCG_META), no se traduce. */
  label: string
  href: string
  /** false si el juego no tiene inventario activo (aún) — no lleva a ningún lado. */
  available: boolean
}

/** Entradas de navegación para cada TCG soportado, en el orden canónico de `TCGS`. */
export function getGameNavItems(gameCounts: readonly CatalogGameCount[]): GameNavItem[] {
  const counts = new Map(gameCounts.map(({ tcg, count }) => [tcg, count]))
  return TCGS.map((tcg) => ({
    tcg,
    label: TCG_META[tcg].name,
    href: `/catalog?game=${tcg}`,
    available: (counts.get(tcg) ?? 0) > 0,
  }))
}
