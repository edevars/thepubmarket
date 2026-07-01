'use client'

import {
  CONDITIONS,
  type Condition,
  type InventoryItem,
  TCGS,
  type Tcg,
} from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { CardGrid } from '@/components/catalog/CardGrid'
import { NoResultsState } from '@/components/states/NoResultsState'
import { applyFilters } from '@/lib/catalog/data'
import { formatMoneyCents, TCG_META } from '@/lib/catalog/display'

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]
}

/** Redondea hacia arriba al múltiplo de 500 más cercano (tope del slider). */
function priceCeil(cents: number): number {
  const pesos = Math.ceil(cents / 100 / 500) * 500
  return Math.max(500, pesos)
}

const chipBase =
  'border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.05em] transition'
const chipOn = 'border-primary bg-primary/14 text-[#cfe0ff]'
const chipOff = 'border-line bg-input text-muted-2 hover:border-line-strong'
const labelCls = 'font-mono text-[9px] uppercase tracking-[0.16em] text-faint'

/** Inventario de la tienda con filtros (búsqueda, set, juego, condición, precio). */
export function SellerInventory({ items }: { items: InventoryItem[] }) {
  const t = useTranslations('sellers')
  const locale = useLocale()

  const maxBound = useMemo(
    () => priceCeil(items.reduce((m, i) => Math.max(m, i.priceCents), 0)),
    [items],
  )

  const [q, setQ] = useState('')
  const [tcgs, setTcgs] = useState<Tcg[]>([])
  const [conditions, setConditions] = useState<Condition[]>([])
  const [setCode, setSetCode] = useState('')
  const [maxPesos, setMaxPesos] = useState(maxBound)

  const tcgCounts = useMemo(() => {
    const counts = new Map<Tcg, number>()
    for (const item of items) counts.set(item.tcg, (counts.get(item.tcg) ?? 0) + 1)
    return TCGS.filter((tcg) => counts.has(tcg)).map((tcg) => ({
      tcg,
      count: counts.get(tcg) ?? 0,
    }))
  }, [items])

  const sets = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of items) seen.set(item.card.setCode, item.card.setName)
    return [...seen.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const visible = useMemo(() => {
    const filtered = applyFilters(items, {
      q,
      tcgs,
      conditions,
      maxCents: maxPesos < maxBound ? maxPesos * 100 : undefined,
    })
    return setCode ? filtered.filter((i) => i.card.setCode === setCode) : filtered
  }, [items, q, tcgs, conditions, maxPesos, maxBound, setCode])

  function clearAll() {
    setQ('')
    setTcgs([])
    setConditions([])
    setSetCode('')
    setMaxPesos(maxBound)
  }

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-bold tracking-[0.02em] text-white">
          {t('inventoryTitle')}
        </h2>
        <span className="font-mono text-[11px] text-faint">
          {t('singles', { count: visible.length })}
        </span>
      </div>

      {/* Barra de filtros */}
      <div className="mb-5 flex flex-col gap-4 border border-line-soft bg-panel-2 p-4">
        {/* Búsqueda + Set */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 border border-line bg-input px-3 py-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-faint-2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
          </div>
          <label className="flex items-center gap-2 border border-line bg-input px-3 py-2.5">
            <span className={labelCls}>{t('fSet')}</span>
            <select
              value={setCode}
              onChange={(e) => setSetCode(e.target.value)}
              aria-label={t('fSet')}
              className="bg-transparent text-[13px] text-ink-2 outline-none"
            >
              <option value="" className="bg-panel">
                {t('fSetAll')}
              </option>
              {sets.map((s) => (
                <option key={s.code} value={s.code} className="bg-panel">
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Juego + Condición */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${labelCls} mr-1`}>{t('fGame')}</span>
            {tcgCounts.map(({ tcg, count }) => {
              const active = tcgs.includes(tcg)
              return (
                <button
                  key={tcg}
                  type="button"
                  onClick={() => setTcgs((prev) => toggle(prev, tcg))}
                  className={`${chipBase} ${active ? chipOn : chipOff}`}
                >
                  {TCG_META[tcg].name}
                  <span className="ml-1.5 text-faint">{count}</span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`${labelCls} mr-1`}>{t('fCondition')}</span>
            {CONDITIONS.map((c) => {
              const active = conditions.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConditions((prev) => toggle(prev, c))}
                  className={`${chipBase} ${active ? chipOn : chipOff}`}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>

        {/* Precio */}
        <div className="flex flex-wrap items-center gap-3">
          <span className={`${labelCls} mr-1`}>{t('fPrice')}</span>
          <span className="border border-line bg-input px-2.5 py-1.5 font-mono text-[11px] text-muted">
            {formatMoneyCents(0, locale)}
          </span>
          <input
            type="range"
            min={0}
            max={maxBound}
            step={50}
            value={maxPesos}
            onChange={(e) => setMaxPesos(Number(e.target.value))}
            aria-label={t('fPrice')}
            className="h-1 flex-1 min-w-[120px] max-w-[280px] cursor-pointer appearance-none rounded-full bg-line accent-primary"
          />
          <span className="border border-line bg-input px-2.5 py-1.5 font-mono text-[11px] text-muted">
            {formatMoneyCents(maxPesos * 100, locale)}
          </span>
        </div>
      </div>

      {visible.length > 0 ? <CardGrid items={visible} /> : <NoResultsState onClear={clearAll} />}
    </section>
  )
}
