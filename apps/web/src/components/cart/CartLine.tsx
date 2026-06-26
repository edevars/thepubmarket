'use client'

import { useLocale, useTranslations } from 'next-intl'
import { ConditionBadge } from '@/components/ui/ConditionBadge'
import { FoilTag } from '@/components/ui/FoilTag'
import { LangTag } from '@/components/ui/LangTag'
import { type CartItem, useCart } from '@/lib/cart'
import { artTintForId, formatMoneyCents } from '@/lib/catalog/display'

interface CartLineProps {
  item: CartItem
  variant?: 'page' | 'drawer'
}

/** Miniatura de arte: imagen real (Scryfall) o placeholder con tinte radial. */
function Thumb({ item, width }: { item: CartItem; width: number }) {
  return (
    <div
      className="relative aspect-[5/7] shrink-0 overflow-hidden border border-line bg-[#0e1626]"
      style={{ width }}
    >
      {item.imageUrl ? (
        // biome-ignore lint/performance/noImgElement: imágenes externas de Scryfall (TODO migrar a R2)
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.028)_0_2px,transparent_2px_9px)]" />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 50% 34%, ${artTintForId(item.inventoryId)}, transparent 72%)`,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-2 text-center font-display text-[11px] font-semibold leading-tight text-muted">
            {item.name}
          </div>
        </>
      )}
    </div>
  )
}

/** Línea del carrito: thumbnail, metadatos, stepper de cantidad, totales. */
export function CartLine({ item, variant = 'page' }: CartLineProps) {
  const t = useTranslations('cart')
  const locale = useLocale()
  const { setQuantity, remove } = useCart()

  const setLine =
    item.setCode && item.collectorNumber
      ? `${item.setCode.toUpperCase()} · #${item.collectorNumber}`
      : null
  const atMax = item.quantity >= item.maxQuantity
  const lowStock = item.maxQuantity <= 2
  const stockColor = lowStock ? '#e0b341' : '#46c98a'
  const stockTxt = `${item.maxQuantity} ${item.maxQuantity === 1 ? t('availableOne') : t('available')}`
  const lineTotal = formatMoneyCents(item.priceCents * item.quantity, locale)
  const unitLine = `${formatMoneyCents(item.priceCents, locale)} ${t('unit')}`

  const dec = () => setQuantity(item.inventoryId, item.quantity - 1)
  const inc = () => setQuantity(item.inventoryId, item.quantity + 1)

  const stepper = (size: 'sm' | 'md') => {
    const pad = size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3 py-[7px] text-[15px]'
    const qtyW = size === 'sm' ? 'min-w-[26px] text-[12px]' : 'min-w-[34px] text-sm'
    return (
      <div className="flex w-fit items-center border border-line">
        <button
          type="button"
          onClick={dec}
          disabled={item.quantity <= 1}
          aria-label="−"
          className={`${pad} font-mono font-semibold leading-none text-muted hover:text-ink disabled:cursor-not-allowed disabled:text-[#2f3c5c]`}
        >
          −
        </button>
        <span className={`${qtyW} text-center font-mono font-semibold text-ink`}>
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={atMax}
          aria-label="+"
          className={`${pad} font-mono font-semibold leading-none text-muted hover:text-ink disabled:cursor-not-allowed disabled:text-[#2f3c5c]`}
        >
          +
        </button>
      </div>
    )
  }

  const stockDot = (
    <span
      className="inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.03em]"
      style={{ color: stockColor }}
    >
      <span className="h-[5px] w-[5px] rounded-full" style={{ background: stockColor }} />
      {stockTxt}
    </span>
  )

  // ---------- DRAWER (compacto) ----------
  if (variant === 'drawer') {
    return (
      <div className="flex gap-3">
        <Thumb item={item} width={54} />
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2">
            <span className="min-w-0 truncate font-display text-[14.5px] font-semibold leading-[1.15] text-ink">
              {item.name}
            </span>
            <button
              type="button"
              onClick={() => remove(item.inventoryId)}
              aria-label={t('remove')}
              className="shrink-0 text-[11px] text-faint hover:text-[#d6584f]"
            >
              ✕
            </button>
          </div>
          {setLine && <div className="my-1 font-mono text-[9.5px] text-faint">{setLine}</div>}
          <div className="mb-1.5 flex items-center gap-1.5">
            {item.condition && <ConditionBadge condition={item.condition} />}
            {item.language && <LangTag lang={item.language} />}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              {stepper('sm')}
              {stockDot}
            </div>
            <span className="font-bold text-white">{lineTotal}</span>
          </div>
        </div>
      </div>
    )
  }

  // ---------- PAGE (completo) ----------
  return (
    <div className="clip-card flex gap-3 border border-line bg-panel p-3.5 md:gap-4 md:p-4">
      <Thumb item={item} width={92} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] font-semibold leading-[1.1] text-ink">
              {item.name}
            </div>
            {setLine && (
              <div className="mt-1 font-mono text-[10.5px] tracking-[0.04em] text-faint">
                {setLine}
              </div>
            )}
            {item.sellerName && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[11.5px] text-muted-2">{t('soldBy')}</span>
                <span className="text-[11.5px] font-semibold text-ink-2">{item.sellerName}</span>
                {item.sellerVerified && (
                  <span
                    role="img"
                    aria-label={t('verified')}
                    className="inline-flex h-[13px] w-[13px] items-center justify-center border border-cyan/50 bg-cyan/15 text-[8px] leading-none text-cyan"
                  >
                    ✓
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => remove(item.inventoryId)}
            aria-label={t('remove')}
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center border border-line text-[12px] leading-none text-faint hover:border-[#d6584f] hover:text-[#d6584f]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {item.condition && <ConditionBadge condition={item.condition} />}
          {item.finish === 'foil' && <FoilTag />}
          {item.language && <LangTag lang={item.language} />}
        </div>

        <div className="mt-0.5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            {stepper('md')}
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.03em]"
                style={{ color: stockColor }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: stockColor }} />
                {stockTxt}
              </span>
              <span className="text-[10.5px] text-faint">· {unitLine}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-lg font-bold text-white">{lineTotal}</span>
              <span className="text-[10px] font-medium text-faint">MXN</span>
            </div>
            {atMax && (
              <div className="mt-0.5 font-mono text-[9px] tracking-[0.06em] text-[#e0b341]">
                {t('max')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
