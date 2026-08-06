'use client'

import type { CatalogGameCount, Condition, InventoryItem, Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { NoResultsState } from '@/components/states/NoResultsState'
import { useRouter } from '@/i18n/navigation'
import { applyFilters, type CatalogFilters } from '@/lib/catalog/data'
import { TCG_META } from '@/lib/catalog/display'
import { type ActiveChip, ActiveChips } from './ActiveChips'
import { CardGrid } from './CardGrid'
import { FilterSidebar, type FilterState } from './FilterSidebar'

const EMPTY: FilterState = {
  conditions: [],
  languages: [],
  foilOnly: false,
  minPesos: '',
  maxPesos: '',
}

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]
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
}

export function CatalogView({
  items,
  initialQuery = '',
  activeGame,
  gameCounts,
}: CatalogViewProps) {
  const t = useTranslations('catalog')
  const tDetail = useTranslations('detail')
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [filters, setFilters] = useState<FilterState>(EMPTY)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const tcgCounts = useMemo(
    () => gameCounts.map(({ tcg, count }) => ({ tcg, count })),
    [gameCounts],
  )

  /**
   * El juego es navegación, no estado local: cambia la URL para que la lista
   * se vuelva a pedir ya filtrada por el servidor. Tocar el juego activo lo
   * quita. La búsqueda del header se conserva.
   */
  function goToGame(tcg: Tcg) {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (tcg !== activeGame) params.set('game', tcg)
    const qs = params.toString()
    router.push(qs ? `/catalog?${qs}` : '/catalog')
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
    // Sin `tcg`: los items ya vienen filtrados por juego desde la API.
    const assembled: CatalogFilters = {
      q,
      conditions: filters.conditions,
      languages: filters.languages,
      foilOnly: filters.foilOnly,
      minCents: pesosToCents(filters.minPesos),
      maxCents: pesosToCents(filters.maxPesos),
    }
    return applyFilters(items, assembled)
  }, [items, q, filters])

  const activeFilterCount =
    (activeGame ? 1 : 0) +
    filters.conditions.length +
    filters.languages.length +
    (filters.foilOnly ? 1 : 0) +
    (filters.minPesos || filters.maxPesos ? 1 : 0) +
    (q ? 1 : 0)

  function clearAll() {
    setQ('')
    setFilters(EMPTY)
    // Limpiar también saca el juego de la URL, o el catálogo seguiría acotado.
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
          <div className="mt-1.5 text-[12.5px] text-muted-2">{resultLine}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className="clip-btn border border-line-strong bg-panel px-3.5 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-ink md:hidden"
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
            mobileFiltersOpen ? 'fixed inset-0 z-40 block bg-bg/80 p-4 backdrop-blur-sm' : 'hidden'
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
