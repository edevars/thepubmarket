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
import { angularButtonClasses } from '@/components/ui/AngularButton'
import { FoilTag } from '@/components/ui/FoilTag'
import { Link } from '@/i18n/navigation'
import {
  artTintFor,
  CONDITION_HEX,
  formatMoneyCents,
  setLine,
  TCG_META,
} from '@/lib/catalog/display'
import { usePanel } from './PanelProvider'
import { PanelSkeleton } from './ResumenView'

const chipCls = (active: boolean) =>
  `border px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.05em] transition ${
    active
      ? 'border-primary bg-primary/14 text-[#cfe0ff]'
      : 'border-line bg-input text-muted-2 hover:border-line-strong'
  }`

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

/** Vista Inventario: tabla densa con precio/cantidad editables y pausa. */
export function InventoryView() {
  const t = useTranslations('panel')
  const { inventory, loadingData } = usePanel()

  const [q, setQ] = useState('')
  const [games, setGames] = useState<Tcg[]>([])
  const [conds, setConds] = useState<Condition[]>([])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return inventory.filter((i) => {
      if (query && !i.card.name.toLowerCase().includes(query)) return false
      if (games.length && !games.includes(i.tcg)) return false
      if (conds.length && !conds.includes(i.condition)) return false
      return true
    })
  }, [inventory, q, games, conds])

  const locale = useLocale()
  const totalValueCents = filtered.reduce((s, i) => s + i.priceCents * i.quantity, 0)
  const presentGames = TCGS.filter((g) => inventory.some((i) => i.tcg === g))

  if (loadingData) return <PanelSkeleton />

  if (inventory.length === 0) {
    return (
      <div className="border border-dashed border-line bg-panel-2 px-6 py-20 text-center">
        <h2 className="mb-2 font-display text-2xl font-bold tracking-[0.03em] text-white">
          {t('invEmptyTitle')}
        </h2>
        <p className="mx-auto mb-6 max-w-[400px] text-sm leading-relaxed text-muted-2">
          {t('invEmptyBody')}
        </p>
        <Link href="/panel/agregar" className={angularButtonClasses('primary')}>
          {t('invEmptyCta')}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border border-line-soft bg-panel-2 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 border border-line bg-input px-3 py-2">
            <span className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-faint-2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('invSearchPlaceholder')}
              aria-label={t('invSearchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
              {t('invGame')}
            </span>
            {presentGames.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGames((prev) => toggle(prev, g))}
                className={chipCls(games.includes(g))}
              >
                {TCG_META[g].name}
              </button>
            ))}
            <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
              {t('invCond')}
            </span>
            {CONDITIONS.map((cnd) => (
              <button
                key={cnd}
                type="button"
                onClick={() => setConds((prev) => toggle(prev, cnd))}
                className={chipCls(conds.includes(cnd))}
              >
                {cnd}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[11px] text-muted">
            {t('invCountLine', { count: filtered.length })}
          </span>
          <span className="font-mono text-[11px] text-faint">
            {t('invTotalValue')}{' '}
            <span className="text-cyan">{formatMoneyCents(totalValueCents, locale)}</span> MXN
          </span>
        </div>
      </div>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="border border-dashed border-line bg-panel-2 px-6 py-12 text-center">
          <p className="mb-3 text-[13px] text-muted-2">{t('invNoMatch')}</p>
          <button
            type="button"
            onClick={() => {
              setQ('')
              setGames([])
              setConds([])
            }}
            className="text-[12px] text-primary-hover hover:text-cyan"
          >
            {t('invClear')}
          </button>
        </div>
      ) : (
        <div className="tpm-scroll overflow-x-auto border border-line-soft bg-panel-2">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line-soft">
                {(
                  [
                    'colCard',
                    'colCond',
                    'colFinish',
                    'colLang',
                    'colPrice',
                    'colQty',
                    'colStatus',
                    'colActions',
                  ] as const
                ).map((key) => (
                  <th
                    key={key}
                    className="px-3 py-2.5 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-faint first:pl-4 last:pr-4"
                  >
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <InventoryRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InventoryRow({ item }: { item: InventoryItem }) {
  const t = useTranslations('panel')
  const { patchItem } = usePanel()
  const paused = item.status === 'inactive'
  const [priceInput, setPriceInput] = useState(String(Math.round(item.priceCents / 100)))
  const [busy, setBusy] = useState(false)

  async function commitPrice() {
    const pesos = Number.parseInt(priceInput, 10)
    if (!Number.isFinite(pesos) || pesos < 0) {
      setPriceInput(String(Math.round(item.priceCents / 100)))
      return
    }
    if (pesos * 100 === item.priceCents) return
    setBusy(true)
    const ok = await patchItem(item.id, { priceCents: pesos * 100 })
    if (!ok) setPriceInput(String(Math.round(item.priceCents / 100)))
    setBusy(false)
  }

  async function bumpQty(delta: number) {
    const next = Math.max(0, item.quantity + delta)
    if (next === item.quantity) return
    setBusy(true)
    await patchItem(item.id, { quantity: next })
    setBusy(false)
  }

  async function toggleStatus() {
    setBusy(true)
    await patchItem(item.id, { status: paused ? 'active' : 'inactive' })
    setBusy(false)
  }

  const qtyColor =
    item.quantity === 0 ? 'text-cond-dmg' : item.quantity <= 2 ? 'text-cond-mp' : 'text-white'

  return (
    <tr
      className={`border-b border-line-soft transition last:border-0 ${paused ? 'bg-[#080c16]/50' : ''} ${busy ? 'opacity-60' : ''}`}
    >
      {/* Carta */}
      <td className="px-3 py-2.5 first:pl-4">
        <div className="flex items-center gap-3">
          <div className="relative h-[46px] w-[34px] shrink-0 overflow-hidden border border-line bg-[#0e1626]">
            {item.card.imageUrl ? (
              // biome-ignore lint/performance/noImgElement: miniatura de Scryfall (TODO R2)
              <img
                src={item.card.imageUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 40%, ${artTintFor(item)}, transparent 72%)`,
                }}
              />
            )}
          </div>
          <div className="min-w-0">
            <div
              className={`truncate font-display text-[14px] font-semibold ${paused ? 'text-muted-2' : 'text-ink'}`}
            >
              {item.card.name}
            </div>
            <div className="font-mono text-[9.5px] tracking-[0.05em] text-faint">
              {setLine(item)}
            </div>
          </div>
        </div>
      </td>
      {/* Cond */}
      <td className="px-3 py-2.5">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold"
          style={{ color: CONDITION_HEX[item.condition] }}
        >
          <span className="h-[7px] w-[7px]" style={{ background: CONDITION_HEX[item.condition] }} />
          {item.condition}
        </span>
      </td>
      {/* Acabado */}
      <td className="px-3 py-2.5">
        {item.finish === 'foil' ? (
          <FoilTag />
        ) : (
          <span className="font-mono text-[11px] text-faint-2">—</span>
        )}
      </td>
      {/* Idioma */}
      <td className="px-3 py-2.5 font-mono text-[11px] uppercase text-muted">{item.language}</td>
      {/* Precio */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 border border-line bg-input px-2 py-1">
          <span className="font-mono text-[11px] text-faint">$</span>
          <input
            value={priceInput}
            inputMode="numeric"
            onChange={(e) => setPriceInput(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitPrice}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label={t('colPrice')}
            className="w-16 bg-transparent font-mono text-[12px] text-ink outline-none"
          />
        </div>
      </td>
      {/* Cantidad */}
      <td className="px-3 py-2.5">
        <div className="inline-flex items-center border border-line bg-input">
          <button
            type="button"
            onClick={() => bumpQty(-1)}
            disabled={busy || item.quantity === 0}
            className="px-2 py-1 text-[13px] text-muted-2 hover:text-ink disabled:opacity-40"
            aria-label="−1"
          >
            −
          </button>
          <span
            className={`min-w-[26px] text-center font-mono text-[12px] font-semibold ${qtyColor}`}
          >
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => bumpQty(1)}
            disabled={busy}
            className="px-2 py-1 text-[13px] text-muted-2 hover:text-ink disabled:opacity-40"
            aria-label="+1"
          >
            +
          </button>
        </div>
      </td>
      {/* Estado */}
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${paused ? 'text-muted-2' : 'text-[#9fe0c0]'}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-muted-2' : 'bg-cond-nm'}`} />
          {paused ? t('statusPaused') : t('statusActive')}
        </span>
      </td>
      {/* Acciones */}
      <td className="px-3 py-2.5 last:pr-4">
        <button
          type="button"
          onClick={toggleStatus}
          disabled={busy}
          title={paused ? t('resume') : t('pause')}
          className={`inline-flex h-7 w-7 items-center justify-center border border-line bg-input text-[9px] disabled:opacity-40 ${
            paused ? 'text-cond-nm' : 'text-cond-mp'
          }`}
        >
          {paused ? '▶' : '❙❙'}
        </button>
      </td>
    </tr>
  )
}
