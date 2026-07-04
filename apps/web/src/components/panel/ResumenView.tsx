'use client'

import type { Tcg } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { formatMoneyCents, TCG_META } from '@/lib/catalog/display'
import { usePanel } from './PanelProvider'
import { ORDER_STATUS_HEX, orderStatusKey } from './status'

/** Vista Resumen: banner de envíos, stat tiles, órdenes recientes y snapshot. */
export function ResumenView() {
  const t = useTranslations('panel')
  const locale = useLocale()
  const { me, inventory, orders, pendingCount, loadingData } = usePanel()

  if (loadingData) return <PanelSkeleton />

  const activeCount = inventory.filter((i) => i.status === 'active' && i.quantity > 0).length
  const invValueCents = inventory.reduce((s, i) => s + i.priceCents * i.quantity, 0)
  const monthSalesCents = orders
    .filter((o) => o.status === 'shipped' || o.status === 'delivered')
    .reduce((s, o) => s + o.subtotalCents, 0)

  const tiles = [
    {
      label: t('statSingles'),
      tag: t('statSinglesTag'),
      value: String(activeCount),
      unit: t('statSinglesUnit'),
      sub: t('statSinglesSub', { count: inventory.length }),
      color: '#3b7bff',
      accent: false,
    },
    {
      label: t('statValue'),
      tag: t('statValueTag'),
      value: formatMoneyCents(invValueCents, locale),
      unit: 'MXN',
      sub: t('statValueSub'),
      color: '#35e0ee',
      accent: false,
    },
    {
      label: t('statPending'),
      tag: pendingCount > 0 ? t('statPendingTagAction') : t('statPendingTagOk'),
      value: String(pendingCount),
      unit: t('statPendingUnit'),
      sub: pendingCount > 0 ? t('statPendingAction') : t('statPendingOk'),
      color: pendingCount > 0 ? '#e08a3c' : '#46c98a',
      accent: pendingCount > 0,
    },
    {
      label: t('statSales'),
      tag: new Intl.DateTimeFormat(locale === 'en' ? 'en-MX' : 'es-MX', { month: 'long' }).format(
        new Date(),
      ),
      value: formatMoneyCents(monthSalesCents, locale),
      unit: 'MXN',
      sub: t('statSalesSub'),
      color: '#46c98a',
      accent: false,
    },
  ]

  // Inventario por juego (unidades).
  const gameCounts = new Map<Tcg, number>()
  for (const item of inventory) {
    gameCounts.set(item.tcg, (gameCounts.get(item.tcg) ?? 0) + item.quantity)
  }
  const gameMax = Math.max(1, ...gameCounts.values())
  const games = [...gameCounts.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="flex flex-col gap-6">
      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center gap-4 border border-[#e08a3c]/40 bg-[linear-gradient(120deg,rgba(224,138,60,0.10),#08101c_60%)] px-5 py-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#e08a3c]/60 font-display text-sm font-bold text-[#f0a862]">
            !
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-bold text-white">
              {t('bannerTitle', { count: pendingCount })}
            </div>
            <div className="text-[12.5px] text-muted-2">{t('bannerBody')}</div>
          </div>
          <Link
            href="/panel/ordenes"
            className="clip-btn bg-[#e08a3c] px-4 py-2 font-display text-[12.5px] font-bold uppercase tracking-[0.08em] text-[#06121f] transition hover:brightness-110"
          >
            {t('bannerCta')}
          </Link>
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((s) => (
          <div
            key={s.label}
            className="relative overflow-hidden border p-4"
            style={{
              borderColor: s.accent ? 'rgba(224,138,60,.4)' : '#15203a',
              background: s.accent
                ? 'linear-gradient(120deg, rgba(224,138,60,.10), #08101c 60%)'
                : '#08101c',
            }}
          >
            <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: s.color }} />
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                {s.label}
              </span>
              <span
                className="border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em]"
                style={{ color: s.color, borderColor: `${s.color}55` }}
              >
                {s.tag}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[26px] font-bold leading-none text-white">
                {s.value}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-faint">
                {s.unit}
              </span>
            </div>
            <div className="mt-1.5 text-[11.5px] text-muted-2">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Órdenes recientes */}
        <div className="border border-line-soft bg-panel-2">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.06em] text-white">
              {t('recentTitle')}
            </span>
            <Link
              href="/panel/ordenes"
              className="text-[11.5px] text-primary-hover hover:text-cyan"
            >
              {t('viewAll')}
            </Link>
          </div>
          {orders.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12.5px] text-faint">{t('recentEmpty')}</div>
          ) : (
            <div>
              {orders.slice(0, 5).map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0"
                >
                  <span className="font-mono text-[11px] text-muted">{o.shortId}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                    {t('cardsCount', {
                      count: o.items.reduce((n, l) => n + l.quantity, 0),
                    })}
                    {o.items[0] ? ` · ${o.items[0].titleSnapshot}` : ''}
                  </span>
                  <span className="font-mono text-[12px] font-semibold text-white">
                    {formatMoneyCents(o.totalCents, locale)}
                  </span>
                  <span
                    className="border px-2 py-0.5 font-display text-[10.5px] font-bold uppercase tracking-[0.06em]"
                    style={{
                      color: ORDER_STATUS_HEX[o.status],
                      borderColor: `${ORDER_STATUS_HEX[o.status]}66`,
                      background: `${ORDER_STATUS_HEX[o.status]}14`,
                    }}
                  >
                    {t(orderStatusKey(o.status))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Snapshot: juegos + comisión */}
        <div className="flex flex-col gap-5">
          <div className="border border-line-soft bg-panel-2 p-4">
            <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
              {t('gamesTitle')}
            </div>
            <div className="flex flex-col gap-2.5">
              {games.map(([tcg, units]) => (
                <div key={tcg} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 font-display text-[12.5px] font-semibold text-ink-2">
                    {TCG_META[tcg].name}
                  </span>
                  <span className="h-1.5 flex-1 bg-line-soft">
                    <span
                      className="block h-full bg-primary"
                      style={{ width: `${Math.round((units / gameMax) * 100)}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-[10px] text-faint">
                    {units} u
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-line-soft bg-panel-2 p-4">
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
              {t('feeTitle')}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold text-cyan">
                {(me.feeBps / 100).toLocaleString(locale)}%
              </span>
              <span className="text-[11.5px] text-muted-2">{t('feePer')}</span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-faint">{t('feeNote')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Skeleton de la vista mientras cargan inventario y órdenes. */
export function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton estático sin identidad
          <div key={i} className="tpm-shimmer h-[104px] border border-line-soft" />
        ))}
      </div>
      <div className="tpm-shimmer h-[260px] border border-line-soft" />
    </div>
  )
}
