'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { formatMoneyCents } from '@/lib/catalog/display'

interface OrderSummaryProps {
  subtotalCents: number
  count: number
  onCheckout: () => void
  busy?: boolean
}

/** Candado minimalista para la nota de "pago seguro". */
function LockIcon() {
  return (
    <span className="relative h-[13px] w-[11px] rounded-[2px] border-[1.5px] border-cond-nm">
      <span className="absolute left-[1.5px] top-[-4px] h-1.5 w-1.5 rounded-t-[3px] border-[1.5px] border-b-0 border-cond-nm" />
    </span>
  )
}

/** Tarjeta de resumen de orden con CTA de pago. */
export function OrderSummary({
  subtotalCents,
  count,
  onCheckout,
  busy = false,
}: OrderSummaryProps) {
  const t = useTranslations('cart')
  const locale = useLocale()
  const countLine = `${count} ${count === 1 ? t('item') : t('items')}`
  const money = formatMoneyCents(subtotalCents, locale)

  return (
    <aside className="sticky top-20">
      <div className="clip-tile relative overflow-hidden border border-line bg-panel-2 p-[22px]">
        <div className="mb-4 font-display text-base font-bold uppercase tracking-[0.08em] text-white">
          {t('summary')}
        </div>
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[13.5px] text-muted">
            {t('subtotal')} ({countLine})
          </span>
          <span className="text-sm text-ink">{money}</span>
        </div>
        <div className="my-3.5 h-px bg-line-soft" />
        <div className="mb-[18px] flex items-baseline justify-between">
          <span className="font-display text-base font-bold uppercase tracking-[0.04em] text-white">
            {t('total')}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-bold text-white">{money}</span>
            <span className="text-xs font-medium text-muted-2">MXN</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          disabled={busy}
          className="clip-btn-lg glow-primary w-full bg-primary px-4 py-[15px] font-display text-base font-bold uppercase tracking-[0.12em] text-[#06121f] transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? t('redirecting') : t('pay')}
        </button>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <LockIcon />
          <span className="text-[11.5px] text-muted-2">{t('secure')}</span>
        </div>
      </div>
      <Link
        href="/catalog"
        className="mt-2.5 block border border-line px-4 py-2.5 text-center font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-muted hover:border-line-strong hover:text-ink"
      >
        {t('keepShopping')}
      </Link>
    </aside>
  )
}
