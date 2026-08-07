/**
 * Modelo declarativo de los filtros del catálogo (TASK-057).
 *
 * Antes de esto, `FilterSidebar.tsx` era un monolito de 377 líneas que
 * inlineaba cinco controles distintos y repetía la regla de "deshabilitado" en
 * cinco sitios. Aquí se invierte: este módulo describe QUÉ filtros existen para
 * el juego activo, con qué control se pintan, en qué zona van y qué valores
 * están disponibles; los componentes solo despachan sobre esa descripción.
 * Sumar una faceta pasa a ser declararla en `game-filters.ts`, no editar UI.
 *
 * Módulo puro por decisión: sin React, sin `next-intl`, sin `window`. Vitest
 * excluye los `.tsx` de la suite (ver `vitest.config.ts`), así que toda la
 * lógica que merece test vive en `.ts`. Este módulo NUNCA localiza: expone
 * claves i18n y deja las etiquetas ya derivadas que le pasa el llamador.
 */
import type { Condition, Tcg } from '@thepubmarket/shared'
import { CONDITIONS } from '@thepubmarket/shared'
import { FILTER_LANGUAGES } from './display'
import { FACET_PRESENTATION } from './facet-presentation'
import type { GameFacet } from './game-filters'
import type { LocalFilters } from './local-filters'

/** Control con el que se pinta un filtro. */
export type FilterControlKind = 'pips' | 'tiles' | 'ints' | 'select' | 'switch' | 'range'

/**
 * Zona de la consola donde vive el filtro:
 * - `identity`: la faceta firma del juego (pips de maná, runas de dominio).
 *   Va inline y a color; es lo único cromático del riel.
 * - `card`: el resto de facetas propias del juego (tipo, rareza, set…).
 * - `offer`: filtros de la oferta, no de la carta (condición, idioma, foil,
 *   precio). Existen para los seis juegos, con o sin facetas propias.
 */
export type FilterZone = 'identity' | 'card' | 'offer'

/** De dónde sale el valor: filtro local (`history.replaceState`) o faceta de
 * juego (`router.push`). Los dos canales de URL de TASK-053 no se mezclan. */
export type FilterSource = 'local' | 'game'

export interface FilterValue {
  value: string
  /**
   * Etiqueta ya derivada por el llamador (hoy solo `set`: "Modern Horizons 2
   * (MH2)"). Ausente ⇒ el componente muestra `value` tal cual.
   */
  label?: string
  count: number
  selected: boolean
  /**
   * Regla ÚNICA de deshabilitado: `count === 0 && !selected`. Un valor ya
   * seleccionado nunca se deshabilita, o el usuario no podría quitarlo
   * (TASK-054 AC#2). Antes estaba copiada en `FilterSidebar` (×2),
   * `GameFacetSection`, `FacetTile` y `PipRow`.
   */
  disabled: boolean
}

export interface FilterDescriptor {
  /** `cond` | `lang` | `foil` | `price`, o el param de la faceta de juego. */
  id: string
  source: FilterSource
  kind: FilterControlKind
  zone: FilterZone
  /** Clave i18n (namespace `catalog`) del título del popover / de la sección. */
  labelKey: string
  /**
   * Clave corta para el trigger de la consola. Existe porque `fPrice` es
   * "Rango de precio (MXN)" y no cabe en un botón de riel. Ausente ⇒ el
   * trigger usa `labelKey`.
   */
  triggerLabelKey?: string
  /** Vocabulario con conteos. Vacío para `range`; un solo elemento (el conteo
   * de foil disponible) para `switch`. */
  values: FilterValue[]
  selectedCount: number
  /** Solo `range`: los strings crudos del input, que no son derivables de `values`. */
  range?: { minPesos: string; maxPesos: string }
  /** Solo `ints`: rango inclusivo declarado por la faceta (energy/might 0-12). */
  intRange?: { min: number; max: number }
  /**
   * Ancho estimado del trigger en px. ESTÁTICO a propósito: si dependiera de
   * `selectedCount`, seleccionar un valor podría empujar su propio trigger a
   * overflow con el popover abierto. Por eso el badge de selección se pinta
   * fuera de flujo.
   */
  estWidth: number
  /** Hacia dónde alinear el panel para que no se salga por la derecha. Se
   * deriva del offset acumulado en la fila, sin medir nada en runtime. */
  align: 'start' | 'end'
}

export interface FilterModel {
  /** Faceta firma del juego activo, o `null` si el juego no declara ninguna
   * con `layout: 'pips'` (los cuatro juegos sin facetas propias, y cualquier
   * juego cuyo registro de presentación no marque identidad). */
  identity: FilterDescriptor | null
  /** Triggers de la fila 1, en orden de render. */
  inline: FilterDescriptor[]
  /** Los que no caben en el presupuesto; se apilan en el popover "Más filtros". */
  overflow: FilterDescriptor[]
  /** Todos en orden canónico. Es lo que consume el sheet mobile, que los
   * apila en vertical y no tiene presupuesto horizontal que respetar. */
  all: FilterDescriptor[]
  /** Badge del trigger de overflow. */
  overflowSelectedCount: number
  /** Suma de selecciones de TODOS los filtros. No incluye `game` ni `q`: eso
   * lo suma `CatalogView`, que es quien conoce esos dos. */
  totalSelectedCount: number
}

export interface BuildFilterModelInput {
  activeGame: Tcg | undefined
  /**
   * Salida de `facetsFor(activeGame)`. Su ORDEN ESTÁ CONGELADO por tests
   * (`game-filters.test.ts`): este módulo asigna zona y prioridad, pero
   * jamás reordena lo que recibe.
   */
  gameFacets: readonly GameFacet[]
  local: Pick<LocalFilters, 'conditions' | 'languages' | 'foilOnly' | 'minPesos' | 'maxPesos'>
  /** `gameFilters` de `CatalogView`: param -> valores seleccionados. */
  gameSelections: Record<string, string[]>
  /* --- conteos YA calculados por CatalogView; aquí no se recomputa nada --- */
  conditionCounts: Record<Condition, number>
  languageCounts: Record<string, number>
  foilCount: number
  gameFacetCounts: Record<string, Record<string, number>>
  /** Opciones de las facetas de texto libre (hoy solo `set`), derivadas de los
   * items cargados por `CatalogView`. */
  freeTextOptions: Record<string, { value: string; label: string }[]>
  /** Presupuesto horizontal de la fila 1, en px. */
  budgetPx?: number
  /** Tope de facetas de juego inline, además de la de identidad. */
  maxInlineCardFacets?: number
}

/**
 * Presupuesto de la consola, en px. Todo esto es aritmética de layout hecha a
 * mano en vez de `ResizeObserver`: medir en runtime obligaría a un primer
 * render con el reparto equivocado y a re-shuffles visibles al cambiar de
 * juego. Los números salen del contenedor real: `main` es `max-w-[1280px]`
 * con `sm:px-6`, o sea 1232px de ancho útil.
 */
export const CONSOLE_BUDGET_PX = 1200
/** Coste por carácter de la etiqueta del trigger (Rajdhani 600, 13px,
 * uppercase con `tracking-[0.06em]`). */
const CHAR_PX = 7.8
/** Cromo fijo del trigger: padding horizontal + gap + chevron. */
const TRIGGER_CHROME_PX = 38
/** Gap entre triggers (`gap-2`). */
const GAP_PX = 8
/** Hairline de separación entre zonas, con su margen a cada lado. */
const ZONE_SEPARATOR_PX = 25
/** Ancho de un pip en la variante de riel (más compacto que en el sheet). */
const PIP_PX = 30
/** Ancho reservado para el trigger "Más filtros" cuando hay overflow. */
const OVERFLOW_TRIGGER_PX = 132
/** Tope por defecto de facetas de juego inline, además de la de identidad. */
const MAX_INLINE_CARD_FACETS = 3

/**
 * Longitud de etiqueta usada para estimar anchos. Es la del texto más largo
 * entre español e inglés, para que el reparto inline/overflow no cambie al
 * cambiar de idioma — un usuario en inglés y otro en español tienen que ver
 * la misma consola.
 */
const LABEL_CHARS: Record<string, number> = {
  fCondition: 9, // Condición / Condition
  fLanguage: 8, // Idioma / Language
  fPriceShort: 6, // Precio / Price
  fFoil: 9, // Solo Foil / Foil only
  fColor: 5, // Color
  fDomain: 7, // Dominio / Domain
  fType: 4, // Tipo / Type
  fSupertype: 9, // Supertipo / Supertype
  fRarity: 6, // Rareza / Rarity
  fEnergy: 7, // Energía / Energy
  fMight: 7, // Poderío / Might
  fSet: 3, // Set
}
/** Fallback para una faceta nueva sin entrada en `LABEL_CHARS`: se asume la
 * etiqueta más larga que hoy existe, para no sobrevender el espacio libre. */
const FALLBACK_LABEL_CHARS = 9

function triggerWidth(labelKey: string): number {
  return Math.round(TRIGGER_CHROME_PX + (LABEL_CHARS[labelKey] ?? FALLBACK_LABEL_CHARS) * CHAR_PX)
}

/** Ancho de la fila de pips: se renderiza SIEMPRE el vocabulario completo,
 * incluidos los deshabilitados, así que no depende de la selección. */
export function pipsWidth(valueCount: number): number {
  if (valueCount <= 0) return 0
  return valueCount * PIP_PX + (valueCount - 1) * GAP_PX
}

/** La regla de deshabilitado, en un único sitio. */
function toValues(
  vocabulary: readonly string[],
  counts: Record<string, number>,
  selected: readonly string[],
  labels?: Record<string, string>,
): FilterValue[] {
  return vocabulary.map((value) => {
    const count = counts[value] ?? 0
    const isSelected = selected.includes(value)
    return {
      value,
      label: labels?.[value],
      count,
      selected: isSelected,
      disabled: count === 0 && !isSelected,
    }
  })
}

function controlKindFor(facet: GameFacet, isIdentity: boolean): FilterControlKind {
  if (isIdentity) return 'pips'
  if (facet.kind === 'multiInt') return 'ints'
  if (facet.kind === 'freeText') return 'select'
  return 'tiles'
}

/**
 * ¿Es esta la faceta de identidad del juego? Lo decide el registro de
 * presentación (`layout: 'pips'`), nunca el nombre del juego — mismo criterio
 * que TASK-052/054: un juego nuevo obtiene zona de identidad declarándola,
 * sin tocar un solo componente.
 */
function isIdentityFacet(activeGame: Tcg | undefined, facet: GameFacet): boolean {
  if (!activeGame || facet.kind !== 'multiValue') return false
  return FACET_PRESENTATION[activeGame]?.[facet.param]?.layout === 'pips'
}

function gameDescriptor(
  facet: GameFacet,
  input: BuildFilterModelInput,
  isIdentity: boolean,
): FilterDescriptor {
  const selected = input.gameSelections[facet.param] ?? []
  const counts = input.gameFacetCounts[facet.param] ?? {}

  let vocabulary: readonly string[]
  let labels: Record<string, string> | undefined
  let intRange: { min: number; max: number } | undefined

  if (facet.kind === 'multiInt') {
    const min = facet.min ?? 0
    const max = facet.max ?? 12
    vocabulary = Array.from({ length: max - min + 1 }, (_, i) => String(min + i))
    intRange = { min, max }
  } else if (facet.kind === 'freeText') {
    const options = input.freeTextOptions[facet.param] ?? []
    vocabulary = options.map((o) => o.value)
    labels = Object.fromEntries(options.map((o) => [o.value, o.label]))
  } else {
    vocabulary = facet.values ?? []
  }

  return {
    id: facet.param,
    source: 'game',
    kind: controlKindFor(facet, isIdentity),
    zone: isIdentity ? 'identity' : 'card',
    labelKey: facet.labelKey,
    values: toValues(vocabulary, counts, selected, labels),
    selectedCount: selected.length,
    intRange,
    estWidth: isIdentity ? pipsWidth(vocabulary.length) : triggerWidth(facet.labelKey),
    align: 'start',
  }
}

/**
 * Los cuatro filtros de oferta. Existen siempre, con o sin juego activo, y
 * van siempre inline: son los únicos comunes a los seis TCGs, así que la
 * consola nunca se queda vacía aunque el juego no declare facetas propias.
 */
function offerDescriptors(input: BuildFilterModelInput): FilterDescriptor[] {
  const { local } = input
  const priceSelected = local.minPesos !== '' || local.maxPesos !== ''

  return [
    {
      id: 'cond',
      source: 'local',
      kind: 'tiles',
      zone: 'offer',
      labelKey: 'fCondition',
      values: toValues(CONDITIONS, input.conditionCounts, local.conditions),
      selectedCount: local.conditions.length,
      estWidth: triggerWidth('fCondition'),
      align: 'start',
    },
    {
      id: 'lang',
      source: 'local',
      kind: 'tiles',
      zone: 'offer',
      labelKey: 'fLanguage',
      values: toValues(FILTER_LANGUAGES, input.languageCounts, local.languages),
      selectedCount: local.languages.length,
      estWidth: triggerWidth('fLanguage'),
      align: 'start',
    },
    {
      id: 'price',
      source: 'local',
      kind: 'range',
      zone: 'offer',
      labelKey: 'fPrice',
      triggerLabelKey: 'fPriceShort',
      values: [],
      selectedCount: priceSelected ? 1 : 0,
      range: { minPesos: local.minPesos, maxPesos: local.maxPesos },
      estWidth: triggerWidth('fPriceShort'),
      align: 'start',
    },
    {
      id: 'foil',
      source: 'local',
      kind: 'switch',
      zone: 'offer',
      labelKey: 'fFoil',
      // Un único valor: el conteo de foil disponible. `selected` refleja el
      // toggle, así que la regla de disabled también aplica aquí (foil sin
      // stock y sin seleccionar ⇒ no se puede activar).
      values: toValues(['foil'], { foil: input.foilCount }, local.foilOnly ? ['foil'] : []),
      selectedCount: local.foilOnly ? 1 : 0,
      estWidth: triggerWidth('fFoil'),
      align: 'start',
    },
  ]
}

/**
 * Construye el modelo completo y reparte los triggers entre la fila 1 y el
 * popover de overflow con un presupuesto fijo.
 *
 * El reparto es determinista y estable: no depende de mediciones, ni del
 * idioma, ni de cuántos valores lleve seleccionados el usuario. Eso último es
 * lo que evita el peor bug posible aquí — que marcar un valor mueva su propio
 * trigger al overflow y le cierre el popover en la cara.
 */
export function buildFilterModel(input: BuildFilterModelInput): FilterModel {
  const budget = input.budgetPx ?? CONSOLE_BUDGET_PX
  const maxInlineCard = input.maxInlineCardFacets ?? MAX_INLINE_CARD_FACETS
  const { activeGame, gameFacets } = input

  // El orden de `gameFacets` viene congelado por `facetsFor`; solo se separa
  // la faceta de identidad, sin alterar el orden relativo del resto.
  let identity: FilterDescriptor | null = null
  const cardPool: FilterDescriptor[] = []
  for (const facet of gameFacets) {
    const isIdentity = identity === null && isIdentityFacet(activeGame, facet)
    const descriptor = gameDescriptor(facet, input, isIdentity)
    if (isIdentity) identity = descriptor
    else cardPool.push(descriptor)
  }

  const offer = offerDescriptors(input)
  const offerWidth = offer.reduce((sum, d, i) => sum + d.estWidth + (i > 0 ? GAP_PX : 0), 0)

  const separators = (identity ? 1 : 0) + (cardPool.length > 0 ? 1 : 0)
  const fixedCost = (identity?.estWidth ?? 0) + separators * ZONE_SEPARATOR_PX + offerWidth

  // Pre-chequeo barato: si ya sabemos que sobran facetas por el tope, hay que
  // reservar el ancho del trigger "Más filtros" antes de repartir.
  const fitCardFacets = (reserveOverflow: boolean): number => {
    const available = budget - fixedCost - (reserveOverflow ? OVERFLOW_TRIGGER_PX + GAP_PX : 0)
    let used = 0
    let fitted = 0
    for (const descriptor of cardPool) {
      if (fitted >= maxInlineCard) break
      const next = used + descriptor.estWidth + (fitted > 0 ? GAP_PX : 0)
      if (next > available) break
      used = next
      fitted += 1
    }
    return fitted
  }

  let inlineCardCount = fitCardFacets(cardPool.length > maxInlineCard)
  // Si la reserva resultó innecesaria (todo cupo igualmente), se recalcula una
  // sola vez sin ella para no regalar espacio.
  if (cardPool.length > maxInlineCard && inlineCardCount === cardPool.length) {
    inlineCardCount = fitCardFacets(false)
  }

  const inlineCards = cardPool.slice(0, inlineCardCount)
  const overflow = cardPool.slice(inlineCardCount)
  const inline = [...inlineCards, ...offer]

  // `align`: los triggers que arrancan pasada la mitad del riel abren su panel
  // hacia la izquierda, para que no se salga por el borde derecho.
  let offset = (identity?.estWidth ?? 0) + separators * ZONE_SEPARATOR_PX
  for (const descriptor of inline) {
    descriptor.align = offset > budget / 2 ? 'end' : 'start'
    offset += descriptor.estWidth + GAP_PX
  }

  const all = [...(identity ? [identity] : []), ...cardPool, ...offer]

  return {
    identity,
    inline,
    overflow,
    all,
    overflowSelectedCount: overflow.reduce((sum, d) => sum + d.selectedCount, 0),
    totalSelectedCount: all.reduce((sum, d) => sum + d.selectedCount, 0),
  }
}
