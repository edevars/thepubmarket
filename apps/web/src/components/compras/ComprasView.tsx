'use client'

import type { BuyerOrder, SellerOrderStatus } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { angularButtonClasses } from '@/components/ui/AngularButton'
import { Link } from '@/i18n/navigation'
import { artTintForId, CONDITION_HEX, formatMoneyCents } from '@/lib/catalog/display'
import { fetchBuyerOrders } from '@/lib/client-api'
import { getToken } from '@/lib/session'

/** Colores por estado, paleta del comprador (reembolsada difiere del panel). */
const STATUS_HEX: Record<SellerOrderStatus, string> = {
  pending: '#7a88a8',
  paid: '#4d8bff',
  shipped: '#35e0ee',
  delivered: '#46c98a',
  cancelled: '#7a88a8',
  refunded: '#ff6b7a',
}

function statusKey(s: SellerOrderStatus): string {
  return `st${s.charAt(0).toUpperCase()}${s.slice(1)}`
}

type Tab = 'transit' | 'delivered' | 'all'

const TAB_FILTER: Record<Tab, (o: BuyerOrder) => boolean> = {
  transit: (o) => o.status === 'paid' || o.status === 'shipped',
  delivered: (o) => o.status === 'delivered',
  all: () => true,
}

/** "Mis compras": historial del comprador con rastreo de envíos. */
export function ComprasView() {
  const t = useTranslations('purchases')
  const { user, loading } = useAuth()
  const [orders, setOrders] = useState<BuyerOrder[] | null>(null)
  const [tab, setTab] = useState<Tab>('transit')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (loading || !user) return
    const token = getToken()
    if (!token) return
    fetchBuyerOrders(token)
      .then(setOrders)
      .catch(() => setOrders([]))
  }, [user, loading])

  // Gate sin sesión.
  if (!loading && !user) {
    return (
      <div className="flex flex-col items-center px-6 py-24 text-center">
        <div className="relative mb-6 h-[58px] w-[58px]">
          <span className="absolute inset-0 border-2 border-line-strong [clip-path:polygon(50%_0,100%_27%,100%_73%,50%_100%,0_73%,0_27%)]" />
          <span className="absolute left-1/2 top-1/2 h-[13px] w-4 -translate-x-1/2 -translate-y-1/2 border-2 border-t-0 border-primary-hover" />
          <span className="absolute left-1/2 top-[15px] h-[11px] w-3 -translate-x-1/2 rounded-t-[7px] border-2 border-b-0 border-primary-hover" />
        </div>
        <h1 className="mb-2.5 font-display text-3xl font-bold tracking-[0.02em] text-white">
          {t('gateTitle')}
        </h1>
        <p className="mb-6 max-w-[400px] text-sm leading-relaxed text-muted">{t('gateBody')}</p>
        <Link href="/login" className={angularButtonClasses('primary')}>
          {t('gateCta')}
        </Link>
      </div>
    )
  }

  const loadingData = loading || orders === null
  const counts = orders
    ? {
        transit: orders.filter(TAB_FILTER.transit).length,
        delivered: orders.filter(TAB_FILTER.delivered).length,
        all: orders.length,
      }
    : { transit: 0, delivered: 0, all: 0 }
  const visible = orders ? orders.filter(TAB_FILTER[tab]) : []

  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-7 sm:px-6">
      {/* Encabezado */}
      <div className="mb-5">
        <div className="mb-2 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
          <span className="h-px w-[18px] bg-cyan" />
          {t('eyebrow')}
        </div>
        <h1 className="font-display text-[32px] font-bold tracking-[0.02em] text-white">
          {t('title')}
        </h1>
        {!loadingData && (
          <div className="mt-1 text-[13px] text-muted-2">
            {t('countLine', { count: counts.all })}
          </div>
        )}
      </div>

      {loadingData ? (
        <PurchasesSkeleton />
      ) : orders && orders.length === 0 ? (
        <div className="border border-dashed border-line bg-panel-2 px-6 py-16 text-center">
          <div className="relative mx-auto mb-5 h-14 w-14">
            <span className="absolute inset-0 border-2 border-line-strong [clip-path:polygon(50%_0,100%_27%,100%_73%,50%_100%,0_73%,0_27%)]" />
            <span className="absolute inset-[19px] border-[1.5px] border-line" />
          </div>
          <h2 className="mb-2 font-display text-[22px] font-bold tracking-[0.03em] text-white">
            {t('emptyTitle')}
          </h2>
          <p className="mx-auto mb-6 max-w-[380px] text-[13.5px] leading-relaxed text-muted-2">
            {t('emptyBody')}
          </p>
          <Link href="/catalog" className={angularButtonClasses('primary')}>
            {t('emptyCta')}
          </Link>
        </div>
      ) : (
        <>
          {/* Tabs subrayados */}
          <div className="mb-5 flex gap-0.5 border-b border-line-soft">
            {(
              [
                ['transit', t('tabTransit'), counts.transit],
                ['delivered', t('tabDelivered'), counts.delivered],
                ['all', t('tabAll'), counts.all],
              ] as [Tab, string, number][]
            ).map(([key, label, count]) => {
              const active = tab === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`-mb-px border-b-2 px-3.5 py-2.5 font-display text-sm uppercase tracking-[0.06em] transition ${
                    active
                      ? 'border-primary font-bold text-white'
                      : 'border-transparent font-semibold text-muted-2 hover:text-ink-2'
                  }`}
                >
                  {label}{' '}
                  <span
                    className={`font-mono text-[10px] ${active ? 'text-primary' : 'text-faint'}`}
                  >
                    ({count})
                  </span>
                </button>
              )
            })}
          </div>

          {visible.length === 0 ? (
            <div className="border border-dashed border-line bg-panel-2 px-6 py-11 text-center text-[13.5px] text-muted-2">
              {t('noneInFilter')}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {visible.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  expanded={expanded === o.id}
                  onToggle={() => setExpanded((cur) => (cur === o.id ? null : o.id))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Badge de estado (color + fondo tenue). */
function StatusBadge({ status }: { status: SellerOrderStatus }) {
  const t = useTranslations('purchases')
  const color = STATUS_HEX[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
      style={{ color, borderColor: `${color}80`, background: `${color}1f` }}
    >
      {t(statusKey(status))}
    </span>
  )
}

/** Botón copiar guía con feedback "✓ Copiada" (1.6s). */
function useCopy() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  })
  return {
    copied,
    copy(text: string) {
      try {
        navigator.clipboard.writeText(text)
      } catch {
        /* clipboard no disponible */
      }
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    },
  }
}

function OrderCard({
  order,
  expanded,
  onToggle,
}: {
  order: BuyerOrder
  expanded: boolean
  onToggle: () => void
}) {
  const t = useTranslations('purchases')
  const locale = useLocale()
  const { copied, copy } = useCopy()
  const color = STATUS_HEX[order.status]

  const fmtDay = (unix: number) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-MX' : 'es-MX', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(unix * 1000))
  const fullDate = new Intl.DateTimeFormat(locale === 'en' ? 'en-MX' : 'es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(order.createdAt * 1000))

  const summary = order.items
    .map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.titleSnapshot}`)
    .join(', ')
  const showTracking = order.status === 'shipped' && !!order.trackingNumber

  return (
    <div
      className={`relative overflow-hidden border bg-panel-2 ${expanded ? 'border-line-strong' : 'border-line-soft'}`}
    >
      <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: color }} />

      {/* Fila principal */}
      <div className="flex flex-col gap-3.5 p-4 sm:flex-row sm:items-start sm:gap-5 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[13px] font-semibold text-ink">{order.shortId}</span>
            <span className="h-1 w-1 rotate-45 bg-line-strong" />
            <span className="font-mono text-[11px] text-faint">{fullDate}</span>
            <StatusBadge status={order.status} />
          </div>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            {order.seller.slug ? (
              <Link
                href={`/tiendas/${order.seller.slug}`}
                className="font-display text-base font-bold tracking-[0.02em] text-white transition hover:text-primary-hover"
              >
                {order.seller.name}
              </Link>
            ) : (
              <span className="font-display text-base font-bold text-white">
                {order.seller.name}
              </span>
            )}
            {order.seller.verified && (
              <span className="inline-flex items-center gap-1.5 border border-cyan/40 bg-cyan/[0.08] py-0.5 pl-1.5 pr-2">
                <span className="relative inline-flex h-3 w-3 items-center justify-center">
                  <span className="absolute inset-0 bg-[linear-gradient(150deg,#35e0ee,#3b7bff)] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]" />
                  <span className="relative text-[7px] font-extrabold leading-none text-[#04101a]">
                    ✓
                  </span>
                </span>
                <span className="font-display text-[9.5px] font-bold tracking-[0.12em] text-[#9defff]">
                  {t('verified').toUpperCase()}
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex shrink-0">
              {order.items.slice(0, 3).map((line, i) => (
                <span
                  key={line.id}
                  className="relative h-12 w-[34px] overflow-hidden border border-line bg-[#0e1626] shadow-[3px_0_8px_rgba(0,0,0,0.4)]"
                  style={{ marginLeft: i === 0 ? 0 : -14, zIndex: 9 - i }}
                >
                  {line.imageUrl ? (
                    // biome-ignore lint/performance/noImgElement: miniatura de Scryfall (TODO R2)
                    <img
                      src={line.imageUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `radial-gradient(circle at 50% 36%, ${artTintForId(line.id)}, transparent 74%)`,
                      }}
                    />
                  )}
                </span>
              ))}
            </div>
            <span className="min-w-0 text-[12.5px] leading-snug text-muted">{summary}</span>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3.5 sm:flex-col sm:items-end">
          <div className="sm:text-right">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
              {t('totalPaid')}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[21px] font-bold text-white">
                {formatMoneyCents(order.totalCents, locale)}
              </span>
              <span className="text-[11px] text-muted-2">MXN</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`shrink-0 border px-3.5 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.08em] transition ${
              expanded
                ? 'border-primary bg-primary/12 text-white'
                : 'border-line-strong text-primary-hover hover:text-cyan'
            }`}
          >
            {expanded ? t('closeDetail') : t('detail')}
          </button>
        </div>
      </div>

      {/* Guía en tarjeta (solo Enviada) */}
      {showTracking && (
        <div className="flex flex-wrap items-center gap-3 border-t border-cyan/20 bg-cyan/[0.04] px-4 py-2.5 sm:px-5">
          <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan">
            <span className="clip-rhombus h-2 w-2 bg-cyan shadow-[0_0_8px_rgba(53,224,238,0.6)]" />
            {t('tracking')}
          </span>
          <span className="min-w-0 truncate font-mono text-[15px] font-semibold tracking-[0.04em] text-ink">
            {order.trackingNumber}
          </span>
          <button
            type="button"
            onClick={() => order.trackingNumber && copy(order.trackingNumber)}
            className={`ml-auto shrink-0 border px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.1em] transition ${
              copied ? 'border-cond-nm bg-cond-nm/10 text-cond-nm' : 'border-cyan/50 text-cyan'
            }`}
          >
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      )}

      {expanded && <OrderDetail order={order} fmtDay={fmtDay} />}
    </div>
  )
}

function OrderDetail({ order, fmtDay }: { order: BuyerOrder; fmtDay: (unix: number) => string }) {
  const t = useTranslations('purchases')
  const locale = useLocale()
  const { copied, copy } = useCopy()

  const terminal = order.status === 'cancelled' || order.status === 'refunded'
  const reachedIdx = order.status === 'delivered' ? 2 : order.status === 'shipped' ? 1 : 0
  const showTracking = order.status === 'shipped' && !!order.trackingNumber

  const steps = [
    { name: t('tlPaid'), date: order.createdAt },
    { name: t('tlShipped'), date: order.shippedAt },
    { name: t('tlDelivered'), date: order.deliveredAt },
  ]

  return (
    <div className="border-t border-line-soft bg-[#070d18] px-4 pb-5 pt-5 sm:px-5">
      {/* Timeline con dots rombo */}
      <div
        className="mb-4 flex max-w-[560px] items-start"
        style={terminal ? { opacity: 0.35, filter: 'saturate(0.3)' } : undefined}
      >
        {steps.map((step, i) => {
          const reached = !terminal && i <= reachedIdx
          const dotColor = reached
            ? i === reachedIdx
              ? STATUS_HEX[order.status]
              : '#46c98a'
            : '#2a3a5e'
          return (
            <div key={step.name} className="relative flex flex-1 flex-col items-center">
              {i > 0 && (
                <span
                  className="absolute right-1/2 top-[7px] h-0.5 -left-1/2"
                  style={{ background: !terminal && i <= reachedIdx ? '#46c98a' : '#1e2a44' }}
                />
              )}
              <span
                className="clip-rhombus relative z-[2] h-3.5 w-3.5 shrink-0 border-2"
                style={{
                  background: reached ? dotColor : '#0a1120',
                  borderColor: dotColor,
                  boxShadow: reached && i === reachedIdx ? `0 0 10px ${dotColor}` : undefined,
                }}
              />
              <span
                className={`mt-2 font-display text-[12.5px] font-bold uppercase tracking-[0.08em] ${
                  reached ? 'text-ink' : 'text-faint-2'
                }`}
              >
                {step.name}
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-muted">
                {reached && step.date ? `· ${fmtDay(step.date)}` : ' '}
              </span>
            </div>
          )
        })}
      </div>

      {terminal && (
        <div className="mb-4 inline-flex items-center gap-2.5 border border-line bg-input px-3 py-2">
          <StatusBadge status={order.status} />
        </div>
      )}

      {/* Bloque de rastreo grande */}
      {showTracking && (
        <div className="mb-5 flex flex-wrap items-center gap-4 border border-cyan/35 bg-cyan/[0.05] px-4 py-4 [clip-path:polygon(10px_0,100%_0,100%_calc(100%-10px),calc(100%-10px)_100%,0_100%,0_10px)]">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-cyan">
              {t('tracking')}
            </div>
            <div className="truncate font-mono text-[22px] font-semibold tracking-[0.05em] text-white">
              {order.trackingNumber}
            </div>
          </div>
          <button
            type="button"
            onClick={() => order.trackingNumber && copy(order.trackingNumber)}
            className="clip-btn shrink-0 px-5 py-2.5 font-display text-[12.5px] font-bold uppercase tracking-[0.1em] text-[#04101a] transition"
            style={{
              background: copied ? '#46c98a' : '#35e0ee',
              boxShadow: `0 0 16px ${copied ? 'rgba(70,201,138,0.35)' : 'rgba(53,224,238,0.35)'}`,
            }}
          >
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
      )}

      {/* Contenido */}
      <div className="mb-2.5 font-display text-[13px] font-bold uppercase tracking-[0.1em] text-muted">
        {t('contents')}
      </div>
      <div className="mb-4.5 border border-line-soft">
        {order.items.map((line) => (
          <div
            key={line.id}
            className="flex flex-wrap items-center gap-3 border-b border-line-soft px-3.5 py-2.5 last:border-0"
          >
            <span className="relative h-9 w-[26px] shrink-0 overflow-hidden border border-line bg-[#0e1626]">
              {line.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: miniatura de Scryfall (TODO R2)
                <img
                  src={line.imageUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <span
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `radial-gradient(circle at 50% 36%, ${artTintForId(line.id)}, transparent 74%)`,
                  }}
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">{line.titleSnapshot}</div>
              <div className="mt-0.5 flex items-center gap-2">
                {line.condition && (
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: CONDITION_HEX[line.condition] }}
                  >
                    {line.condition}
                  </span>
                )}
                {line.setCode && (
                  <span className="font-mono text-[10px] uppercase text-faint">{line.setCode}</span>
                )}
              </div>
            </div>
            <span className="whitespace-nowrap font-mono text-[12px] text-muted">
              {line.quantity} × {formatMoneyCents(line.unitPriceCents, locale)}
            </span>
            <span className="min-w-[88px] text-right text-[13.5px] font-bold text-white">
              {formatMoneyCents(line.lineTotalCents, locale)}
            </span>
          </div>
        ))}
      </div>

      {/* Resumen + acción */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="w-full max-w-[340px]">
          <div className="flex justify-between py-1.5 text-[12.5px] text-muted">
            <span>{t('subtotal')}</span>
            <span className="font-mono text-ink-2">
              {formatMoneyCents(order.subtotalCents, locale)}
            </span>
          </div>
          <div className="flex justify-between border-b border-line-soft py-1.5 text-[12.5px] text-muted">
            <span>{t('shipping')}</span>
            <span className="font-mono text-ink-2">
              {formatMoneyCents(order.shippingCents, locale)}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-2.5 text-[14px] font-bold text-white">
            <span>{t('totalPaid')}</span>
            <span className="font-mono text-[16px]">
              {formatMoneyCents(order.totalCents, locale)}{' '}
              <span className="text-[10px] font-medium text-muted-2">MXN</span>
            </span>
          </div>
        </div>
        {order.seller.slug && (
          <Link
            href={`/tiendas/${order.seller.slug}`}
            className="self-end py-2 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-primary-hover transition hover:text-cyan"
          >
            {t('buyAgain')}
          </Link>
        )}
      </div>
    </div>
  )
}

/** Skeleton de carga (3 tarjetas shimmer). */
function PurchasesSkeleton() {
  return (
    <div className="flex flex-col gap-3.5">
      {Array.from({ length: 3 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton estático sin identidad
        <div key={i} className="border border-line-soft bg-panel-2 p-4 sm:px-5">
          <div className="mb-4 flex items-center gap-3.5">
            <div className="tpm-shimmer h-3 w-[110px]" />
            <div className="h-2.5 w-[70px] bg-[#131d33]" />
            <div className="ml-auto h-4.5 w-[76px] bg-[#131d33]" />
          </div>
          <div className="flex items-center gap-3.5">
            <div className="flex">
              <div className="tpm-shimmer h-12 w-[34px] border border-line" />
              <div className="-ml-3.5 h-12 w-[34px] border border-line bg-[#0e1626]" />
              <div className="-ml-3.5 h-12 w-[34px] border border-line bg-[#0e1626]" />
            </div>
            <div className="flex-1">
              <div className="mb-2 h-2.5 w-[55%] bg-[#16213a]" />
              <div className="h-2 w-[35%] bg-[#131d33]" />
            </div>
            <div className="h-5 w-[90px] bg-[#16213a]" />
          </div>
        </div>
      ))}
    </div>
  )
}
