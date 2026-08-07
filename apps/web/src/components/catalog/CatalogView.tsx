'use client'

import type { CatalogGameCount, Condition, InventoryItem, Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { NoResultsState } from '@/components/states/NoResultsState'
import { useRouter } from '@/i18n/navigation'
import { applyFilters, type CatalogFilters } from '@/lib/catalog/data'
import { TCG_META } from '@/lib/catalog/display'
import { facetsFor, type GameFacet } from '@/lib/catalog/game-filters'
import {
  applyLocalFiltersToSearchParams,
  EMPTY_LOCAL_FILTERS,
  type LocalFilters,
  type SortOrder,
} from '@/lib/catalog/local-filters'
import { type ActiveChip, ActiveChips } from './ActiveChips'
import { CardGrid } from './CardGrid'
import { FilterSidebar, type FilterState } from './FilterSidebar'

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
  function navigate(nextGame: Tcg | undefined, nextGameFilters: Record<string, string[]>) {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (nextGame) {
      params.set('game', nextGame)
      for (const facet of facetsFor(nextGame)) {
        for (const value of nextGameFilters[facet.param] ?? []) params.append(facet.param, value)
      }
    }
    applyLocalFiltersToSearchParams(params, localFilters)
    const qs = params.toString()
    router.push(qs ? `/catalog?${qs}` : '/catalog')
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

  /**
   * El juego es navegación, no estado local: cambia la URL para que la lista
   * se vuelva a pedir ya filtrada por el servidor. Tocar el juego activo lo
   * quita. La búsqueda del header se conserva; las facetas del juego anterior
   * NO se conservan (AC#3): un dominio de Riftbound no significa nada en MTG.
   */
  function goToGame(tcg: Tcg) {
    setGameFilters({})
    navigate(tcg === activeGame ? undefined : tcg, {})
  }

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

  const conditionCounts = useMemo(() => {
    const counts = Object.fromEntries(['NM', 'LP', 'MP', 'HP', 'DMG'].map((c) => [c, 0])) as Record<
      Condition,
      number
    >
    for (const item of items) counts[item.condition] += 1
    return counts
  }, [items])

  const languageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of items) counts[item.language] = (counts[item.language] ?? 0) + 1
    return counts
  }, [items])

  const foilCount = useMemo(() => items.filter((item) => item.finish === 'foil').length, [items])

  const visible = useMemo(() => {
    // Las facetas de juego (TASK-053) ya no llegan filtradas del servidor —
    // `items` trae TODO el inventario del `tcg` activo — así que se aplican
    // aquí igual que el resto de filtros locales (ver comentario de cabecera
    // de `applyFilters` en `catalog/data.ts`).
    const assembled: CatalogFilters = {
      q,
      conditions: localFilters.conditions,
      languages: localFilters.languages,
      foilOnly: localFilters.foilOnly,
      minCents: pesosToCents(localFilters.minPesos),
      maxCents: pesosToCents(localFilters.maxPesos),
      game: gameFilters,
    }
    const filtered = applyFilters(items, assembled)
    return sortItems(filtered, localFilters.sort, q)
  }, [items, q, gameFilters, localFilters])

  const gameFilterCount = Object.values(gameFilters).reduce((n, values) => n + values.length, 0)

  const activeFilterCount =
    (activeGame ? 1 : 0) +
    localFilters.conditions.length +
    localFilters.languages.length +
    (localFilters.foilOnly ? 1 : 0) +
    (localFilters.minPesos || localFilters.maxPesos ? 1 : 0) +
    gameFilterCount +
    (q ? 1 : 0)

  /**
   * Limpia TODO en un solo paso (AC#5): estado local (búsqueda, filtros
   * locales, facetas de juego) y la URL — siempre navega a `/catalog`
   * (antes solo lo hacía si había un juego activo, dejando `cond`/`lang`/…
   * huérfanos en la barra de direcciones cuando no lo había).
   */
  function clearAll() {
    setQ('')
    setGameFilters({})
    setLocalFilters(EMPTY_LOCAL_FILTERS)
    router.push('/catalog')
  }

  const chips: ActiveChip[] = [
    ...(activeGame
      ? [
          {
            key: `tcg-${activeGame}`,
            label: TCG_META[activeGame].name,
            onRemove: () => goToGame(activeGame),
          },
        ]
      : []),
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
    ...(q ? [{ key: 'q', label: `"${q}"`, onRemove: () => setQ('') }] : []),
  ]

  const resultLine =
    t('resultsCount', { count: visible.length }) +
    (q ? '' : ` · ${t('onlineCount', { count: items.length })}`)

  const filterState: FilterState = {
    conditions: localFilters.conditions,
    languages: localFilters.languages,
    foilOnly: localFilters.foilOnly,
    minPesos: localFilters.minPesos,
    maxPesos: localFilters.maxPesos,
    game: gameFilters,
  }

  return (
    <>
      <div className="mb-4.5 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
            {t('eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-[0.02em] text-white">
            {q ? `"${q}"` : t('title')}
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted-2" aria-live="polite">
            {resultLine}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className="clip-btn border border-line-strong bg-panel px-3.5 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-ink transition duration-fast ease-standard active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 md:hidden"
          >
            {t('filters')} ({activeFilterCount})
          </button>
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

      <div className="md:grid md:grid-cols-[232px_1fr] md:items-start md:gap-6">
        <aside
          className={`${
            mobileFiltersOpen
              ? 'tpm-reveal fixed inset-0 z-40 block bg-bg/80 p-4 backdrop-blur-sm'
              : 'hidden'
          } md:sticky md:top-[74px] md:z-auto md:block md:bg-transparent md:p-0 md:backdrop-blur-0 md:self-start`}
        >
          <FilterSidebar
            state={filterState}
            tcgCounts={tcgCounts}
            conditionCounts={conditionCounts}
            languageCounts={languageCounts}
            foilCount={foilCount}
            activeCount={activeFilterCount}
            resultCount={visible.length}
            activeGame={activeGame}
            onToggleTcg={goToGame}
            onToggleCondition={(c: Condition) =>
              writeLocalFilters({ ...localFilters, conditions: toggle(localFilters.conditions, c) })
            }
            onToggleLanguage={(l) =>
              writeLocalFilters({ ...localFilters, languages: toggle(localFilters.languages, l) })
            }
            onToggleFoil={() =>
              writeLocalFilters({ ...localFilters, foilOnly: !localFilters.foilOnly })
            }
            onPriceChange={(field, value) => writeLocalFilters({ ...localFilters, [field]: value })}
            gameFacets={activeFacets}
            gameFilterState={gameFilters}
            freeTextOptions={freeTextOptions}
            onToggleGameFilterValue={toggleGameFilterValue}
            onSetGameFilterValue={setGameFilterValue}
            onClear={clearAll}
            onClose={() => setMobileFiltersOpen(false)}
          />
        </aside>

        <div>
          <ActiveChips chips={chips} onClearAll={clearAll} />
          {visible.length > 0 ? (
            <CardGrid items={visible} />
          ) : (
            <NoResultsState onClear={clearAll} />
          )}
        </div>
      </div>
    </>
  )
}
