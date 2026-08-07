'use client'

import type { CatalogGameCount, Condition, InventoryItem, Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NoResultsState } from '@/components/states/NoResultsState'
import { useRouter } from '@/i18n/navigation'
import { applyFilters, type CatalogFilters } from '@/lib/catalog/data'
import {
  countConditions,
  countFoil,
  countGameFacetValues,
  countLanguages,
  type FacetCountFilters,
} from '@/lib/catalog/facet-counts'
import { accentFor } from '@/lib/catalog/facet-presentation'
import { buildFilterModel } from '@/lib/catalog/filter-model'
import { facetsFor, type GameFacet, serializeGameFilters } from '@/lib/catalog/game-filters'
import {
  applyLocalFiltersToSearchParams,
  EMPTY_LOCAL_FILTERS,
  type LocalFilters,
  type SortOrder,
} from '@/lib/catalog/local-filters'
import { type ActiveChip, ActiveChips } from './ActiveChips'
import { CardGrid } from './CardGrid'
import type { FilterHandlers } from './controls/FilterControl'
import { FilterConsole } from './FilterConsole'
import { GameTabs } from './GameTabs'
import { MobileFilterSheet } from './MobileFilterSheet'

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]
}

/** Label de chip de una faceta de juego: los valores numéricos/libres se prefijan
 * con el nombre corto de la faceta para no leerse ambiguos (p.ej. "3" solo). */
function facetChipLabel(facet: GameFacet, value: string, t: (key: string) => string): string {
  if (facet.kind === 'multiValue') return value
  if (facet.kind === 'freeText') return value.toUpperCase()
  return `${t(facet.labelKey)} ${value}`
}

function pesosToCents(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) * 100 : undefined
}

function priceLabel(minPesos: string, maxPesos: string): string {
  if (minPesos && maxPesos) return `$${minPesos}-$${maxPesos}`
  if (minPesos) return `$${minPesos}+`
  return `$0-$${maxPesos}`
}

/**
 * Orden de un item para `sort=relevance` cuando hay `q`: coincidencias que
 * EMPIEZAN con el término rankean antes que las que solo lo contienen — el
 * resto del orden (API, título ASC) se conserva dentro de cada bucket
 * (`Array.prototype.sort` es estable).
 */
function relevanceRank(name: string, q: string): number {
  const lower = name.toLowerCase()
  if (lower.startsWith(q)) return 0
  if (lower.includes(q)) return 1
  return 2
}

/**
 * Ordena `items` según `sort`. Cliente-side: en Fase 1 el server component ya
 * trae el set completo (≤`FETCH_LIMIT`, ver `lib/catalog/data.ts`) y se
 * filtra/ordena aquí. Cuando llegue paginación real (Fase 5) esto se vuelve
 * un param de la API (`sort=`) en vez de un `.sort()` en cliente.
 */
function sortItems(items: InventoryItem[], sort: SortOrder, q: string): InventoryItem[] {
  if (sort === 'relevance') {
    if (!q) return items // orden de la API (título ASC), sin tocar
    const needle = q.trim().toLowerCase()
    return [...items].sort(
      (a, b) => relevanceRank(a.card.name, needle) - relevanceRank(b.card.name, needle),
    )
  }
  if (sort === 'price_asc') return [...items].sort((a, b) => a.priceCents - b.priceCents)
  if (sort === 'price_desc') return [...items].sort((a, b) => b.priceCents - a.priceCents)
  // 'newest': items sin `createdAt` (snapshots viejos, TASK-049 es aditivo)
  // se tratan como los más antiguos, no se descartan.
  return [...items].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

interface CatalogViewProps {
  items: InventoryItem[]
  initialQuery?: string
  /** Juego activo. Lo filtra el servidor y vive en la URL (`?game=`). */
  activeGame?: Tcg
  /** Conteo por juego sobre TODO el inventario, no solo el juego activo. */
  gameCounts: CatalogGameCount[]
  /**
   * Filtros propios del juego activo ya validados por el server component
   * (TASK-040), p.ej. `{ domain: ['Fury'] }`. Viven en la URL igual que
   * `activeGame` — ver `lib/catalog/game-filters.ts`.
   */
  initialGameFilters?: Record<string, string[]>
  /**
   * Filtros locales (condición/idioma/foil/precio/orden, TASK-053) ya
   * parseados por el server component desde la URL, para que el primer
   * render coincida sin parpadeo. Viven SOLO en cliente después del montaje
   * (`history.replaceState`, ver `writeLocalFilters` abajo) — no disparan
   * fetch al servidor y por eso NO forman parte del `key` que remonta este
   * componente en `catalog/page.tsx`.
   */
  initialLocalFilters?: LocalFilters
}

export function CatalogView({
  items,
  initialQuery = '',
  activeGame,
  gameCounts,
  initialGameFilters,
  initialLocalFilters,
}: CatalogViewProps) {
  const t = useTranslations('catalog')
  const tDetail = useTranslations('detail')
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [gameFilters, setGameFilters] = useState<Record<string, string[]>>(
    () => initialGameFilters ?? {},
  )
  const [localFilters, setLocalFilters] = useState<LocalFilters>(
    () => initialLocalFilters ?? EMPTY_LOCAL_FILTERS,
  )
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  /**
   * Re-sincroniza las facetas de juego cuando la URL cambia SIN remontar este
   * componente. Desde TASK-057 el `key` de `catalog/page.tsx` ya no incluye
   * las facetas (no cambian el fetch del servidor, así que remontar por ellas
   * solo destruía foco, estado de popover y animaciones), de modo que este
   * efecto es lo único que cubre la navegación del historial: Back/Forward
   * entre dos URLs que solo difieren en facetas.
   *
   * En el camino normal (`updateGameFilterValues`) el estado ya se actualizó
   * antes de navegar, así que el serializado coincide, `setGameFilters`
   * devuelve el mismo objeto y React descarta el re-render.
   */
  useEffect(() => {
    const next = initialGameFilters ?? {}
    setGameFilters((current) =>
      serializeGameFilters(current) === serializeGameFilters(next) ? current : next,
    )
  }, [initialGameFilters])
  /** Botón "Filtros" (trigger de `MobileFilterSheet`, TASK-055): recibe el
   * foco de vuelta cuando el sheet se cierra por cualquier vía. */
  const filtersTriggerRef = useRef<HTMLButtonElement>(null)

  const tcgCounts = useMemo(
    () => gameCounts.map(({ tcg, count }) => ({ tcg, count })),
    [gameCounts],
  )

  const activeFacets = useMemo(() => facetsFor(activeGame), [activeGame])

  /**
   * Opciones disponibles para las facetas de texto libre (hoy solo `set`,
   * Riftbound): a diferencia del resto, no tienen vocabulario fijo, así que
   * se derivan de los items cargados. El valor ya seleccionado se conserva
   * aunque el resto de filtros lo haya dejado fuera de `items`, para no
   * "perder" la selección activa del <select>.
   */
  const freeTextOptions = useMemo(() => {
    const byParam: Record<string, { value: string; label: string }[]> = {}
    for (const facet of activeFacets) {
      if (facet.kind !== 'freeText') continue
      const seen = new Map<string, string>()
      for (const item of items) {
        for (const value of facet.valuesOf(item)) {
          if (!seen.has(value)) {
            seen.set(
              value,
              facet.param === 'set' ? `${item.card.setName} (${value.toUpperCase()})` : value,
            )
          }
        }
      }
      for (const value of gameFilters[facet.param] ?? []) {
        if (!seen.has(value)) seen.set(value, value.toUpperCase())
      }
      byParam[facet.param] = [...seen.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    return byParam
  }, [items, activeFacets, gameFilters])

  /**
   * Navega reconstruyendo la URL desde cero (q + game + facetas del juego
   * DESTINO + filtros locales actuales). Al no copiar params de facetas de
   * juego existentes, cambiar o quitar el juego purga cualquier faceta
   * propia de Riftbound automáticamente (AC#3) — nunca hay params
   * "huérfanos" que la API pueda rechazar con 400. Los filtros LOCALES
   * (cond/lang/foil/precio/orden) SÍ se conservan (TASK-053): se leen del
   * estado de React, nunca de `useSearchParams()`, así que no dependen de que
   * el router interno de Next esté sincronizado con mutaciones directas de
   * `history` hechas por `writeLocalFilters`.
   */
  function buildUrl(
    nextGame: Tcg | undefined,
    nextGameFilters: Record<string, string[]>,
    /** `q` destino. Explícito porque quitar la búsqueda tiene que navegar con
     * el valor nuevo, y el `setQ('')` que lo acompaña no se ve todavía en este
     * render. */
    nextQuery: string = q,
  ): string {
    const params = new URLSearchParams()
    if (nextQuery.trim()) params.set('q', nextQuery.trim())
    if (nextGame) {
      params.set('game', nextGame)
      for (const facet of facetsFor(nextGame)) {
        for (const value of nextGameFilters[facet.param] ?? []) params.append(facet.param, value)
      }
    }
    applyLocalFiltersToSearchParams(params, localFilters)
    const qs = params.toString()
    return qs ? `/catalog?${qs}` : '/catalog'
  }

  function navigate(nextGame: Tcg | undefined, nextGameFilters: Record<string, string[]>) {
    // `scroll: false`: sin esto App Router salta al top en cada faceta, lo que
    // con la consola sticky (TASK-057) tira al usuario fuera de la zona del
    // grid que estaba mirando.
    router.push(buildUrl(nextGame, nextGameFilters), { scroll: false })
  }

  /**
   * Aplica un cambio de filtro LOCAL (condición/idioma/foil/precio/orden):
   * actualiza el estado de React (fuente de verdad, sobrevive a la
   * navegación de facetas/juego porque este componente no remonta) y refleja
   * el cambio en la URL vía `history.replaceState` — sin round-trip al
   * servidor, sin remount, sin perder foco ni scroll (TASK-053 AC#3).
   *
   * Riesgo documentado (ver plan de TASK-053): si el router de next-intl
   * quedó desincronizado de la barra de direcciones real por mutaciones
   * directas de `history`, `replaceState` podría fallar o quedar
   * inconsistente. Como no hay API pública para *detectar* esa
   * desincronización, el fallback es un `try/catch`: si `replaceState`
   * lanza, `router.replace({ scroll: false })` fuerza a Next a
   * re-sincronizar su estado interno (a costa de un round-trip; sigue sin
   * remontar `CatalogView` porque el `key` de la página no incluye estos
   * params).
   */
  function writeLocalFilters(next: LocalFilters) {
    setLocalFilters(next)
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    applyLocalFiltersToSearchParams(params, next)
    const qs = params.toString()
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (nextUrl === currentUrl) return
    try {
      window.history.replaceState(window.history.state, '', nextUrl)
    } catch {
      router.replace(nextUrl, { scroll: false })
    }
  }

  /*
   * El juego ya no tiene handler propio: `GameTabs` navega con `<Link>` a la
   * URL que construye `buildUrl(tcg, {})`. Como el `key` de `catalog/page.tsx`
   * SÍ incluye el juego (cambia el fetch del servidor), cambiar de juego
   * remonta este componente y `gameFilters` se reinicializa desde la URL
   * destino — que no trae facetas del juego anterior (AC#3): un dominio de
   * Riftbound no significa nada en MTG.
   */

  /** Reemplaza los valores seleccionados de una faceta y navega. */
  function updateGameFilterValues(param: string, values: string[]) {
    const next = { ...gameFilters }
    if (values.length > 0) next[param] = values
    else delete next[param]
    setGameFilters(next)
    navigate(activeGame, next)
  }

  /** Selección múltiple (checkboxes de domain/type/supertype/rarity/energy/might). */
  function toggleGameFilterValue(param: string, value: string) {
    updateGameFilterValues(param, toggle(gameFilters[param] ?? [], value))
  }

  /** Selección única (el `<select>` de set): un valor nuevo reemplaza al anterior. */
  function setGameFilterValue(param: string, value: string | undefined) {
    updateGameFilterValues(param, value ? [value] : [])
  }

  /**
   * Set de filtros activos compartido por el filtrado real (`visible`) y por
   * el motor de conteo con autoexclusión (`facet-counts.ts`, TASK-053/054):
   * un mismo shape (`FacetCountFilters` es compatible con `CatalogFilters`)
   * para que ambos caminos nunca diverjan en qué cuenta como "filtro activo".
   */
  const countFilters: FacetCountFilters = useMemo(
    () => ({
      q,
      conditions: localFilters.conditions,
      languages: localFilters.languages,
      foilOnly: localFilters.foilOnly,
      minCents: pesosToCents(localFilters.minPesos),
      maxCents: pesosToCents(localFilters.maxPesos),
      game: gameFilters,
    }),
    [q, localFilters, gameFilters],
  )

  /**
   * Conteos por valor CON AUTOEXCLUSIÓN (TASK-053): el conteo de un valor de
   * `conditionCounts`/`languageCounts`/`foilCount` ignora el propio filtro de
   * esa faceta, así que marcar "NM" no colapsa a 0 el conteo de "LP" — sigue
   * reflejando cuántos items habría SI cambiaras la selección, no cuántos hay
   * ya filtrados por ella misma. Alimenta el disabled-state del sidebar
   * (TASK-054): conteo 0 en un valor NO seleccionado = tile inhabilitada.
   */
  const conditionCounts = useMemo(() => countConditions(items, countFilters), [items, countFilters])

  const languageCounts = useMemo(() => countLanguages(items, countFilters), [items, countFilters])

  const foilCount = useMemo(() => countFoil(items, countFilters), [items, countFilters])

  /** Conteo por valor de cada faceta propia del juego activo (domain/color/rarity/…),
   * también con autoexclusión — mismo motor, una entrada por faceta registrada. */
  const gameFacetCounts = useMemo(() => {
    const byParam: Record<string, Record<string, number>> = {}
    for (const facet of activeFacets) {
      byParam[facet.param] = countGameFacetValues(items, countFilters, facet)
    }
    return byParam
  }, [items, countFilters, activeFacets])

  const visible = useMemo(() => {
    // Las facetas de juego (TASK-053) ya no llegan filtradas del servidor —
    // `items` trae TODO el inventario del `tcg` activo — así que se aplican
    // aquí igual que el resto de filtros locales (ver comentario de cabecera
    // de `applyFilters` en `catalog/data.ts`).
    const filtered = applyFilters(items, countFilters as CatalogFilters)
    return sortItems(filtered, localFilters.sort, q)
  }, [items, countFilters, localFilters.sort, q])

  /**
   * Modelo declarativo de los filtros (TASK-057): decide qué controles
   * existen, con qué se pintan, en qué zona van y cuáles caben inline en la
   * consola. Consume los conteos de arriba tal cual, sin recomputar nada.
   */
  const filterModel = useMemo(
    () =>
      buildFilterModel({
        activeGame,
        gameFacets: activeFacets,
        local: localFilters,
        gameSelections: gameFilters,
        conditionCounts,
        languageCounts,
        foilCount,
        gameFacetCounts,
        freeTextOptions,
      }),
    [
      activeGame,
      activeFacets,
      localFilters,
      gameFilters,
      conditionCounts,
      languageCounts,
      foilCount,
      gameFacetCounts,
      freeTextOptions,
    ],
  )

  /**
   * Cablea los tres gestos de un control a los DOS canales de URL de
   * TASK-053, según de dónde venga el filtro. Es el único punto donde se
   * decide `history.replaceState` (sin remount) vs `router.push`; los
   * controles no saben nada de esto.
   */
  const filterHandlers: FilterHandlers = {
    onToggleValue: (descriptor, value) => {
      if (descriptor.source === 'game') {
        toggleGameFilterValue(descriptor.id, value)
        return
      }
      if (descriptor.id === 'cond') {
        writeLocalFilters({
          ...localFilters,
          conditions: toggle(localFilters.conditions, value as Condition),
        })
      } else if (descriptor.id === 'lang') {
        writeLocalFilters({ ...localFilters, languages: toggle(localFilters.languages, value) })
      } else if (descriptor.id === 'foil') {
        writeLocalFilters({ ...localFilters, foilOnly: !localFilters.foilOnly })
      }
    },
    onSetValue: (descriptor, value) => {
      if (descriptor.source === 'game') setGameFilterValue(descriptor.id, value)
    },
    onPriceChange: (field, value) => writeLocalFilters({ ...localFilters, [field]: value }),
  }

  /**
   * El juego NO cuenta como filtro activo desde TASK-057: es navegación, y
   * vive en su propia tira de pestañas. Si siguiera sumando, el botón
   * "Filtros" de mobile diría "(1)" sin que el usuario haya filtrado nada.
   */
  const activeFilterCount = filterModel.totalSelectedCount + (q ? 1 : 0)

  /**
   * Limpia todos los FILTROS en un solo paso, conservando el juego activo:
   * las pestañas son navegación, así que "Limpiar filtros" no debe sacarte
   * del juego que estás explorando (para eso está la pestaña "Todos").
   */
  function clearAll() {
    setQ('')
    setGameFilters({})
    setLocalFilters(EMPTY_LOCAL_FILTERS)
    router.push(activeGame ? `/catalog?game=${activeGame}` : '/catalog', { scroll: false })
  }

  const chips: ActiveChip[] = [
    ...localFilters.conditions.map((c) => ({
      key: `cond-${c}`,
      label: c,
      onRemove: () =>
        writeLocalFilters({ ...localFilters, conditions: toggle(localFilters.conditions, c) }),
    })),
    ...localFilters.languages.map((l) => ({
      key: `lang-${l}`,
      label: l.toUpperCase(),
      onRemove: () =>
        writeLocalFilters({ ...localFilters, languages: toggle(localFilters.languages, l) }),
    })),
    ...(localFilters.foilOnly
      ? [
          {
            key: 'foil',
            label: tDetail('foil'),
            onRemove: () => writeLocalFilters({ ...localFilters, foilOnly: false }),
          },
        ]
      : []),
    ...(localFilters.minPesos || localFilters.maxPesos
      ? [
          {
            key: 'price',
            label: priceLabel(localFilters.minPesos, localFilters.maxPesos),
            onRemove: () => writeLocalFilters({ ...localFilters, minPesos: '', maxPesos: '' }),
          },
        ]
      : []),
    ...activeFacets.flatMap((facet) =>
      (gameFilters[facet.param] ?? []).map((value) => ({
        key: `${facet.param}-${value}`,
        label: facetChipLabel(facet, value, t),
        onRemove: () =>
          toggleGameFilterValue(facet.param, value) /* toggle = quitar: ya está seleccionado */,
      })),
    ),
    // Quitar la búsqueda NAVEGA, no solo limpia estado (TASK-059): desde que
    // `q` lo aplica el servidor, `items` ya viene acotado al término, así que
    // un `setQ('')` a secas dejaría al comprador viendo el set reducido sin
    // ningún filtro visible que lo explicara.
    ...(q
      ? [
          {
            key: 'q',
            label: `"${q}"`,
            onRemove: () => {
              setQ('')
              router.push(buildUrl(activeGame, gameFilters, ''), { scroll: false })
            },
          },
        ]
      : []),
  ]

  const resultLine =
    t('resultsCount', { count: visible.length }) +
    (q ? '' : ` · ${t('onlineCount', { count: items.length })}`)

  /** Acento del juego activo (TASK-052/054) — con fallback al cian de marca
   * cuando no hay juego activo o no tiene identidad propia (`accentFor`). */
  const accent = accentFor(activeGame)

  const mobileFiltersTrigger = (
    <button
      ref={filtersTriggerRef}
      type="button"
      onClick={() => setMobileFiltersOpen((v) => !v)}
      aria-haspopup="dialog"
      aria-expanded={mobileFiltersOpen}
      className="clip-btn min-h-9 border border-line-strong bg-panel px-3.5 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-ink transition duration-fast ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {t('filters')} ({activeFilterCount})
    </button>
  )

  return (
    <div style={accent ? ({ '--game-accent': accent } as React.CSSProperties) : undefined}>
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--game-accent,var(--color-cyan))]">
            {t('eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-[0.02em] text-white">
            {q ? `"${q}"` : t('title')}
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted-2" aria-live="polite">
            <span key={visible.length} className="tpm-tick inline-block">
              {resultLine}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 border border-line bg-input px-3 py-2 transition-colors duration-fast ease-standard focus-within:border-primary">
            <span className="font-mono text-[9px] tracking-[0.1em] text-faint">{t('sort')}</span>
            <select
              value={localFilters.sort}
              onChange={(e) =>
                writeLocalFilters({ ...localFilters, sort: e.target.value as SortOrder })
              }
              aria-label={t('sort')}
              className="cursor-pointer bg-transparent text-[12.5px] text-ink-2 outline-none"
            >
              <option value="relevance">{t('sortRelevance')}</option>
              <option value="price_asc">{t('sortPriceAsc')}</option>
              <option value="price_desc">{t('sortPriceDesc')}</option>
              <option value="newest">{t('sortNewest')}</option>
            </select>
          </label>
        </div>
      </div>

      <GameTabs
        tcgCounts={tcgCounts}
        activeGame={activeGame}
        hrefFor={(tcg) => buildUrl(tcg, {})}
      />

      <FilterConsole
        model={filterModel}
        handlers={filterHandlers}
        activeGame={activeGame}
        mobileTrigger={mobileFiltersTrigger}
      />

      {/* Mobile: bottom sheet con semántica de dialog (TASK-055). */}
      <MobileFilterSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        triggerRef={filtersTriggerRef}
        model={filterModel}
        handlers={filterHandlers}
        activeGame={activeGame}
        activeCount={activeFilterCount}
        resultCount={visible.length}
        onClear={clearAll}
      />

      <ActiveChips chips={chips} onClearAll={clearAll} />
      {visible.length > 0 ? <CardGrid items={visible} /> : <NoResultsState onClear={clearAll} />}
    </div>
  )
}
