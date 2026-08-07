/**
 * Registro de presentación de facetas (TASK-052), paralelo al registro
 * funcional `GAME_FACETS` de `game-filters.ts`. Mapea tcg+param+value a
 * icono y color identidad (pips de maná, hexágonos de dominio) para que el
 * sidebar los pinte sin que `game-filters.ts` deje de ser genérico (ver
 * docs/ingenieria/catalogo-multijuego.md §6/§8) — agregar un juego nuevo a la
 * UI no debería requerir tocar la lógica de parseo/matching de filtros.
 *
 * Módulo puro, sin imports de React: vitest excluye `.tsx` de cobertura, así
 * que este archivo se queda en `.ts` para poder testearse al 100%. Los
 * componentes que lo consuman (sidebar) importan solo funciones/datos de
 * aquí, nunca al revés.
 *
 * Una entrada faltante (juego, param o valor sin registrar) SIEMPRE degrada
 * a la tile plana de siempre — `presentationFor`/`accentFor` nunca lanzan,
 * devuelven `undefined` ante cualquier miss.
 */
import type { Tcg } from '@thepubmarket/shared'

/** Layout sugerido para renderizar los valores de una faceta. */
export type FacetLayout = 'pips' | 'tiles'

/** Icono y/o color identidad de un valor puntual de faceta (p.ej. 'W', 'Fury'). */
export interface FacetValuePresentation {
  /** Ruta pública del icono (bajo `/symbols/...`, ver TASK-048). */
  icon?: string
  /** Color identidad en hex de 6 dígitos. */
  hex?: string
}

/** Presentación de una faceta completa (todos sus valores + layout sugerido). */
export interface FacetPresentation {
  layout?: FacetLayout
  values: Record<string, FacetValuePresentation>
}

/**
 * Registro tcg -> param -> presentación. Solo cubre las facetas que de
 * verdad tienen identidad visual propia (colores/dominios/rarezas); el resto
 * de facetas de `GAME_FACETS` (type, supertype, set, energy, might) no
 * tienen entrada aquí a propósito y caen en la tile plana.
 */
export const FACET_PRESENTATION: Partial<Record<Tcg, Record<string, FacetPresentation>>> = {
  mtg: {
    // Pips de maná (layout 'pips'): hexes ajustados para fondo oscuro, no los
    // oficiales de Wizards a secas — ver TASK-052.
    color: {
      layout: 'pips',
      values: {
        W: { icon: '/symbols/mtg/W.svg', hex: '#e9e7d7' },
        U: { icon: '/symbols/mtg/U.svg', hex: '#4e8fd1' },
        B: { icon: '/symbols/mtg/B.svg', hex: '#9a8fa8' },
        R: { icon: '/symbols/mtg/R.svg', hex: '#d3583c' },
        G: { icon: '/symbols/mtg/G.svg', hex: '#4aa66a' },
        C: { icon: '/symbols/mtg/C.svg', hex: '#a7b0b6' },
      },
    },
    // Sin icono propio (no hay set de símbolos de rareza de MTG en TASK-048),
    // solo color identidad — la tile cae a texto + swatch de color.
    rarity: {
      values: {
        common: { hex: '#9fa8ad' },
        uncommon: { hex: '#b3c4d3' },
        rare: { hex: '#d4b95e' },
        mythic: { hex: '#e06a33' },
      },
    },
  },
  riftbound: {
    // Hexes oficiales extraídos del bundle de riftbound.gg. `layout: 'pips'`
    // (TASK-057) marca esta faceta como la IDENTIDAD del juego: es la que la
    // consola de filtros saca del popover y renderiza inline y a color. Los 7
    // dominios ya traen icono + hex, así que no hace falta ningún asset nuevo.
    domain: {
      layout: 'pips',
      values: {
        Fury: { icon: '/symbols/riftbound/domain/fury.svg', hex: '#c13b3b' },
        Calm: { icon: '/symbols/riftbound/domain/calm.svg', hex: '#4fae6b' },
        Mind: { icon: '/symbols/riftbound/domain/mind.svg', hex: '#5b7bbd' },
        Body: { icon: '/symbols/riftbound/domain/body.svg', hex: '#e2b06a' },
        Chaos: { icon: '/symbols/riftbound/domain/chaos.svg', hex: '#8d5bbd' },
        Order: { icon: '/symbols/riftbound/domain/order.svg', hex: '#f3d96b' },
        Colorless: { icon: '/symbols/riftbound/domain/colorless.svg', hex: '#98a2a8' },
      },
    },
    // 'showcase' es un valor válido de RIFTBOUND_RARITIES pero TASK-048 no
    // bajó icono para él (gap conocido) — sin entrada aquí, cae a texto.
    rarity: {
      values: {
        common: { icon: '/symbols/riftbound/rarity/common.svg' },
        uncommon: { icon: '/symbols/riftbound/rarity/uncommon.svg' },
        rare: { icon: '/symbols/riftbound/rarity/rare.svg' },
        epic: { icon: '/symbols/riftbound/rarity/epic.svg' },
      },
    },
  },
}

/**
 * Color de acento por juego (usado como `--game-accent` en el sidebar). Solo
 * mtg/riftbound tienen identidad definida hoy; los demás juegos devuelven
 * `undefined` de `accentFor` y el CSS cae al acento neutro por defecto.
 */
export const GAME_ACCENT: Partial<Record<Tcg, string>> = {
  mtg: '#d9a92f',
  riftbound: '#e0653a',
}

/**
 * Presentación de un valor puntual de faceta, o `undefined` si no hay
 * entrada registrada (tcg desconocido, param sin presentación, o valor sin
 * icono/color propio). Nunca lanza — se puede llamar con cualquier string
 * suelto que venga de la URL sin validar antes.
 */
export function presentationFor(
  tcg: Tcg | string | undefined,
  param: string | undefined,
  value: string | undefined,
): FacetValuePresentation | undefined {
  if (!tcg || !param || !value) return undefined
  const gameFacets = FACET_PRESENTATION[tcg as Tcg]
  if (!gameFacets) return undefined
  const facet = gameFacets[param]
  if (!facet) return undefined
  return facet.values[value]
}

/** Color de acento del juego, o `undefined` si no tiene identidad definida. */
export function accentFor(tcg: Tcg | string | undefined): string | undefined {
  if (!tcg) return undefined
  return GAME_ACCENT[tcg as Tcg]
}
