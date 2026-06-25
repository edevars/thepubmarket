'use client'

import { type Condition, type InventoryItem, TCGS, type Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { NoResultsState } from '@/components/states/NoResultsState'
import { applyFilters, type CatalogFilters } from '@/lib/catalog/data'
import { TCG_META } from '@/lib/catalog/display'
import { type ActiveChip, ActiveChips } from './ActiveChips'
import { CardGrid } from './CardGrid'
import { FilterSidebar, type FilterState } from './FilterSidebar'

const EMPTY: FilterState = {
  tcgs: [],
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

interface CatalogViewProps {
  items: InventoryItem[]
  initialQuery?: string
}

export function CatalogView({ items, initialQuery = '' }: CatalogViewProps) {
  const t = useTranslations('catalog')
  const tDetail = useTranslations('detail')
  const [q, setQ] = useState(initialQuery)
  const [filters, setFilters] = useState<FilterState>(EMPTY)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const tcgCounts = useMemo(() => {
    const counts = new Map<Tcg, number>()
    for (const item of items) counts.set(item.tcg, (counts.get(item.tcg) ?? 0) + 1)
    return TCGS.filter((tcg) => counts.has(tcg)).map((tcg) => ({
      tcg,
      count: counts.get(tcg) ?? 0,
    }))
  }, [items])

  const visible = useMemo(() => {
    const assembled: CatalogFilters = {
      q,
      tcgs: filters.tcgs,
      conditions: filters.conditions,
      languages: filters.languages,
      foilOnly: filters.foilOnly,
      minCents: pesosToCents(filters.minPesos),
      maxCents: pesosToCents(filters.maxPesos),
    }
    return applyFilters(items, assembled)
  }, [items, q, filters])

  function clearAll() {
    setQ('')
    setFilters(EMPTY)
  }

  const chips: ActiveChip[] = [
    ...filters.tcgs.map((tcg) => ({
      key: `tcg-${tcg}`,
      label: TCG_META[tcg].name,
      onRemove: () => setFilters((f) => ({ ...f, tcgs: toggle(f.tcgs, tcg) })),
    })),
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
            className="border border-line-strong bg-panel px-3.5 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-ink md:hidden"
          >
            {t('filters')} ({chips.length})
          </button>
          <div className="flex items-center gap-2 border border-line bg-input px-3 py-2">
            <span className="font-mono text-[9px] tracking-[0.1em] text-faint">{t('sort')}</span>
            <span className="text-[12.5px] text-ink-2">{t('sortRelevance')} ▾</span>
          </div>
        </div>
      </div>

      <div className="md:grid md:grid-cols-[232px_1fr] md:items-start md:gap-6">
        <aside
          className={`${mobileFiltersOpen ? 'mb-5 block' : 'hidden'} md:sticky md:top-[74px] md:block md:self-start`}
        >
          <FilterSidebar
            state={filters}
            tcgCounts={tcgCounts}
            onToggleTcg={(tcg) => setFilters((f) => ({ ...f, tcgs: toggle(f.tcgs, tcg) }))}
            onToggleCondition={(c: Condition) =>
              setFilters((f) => ({ ...f, conditions: toggle(f.conditions, c) }))
            }
            onToggleLanguage={(l) =>
              setFilters((f) => ({ ...f, languages: toggle(f.languages, l) }))
            }
            onToggleFoil={() => setFilters((f) => ({ ...f, foilOnly: !f.foilOnly }))}
            onPriceChange={(field, value) => setFilters((f) => ({ ...f, [field]: value }))}
            onClear={clearAll}
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
