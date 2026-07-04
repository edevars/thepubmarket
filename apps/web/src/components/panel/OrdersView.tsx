'use client'

import type { SellerOrder } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { artTintForId, formatMoneyCents } from '@/lib/catalog/display'
import { usePanel } from './PanelProvider'
import { PanelSkeleton } from './ResumenView'
import { ORDER_STATUS_HEX, orderStatusKey } from './status'

type Tab = 'pending' | 'shipped' | 'completed' | 'all'

const TAB_FILTER: Record<Tab, (o: SellerOrder) => boolean> = {
  pending: (o) => o.status === 'paid',
  shipped: (o) => o.status === 'shipped',
  completed: (o) => o.status === 'delivered',
  all: () => true,
}

/** Vista Órdenes y envíos: tabs, filas expandibles, timeline y liquidación. */
export function OrdersView() {
  const t = useTranslations('panel')
  const { orders, loadingData } = usePanel()
  const [tab, setTab] = useState<Tab>('pending')
  const [expanded, setExpanded] = useState<string | null>(null)

  if (loadingData) return <PanelSkeleton />

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'pending', label: t('tabPending'), count: orders.filter(TAB_FILTER.pending).length },
    { key: 'shipped', label: t('tabShipped'), count: orders.filter(TAB_FILTER.shipped).length },
    {
      key: 'completed',
      label: t('tabCompleted'),
      count: orders.filter(TAB_FILTER.completed).length,
    },
    { key: 'all', label: t('tabAll'), count: orders.length },
  ]

  const visible = orders.filter(TAB_FILTER[tab])

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, count }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 border px-3.5 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.05em] transition ${
                active
                  ? 'border-primary bg-primary/14 text-[#7fa8ff]'
                  : 'border-line-soft text-muted-2 hover:text-ink-2'
              }`}
            >
              {label}
              <span
                className={`min-w-[16px] px-1 text-center font-mono text-[10px] font-semibold ${
                  active ? 'bg-primary/20 text-[#cfe0ff]' : 'bg-[#101a30] text-faint'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="border border-dashed border-line bg-panel-2 px-6 py-16 text-center">
          <h2 className="mb-2 font-display text-xl font-bold tracking-[0.03em] text-white">
            {t('ordersEmptyTitle')}
          </h2>
          <p className="mx-auto max-w-[420px] text-[13px] text-muted-2">{t('ordersEmptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              expanded={expanded === o.id}
              onToggle={() => setExpanded((cur) => (cur === o.id ? null : o.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderRow({
  order,
  expanded,
  onToggle,
}: {
  order: SellerOrder
  expanded: boolean
  onToggle: () => void
}) {
  const t = useTranslations('panel')
  const locale = useLocale()
  const color = ORDER_STATUS_HEX[order.status]

  const date = new Intl.DateTimeFormat(locale === 'en' ? 'en-MX' : 'es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(order.createdAt * 1000))

  // Miniaturas apiladas (una por unidad, máx 3 + contador).
  const thumbs: string[] = []
  for (const line of order.items) {
    for (let i = 0; i < line.quantity; i++) thumbs.push(`${line.id}-${i}`)
  }
  const extra = thumbs.length > 3 ? thumbs.length - 3 : 0

  const cardsLine = order.items
    .map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.titleSnapshot}`)
    .join(', ')

  return (
    <div className="border border-line-soft bg-panel-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex shrink-0 flex-col">
          <span className="font-mono text-[12px] font-semibold text-ink">{order.shortId}</span>
          <span className="font-mono text-[9.5px] text-faint">{date}</span>
        </div>

        {/* Thumbs apiladas */}
        <div className="flex shrink-0 items-center">
          {thumbs.slice(0, 3).map((key, i) => (
            <span
              key={key}
              className="relative h-9 w-7 border border-line bg-[#0e1626]"
              style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i }}
            >
              <span
                className="absolute inset-0"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 40%, ${artTintForId(key)}, transparent 72%)`,
                }}
              />
            </span>
          ))}
          {extra > 0 && <span className="ml-1 font-mono text-[10px] text-faint">+{extra}</span>}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-ink-2">{cardsLine}</div>
          <div className="font-mono text-[10px] tracking-[0.04em] text-faint">
            {t('buyer')} · {order.buyerLabel}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span className="font-mono text-[13.5px] font-semibold text-white">
            {formatMoneyCents(order.totalCents, locale)}
          </span>
          <span className="font-mono text-[9.5px] text-cyan">
            {t('youReceive', { net: formatMoneyCents(order.netCents, locale) })}
          </span>
        </div>

        <span
          className="shrink-0 border px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color, borderColor: `${color}66`, background: `${color}14` }}
        >
          {t(orderStatusKey(order.status))}
        </span>

        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 border border-line px-3 py-1.5 font-display text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted transition hover:border-line-strong hover:text-ink"
        >
          {expanded ? t('hideDetail') : t('detail')}
        </button>
      </div>

      {expanded && <OrderDetail order={order} />}
    </div>
  )
}

function OrderDetail({ order }: { order: SellerOrder }) {
  const t = useTranslations('panel')
  const locale = useLocale()
  const { markShipped, markDelivered } = usePanel()
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)

  const terminal = order.status === 'cancelled' || order.status === 'refunded'
  const stageIdx =
    order.status === 'paid'
      ? 0
      : order.status === 'shipped'
        ? 1
        : order.status === 'delivered'
          ? 2
          : -1
  const stages = [t('tlPaid'), t('tlShipped'), t('tlDelivered')]

  async function confirmShip() {
    if (tracking.trim().length < 3 || busy) return
    setBusy(true)
    await markShipped(order.id, tracking.trim())
    setBusy(false)
  }

  async function confirmDeliver() {
    if (busy) return
    setBusy(true)
    await markDelivered(order.id)
    setBusy(false)
  }

  return (
    <div className="grid gap-5 border-t border-line-soft px-4 py-4 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-4">
        {/* Timeline */}
        <div className="flex items-center gap-2">
          {stages.map((label, i) => {
            const reached = !terminal && stageIdx >= i
            const isLast = i === stages.length - 1
            return (
              <div key={label} className={`flex items-center gap-2 ${isLast ? '' : 'flex-1'}`}>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-3 w-3 rounded-full border-2 ${
                      reached ? 'border-cyan bg-cyan/30' : 'border-line-strong bg-[#10192e]'
                    }`}
                  />
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.1em] ${
                      reached ? 'text-cyan' : 'text-faint-2'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {!isLast && (
                  <span
                    className={`h-px flex-1 ${!terminal && stageIdx > i ? 'bg-cyan/50' : 'bg-line-soft'}`}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Líneas */}
        <div>
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
            {t('linesTitle')}
          </div>
          <div className="flex flex-col">
            {order.items.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between gap-3 border-b border-line-soft py-2 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                  {line.titleSnapshot}
                </span>
                <span className="font-mono text-[11px] text-faint">
                  {line.quantity} × {formatMoneyCents(line.unitPriceCents, locale)}
                </span>
                <span className="w-20 text-right font-mono text-[12px] font-semibold text-white">
                  {formatMoneyCents(line.lineTotalCents, locale)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {order.trackingNumber && (
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
            <span className="text-faint">{t('trackingShort')}:</span>
            <span className="text-cyan">{order.trackingNumber}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* Liquidación */}
        <div className="border border-line-soft bg-input p-4">
          <div className="mb-2.5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
            {t('settlement')}
          </div>
          <dl className="flex flex-col gap-1.5 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-muted-2">{t('subtotal')}</dt>
              <dd className="font-mono text-ink-2">
                {formatMoneyCents(order.subtotalCents, locale)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">{t('shippingRow')}</dt>
              <dd className="font-mono text-ink-2">
                {formatMoneyCents(order.shippingCents, locale)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">{t('buyerTotal')}</dt>
              <dd className="font-mono text-ink-2">{formatMoneyCents(order.totalCents, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-2">
                {t('commissionRow', {
                  pct: (order.subtotalCents > 0
                    ? (order.platformFeeCents / order.subtotalCents) * 100
                    : 0
                  ).toLocaleString(locale, { maximumFractionDigits: 1 }),
                })}
              </dt>
              <dd className="font-mono text-cond-dmg">
                −{formatMoneyCents(order.platformFeeCents, locale)}
              </dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-line-soft pt-2">
              <dt className="font-display text-[13px] font-bold uppercase tracking-[0.05em] text-white">
                {t('youReceiveRow')}
              </dt>
              <dd className="font-mono text-[14px] font-bold text-cyan">
                {formatMoneyCents(order.netCents, locale)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Acción de envío */}
        {order.status === 'paid' && (
          <div className="border border-line-soft bg-input p-4">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
              {t('trackingLabel')}
            </div>
            <div className="flex gap-2">
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder={t('trackingPlaceholder')}
                aria-label={t('trackingLabel')}
                className="min-w-0 flex-1 border border-line bg-[#0a1120] px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={confirmShip}
                disabled={tracking.trim().length < 3 || busy}
                className="clip-btn bg-primary px-4 py-2 font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[#06121f] transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        )}
        {order.status === 'shipped' && (
          <button
            type="button"
            onClick={confirmDeliver}
            disabled={busy}
            className="clip-btn self-start border border-cond-nm/50 bg-cond-nm/10 px-4 py-2.5 font-display text-[12px] font-bold uppercase tracking-[0.08em] text-cond-nm transition hover:bg-cond-nm/20 disabled:opacity-40"
          >
            {t('markDelivered')}
          </button>
        )}
      </div>
    </div>
  )
}
