/**
 * Registro cliente de filtros propios de cada juego (TASK-040). Espejo del
 * registro del Worker (`apps/api/src/lib/catalog-filters.ts`, TASK-039):
 * mismos nombres de param y semántica (OR entre valores de un mismo param,
 * AND entre params distintos), para que sumar un juego nuevo (p.ej. colores
 * de MTG) sea agregar una entrada aquí — no reescribir `FilterSidebar` ni
 * `CatalogView`.
 *
 * Los valores viajan tal cual a `GET /catalog` (ver `lib/api.ts`): la API ya
 * valida/normaliza casing (TASK-039), así que aquí solo filtramos lo
 * evidentemente inválido (fuera de vocabulario, fuera de rango) para no
 * mandar una query que la API rechace con 400 y tumbe el render del server
 * component — un valor corrupto en la URL se ignora, igual que un `game`
 * desconocido (ver `catalog/page.tsx`).
 */
import type { InventoryItem, MtgAttributes, RiftboundAttributes, Tcg } from '@thepubmarket/shared'
import {
  MTG_CARD_TYPES,
  MTG_COLORS,
  MTG_RARITIES,
  RIFTBOUND_CARD_TYPES,
  RIFTBOUND_DOMAINS,
  RIFTBOUND_RARITIES,
  RIFTBOUND_SUPERTYPES,
} from '@thepubmarket/shared'

/** Tipo de control a renderizar para una faceta. */
export type FacetKind = 'multiValue' | 'multiInt' | 'freeText'

export interface GameFacet {
  /** Nombre del query param — coincide 1:1 con el contrato de la API. */
  param: string
  kind: FacetKind
  /** Vocabulario canónico, solo para `multiValue`. */
  values?: readonly string[]
  /** Rango inclusivo, solo para `multiInt`. */
  min?: number
  max?: number
  /** Clave i18n (namespace `catalog`) del título de la sección. */
  labelKey: string
  /** Valores que aporta un item a esta faceta (para contar/filtrar en cliente). */
  valuesOf: (item: InventoryItem) => string[]
}

function riftboundAttrs(item: InventoryItem): RiftboundAttributes | null {
  const attrs = item.card.gameAttributes
  return attrs && attrs.tcg === 'riftbound' ? attrs : null
}

/** Espejo de `riftboundAttrs` para MTG (TASK-051) — misma narrowing por `tcg`. */
function mtgAttrs(item: InventoryItem): MtgAttributes | null {
  const attrs = item.card.gameAttributes
  return attrs && attrs.tcg === 'mtg' ? attrs : null
}

/**
 * Registro por juego. `set` es técnicamente genérico en la API (no requiere
 * `tcg`, ver `catalog-filters.ts`), pero en la UI cada juego lo ofrece junto
 * al resto de sus propias facetas.
 */
export const GAME_FACETS: Partial<Record<Tcg, readonly GameFacet[]>> = {
  riftbound: [
    {
      param: 'domain',
      kind: 'multiValue',
      values: RIFTBOUND_DOMAINS,
      labelKey: 'fDomain',
      valuesOf: (item) => riftboundAttrs(item)?.domains ?? [],
    },
    {
      param: 'type',
      kind: 'multiValue',
      values: RIFTBOUND_CARD_TYPES,
      labelKey: 'fType',
      valuesOf: (item) => {
        const t = riftboundAttrs(item)?.type
        return t ? [t] : []
      },
    },
    {
      param: 'supertype',
      kind: 'multiValue',
      values: RIFTBOUND_SUPERTYPES,
      labelKey: 'fSupertype',
      valuesOf: (item) => {
        const s = riftboundAttrs(item)?.supertype
        return s ? [s] : []
      },
    },
    {
      param: 'rarity',
      kind: 'multiValue',
      values: RIFTBOUND_RARITIES,
      labelKey: 'fRarity',
      valuesOf: (item) => (item.card.rarity ? [item.card.rarity] : []),
    },
    {
      // Rango real de la API es 0-99; el juego solo usa 0-12, así que la UI
      // (y la validación de la URL) se acota a lo jugable.
      param: 'energy',
      kind: 'multiInt',
      min: 0,
      max: 12,
      labelKey: 'fEnergy',
      valuesOf: (item) => {
        const e = riftboundAttrs(item)?.energy
        return e != null ? [String(e)] : []
      },
    },
    {
      param: 'might',
      kind: 'multiInt',
      min: 0,
      max: 12,
      labelKey: 'fMight',
      valuesOf: (item) => {
        const m = riftboundAttrs(item)?.might
        return m != null ? [String(m)] : []
      },
    },
    {
      param: 'set',
      kind: 'freeText',
      labelKey: 'fSet',
      valuesOf: (item) => [item.card.setCode],
    },
  ],
  // MTG (TASK-051): `type`/`rarity`/`set` reusan los mismos nombres de param
  // que Riftbound, cada uno con su propio vocabulario — la API ya soporta
  // esta superposición (ver ALL_GAME_PARAMS en catalog-filters.ts); el fix
  // de `facetByParam` de abajo es lo que la hace segura también en el cliente.
  mtg: [
    {
      param: 'color',
      kind: 'multiValue',
      values: MTG_COLORS,
      labelKey: 'fColor',
      valuesOf: (item) => mtgAttrs(item)?.colors ?? [],
    },
    {
      param: 'type',
      kind: 'multiValue',
      values: MTG_CARD_TYPES,
      labelKey: 'fType',
      valuesOf: (item) => mtgAttrs(item)?.types ?? [],
    },
    {
      param: 'rarity',
      kind: 'multiValue',
      values: MTG_RARITIES,
      labelKey: 'fRarity',
      valuesOf: (item) => (item.card.rarity ? [item.card.rarity] : []),
    },
    {
      param: 'set',
      kind: 'freeText',
      labelKey: 'fSet',
      valuesOf: (item) => [item.card.setCode],
    },
  ],
}

const EMPTY_FACETS: readonly GameFacet[] = []

/** Facetas registradas para un juego (arreglo vacío si no tiene). */
export function facetsFor(tcg: Tcg | undefined): readonly GameFacet[] {
  return (tcg && GAME_FACETS[tcg]) || EMPTY_FACETS
}

/**
 * Busca una faceta por nombre de param DENTRO del registro de un solo juego
 * (TASK-051). Antes recorría `Object.values(GAME_FACETS)` completo y
 * devolvía el primer match sin importar el juego que lo registró — inofensivo
 * mientras solo Riftbound tenía facetas, pero en cuanto MTG también registró
 * `type`/`rarity`/`set` (mismos nombres, vocabularios distintos, ver arriba)
 * un item de un juego podía evaluarse con el `valuesOf` del OTRO juego. Se
 * acota a `facetsFor(tcg)` para que cada item solo vea las facetas de su
 * propio juego.
 */
function facetByParam(tcg: Tcg | undefined, param: string): GameFacet | undefined {
  return facetsFor(tcg).find((f) => f.param === param)
}

/**
 * Junta valores repetidos (`?domain=Fury&domain=Order`) y separados por coma
 * (`?domain=Fury,Order`), recorta espacios y descarta vacíos — misma regla
 * que `collectValues` en la API.
 */
function normalizeRaw(raw: string | string[] | undefined): string[] {
  if (raw == null) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/** Empareja `value` (case-insensitive) contra el vocabulario canónico, o null. */
function matchCanonical(value: string, values: readonly string[]): string | null {
  const lower = value.toLowerCase()
  return values.find((v) => v.toLowerCase() === lower) ?? null
}

/**
 * Valida y normaliza los params de faceta presentes en la URL para el juego
 * activo. Solo se leen las facetas registradas para `tcg` — si `tcg` no es
 * Riftbound (o está ausente), `facetsFor` devuelve `[]` y el resultado es
 * `{}`, que es justo lo que hace que un cambio/limpieza de juego "purgue" los
 * filtros propios de Riftbound sin código extra (AC#3).
 */
export function parseGameFiltersFromSearchParams(
  tcg: Tcg | undefined,
  searchParams: Record<string, string | string[] | undefined>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const facet of facetsFor(tcg)) {
    const raw = normalizeRaw(searchParams[facet.param])
    if (raw.length === 0) continue

    if (facet.kind === 'multiInt') {
      const min = facet.min ?? 0
      const max = facet.max ?? 99
      const ints = raw
        .filter((v) => /^\d+$/.test(v))
        .map(Number)
        .filter((n) => n >= min && n <= max)
      if (ints.length > 0) result[facet.param] = [...new Set(ints)].map(String)
      continue
    }

    if (facet.kind === 'freeText') {
      // Sin vocabulario que validar; la API hace match exacto por columna.
      // Un solo valor: no hay semántica OR para `set` en el contrato actual.
      const [first] = raw
      if (first) result[facet.param] = [first]
      continue
    }

    const canonical = raw
      .map((v) => matchCanonical(v, facet.values ?? []))
      .filter((v): v is string => v !== null)
    if (canonical.length > 0) result[facet.param] = [...new Set(canonical)]
  }
  return result
}

/** Serializa `game` a una clave estable (orden de param y de valores fijo). */
export function serializeGameFilters(game: Record<string, string[]>): string {
  return Object.keys(game)
    .sort()
    .map((param) => `${param}=${[...(game[param] ?? [])].sort().join(',')}`)
    .join('&')
}

/**
 * ¿El item matchea los filtros de juego activos? OR dentro de cada param, AND
 * entre params — misma semántica que `parseGameFilters` en la API. Existe
 * para que mocks y listas ya cargadas se comporten como la API (ver el
 * comentario de cabecera de `applyFilters` en `catalog/data.ts`).
 */
export function matchesGameFilters(item: InventoryItem, game: Record<string, string[]>): boolean {
  for (const [param, selected] of Object.entries(game)) {
    if (selected.length === 0) continue
    const facet = facetByParam(item.tcg, param)
    if (!facet) continue
    const itemValues = facet.valuesOf(item).map((v) => v.toLowerCase())
    const selectedLower = selected.map((v) => v.toLowerCase())
    if (!itemValues.some((v) => selectedLower.includes(v))) return false
  }
  return true
}
