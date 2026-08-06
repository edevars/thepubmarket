'use client'

import type { CatalogGameCount, Condition, InventoryItem, Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { NoResultsState } from '@/components/states/NoResultsState'
import { useRouter } from '@/i18n/navigation'
import { applyFilters, type CatalogFilters } from '@/lib/catalog/data'
import { TCG_META } from '@/lib/catalog/display'
import { facetsFor, type GameFacet } from '@/lib/catalog/game-filters'
import { type ActiveChip, ActiveChips } from './ActiveChips'
import { CardGrid } from './CardGrid'
import { FilterSidebar, type FilterState } from './FilterSidebar'

const EMPTY: FilterState = {
  conditions: [],
  languages: [],
  foilOnly: false,
  minPesos: '',
  maxPesos: '',
  game: {},
}

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
}

export function CatalogView({
  items,
  initialQuery = '',
  activeGame,
  gameCounts,
  initialGameFilters,
}: CatalogViewProps) {
  const t = useTranslations('catalog')
  const tDetail = useTranslations('detail')
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...EMPTY,
    game: initialGameFilters ?? {},
  }))
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
      for (const value of filters.game[facet.param] ?? []) {
        if (!seen.has(value)) seen.set(value, value.toUpperCase())
      }
      byParam[facet.param] = [...seen.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    return byParam
  }, [items, activeFacets, filters.game])

  /**
   * Navega reconstruyendo la URL desde cero (q + game + facetas del juego
   * DESTINO). Al no copiar params existentes, cambiar o quitar el juego purga
   * cualquier faceta propia de Riftbound automáticamente (AC#3) — nunca hay
   * params "huérfanos" que la API pueda rechazar con 400.
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
    const qs = params.toString()
    router.push(qs ? `/catalog?${qs}` : '/catalog')
  }

  /**
   * El juego es navegación, no estado local: cambia la URL para que la lista
   * se vuelva a pedir ya filtrada por el servidor. Tocar el juego activo lo
   * quita. La búsqueda del header se conserva; las facetas del juego anterior
   * NO se conservan (AC#3): un dominio de Riftbound no significa nada en MTG.
   */
  function goToGame(tcg: Tcg) {
    navigate(tcg === activeGame ? undefined : tcg, {})
  }

  /** Reemplaza los valores seleccionados de una faceta y navega. */
  function updateGameFilterValues(param: string, values: string[]) {
    const nextGame = { ...filters.game }
    if (values.length > 0) nextGame[param] = values
    else delete nextGame[param]
    navigate(activeGame, nextGame)
  }

  /** Selección múltiple (checkboxes de domain/type/supertype/rarity/energy/might). */
  function toggleGameFilterValue(param: string, value: string) {
    updateGameFilterValues(param, toggle(filters.game[param] ?? [], value))
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
    // Sin `tcg`/`game`: los items ya vienen filtrados por juego y por sus
    // facetas propias desde la API; se re-evalúan igual (ver `applyFilters`)
    // para que los mocks se comporten como producción.
    const assembled: CatalogFilters = {
      q,
      conditions: filters.conditions,
      languages: filters.languages,
      foilOnly: filters.foilOnly,
      minCents: pesosToCents(filters.minPesos),
      maxCents: pesosToCents(filters.maxPesos),
      game: filters.game,
    }
    return applyFilters(items, assembled)
  }, [items, q, filters])

  const gameFilterCount = Object.values(filters.game).reduce((n, values) => n + values.length, 0)

  const activeFilterCount =
    (activeGame ? 1 : 0) +
    filters.conditions.length +
    filters.languages.length +
    (filters.foilOnly ? 1 : 0) +
    (filters.minPesos || filters.maxPesos ? 1 : 0) +
    gameFilterCount +
    (q ? 1 : 0)

  function clearAll() {
    setQ('')
    setFilters(EMPTY)
    // Limpiar también saca el juego (y sus facetas) de la URL, o el catálogo
    // seguiría acotado.
    if (activeGame) router.push('/catalog')
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
    ...filters.conditions.map((c) => ({
      key: `cond-${c}`,
      label: c,
      onRemove: () => setFilters((f) => ({ ...f, conditions: toggle(f.conditions, c) })),
    })),
    ...filters.languages.map((l) => ({
      key: `lang-${l}`,
      label: l.toUpperCase(),
      onRemove: () => setFilters((f) => ({ ...f, languages: toggle(f.languages, l) })),
    })),
    ...(filters.foilOnly
      ? [
          {
            key: 'foil',
            label: tDetail('foil'),
            onRemove: () => setFilters((f) => ({ ...f, foilOnly: false })),
          },
        ]
      : []),
    ...(filters.minPesos || filters.maxPesos
      ? [
          {
            key: 'price',
            label: priceLabel(filters.minPesos, filters.maxPesos),
            onRemove: () => setFilters((f) => ({ ...f, minPesos: '', maxPesos: '' })),
          },
        ]
      : []),
    ...activeFacets.flatMap((facet) =>
      (filters.game[facet.param] ?? []).map((value) => ({
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
          <div className="flex items-center gap-2 border border-line bg-input px-3 py-2">
            <span className="font-mono text-[9px] tracking-[0.1em] text-faint">{t('sort')}</span>
            <span className="text-[12.5px] text-ink-2">{t('sortRelevance')} ▾</span>
          </div>
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
            state={filters}
            tcgCounts={tcgCounts}
            conditionCounts={conditionCounts}
            languageCounts={languageCounts}
            foilCount={foilCount}
            activeCount={activeFilterCount}
            resultCount={visible.length}
            activeGame={activeGame}
            onToggleTcg={goToGame}
            onToggleCondition={(c: Condition) =>
              setFilters((f) => ({ ...f, conditions: toggle(f.conditions, c) }))
            }
            onToggleLanguage={(l) =>
              setFilters((f) => ({ ...f, languages: toggle(f.languages, l) }))
            }
            onToggleFoil={() => setFilters((f) => ({ ...f, foilOnly: !f.foilOnly }))}
            onPriceChange={(field, value) => setFilters((f) => ({ ...f, [field]: value }))}
            gameFacets={activeFacets}
            gameFilterState={filters.game}
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
