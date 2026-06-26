'use client'

import type { OrderSummary } from '@thepubmarket/shared'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Suspense, useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { useCart } from '@/lib/cart'
import { formatMoneyCents } from '@/lib/catalog/display'
import { fetchOrder } from '@/lib/client-api'
import { getToken } from '@/lib/session'

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<main className="px-5 py-16" />}>
      <CheckoutSuccessInner />
    </Suspense>
  )
}

function CheckoutSuccessInner() {
  const t = useTranslations('checkout')
  const locale = useLocale()
  const params = useSearchParams()
  const { clear } = useCart()
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    // El pago se completó: vacía el carrito.
    clear()
    const orderId = params.get('order')
    const token = getToken()
    if (!orderId || !token) {
      setLoading(false)
      return
    }
    fetchOrder(token, orderId)
      .then(setOrder)
      .finally(() => setLoading(false))
  }, [params, clear])

  return (
    <main className="mx-auto w-full max-w-[640px] px-5 py-16">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-cond-nm text-2xl text-cond-nm">
          ✓
        </div>
        <h1 className="font-display text-3xl font-bold tracking-[0.02em] text-white">
          {t('successTitle')}
        </h1>
        <p className="mt-2 text-sm text-muted">{t('successSubtitle')}</p>
      </div>

      {loading ? (
        <p className="text-center text-muted-2">{t('loadingOrder')}</p>
      ) : order ? (
        <div className="border border-line-soft bg-panel-2 p-5">
          <div className="mb-3 flex justify-between font-mono text-[12px] text-muted-2">
            <span>{t('orderRef')}</span>
            <span className="text-ink">{order.id.slice(0, 8)}</span>
          </div>
          <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
            {order.items.map((it) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span className="text-ink">
                  {it.titleSnapshot} <span className="text-faint">×{it.quantity}</span>
                </span>
                <span className="text-muted">{formatMoneyCents(it.lineTotalCents, locale)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-line-soft pt-3">
            <span className="text-sm text-muted-2">{t('total')}</span>
            <span className="font-bold text-white">
              {formatMoneyCents(order.totalCents, locale)} MXN
            </span>
          </div>
        </div>
      ) : (
        <p className="text-center text-muted-2">{t('orderUnavailable')}</p>
      )}

      <div className="mt-8 text-center">
        <Link href="/catalog" className="text-primary-hover hover:text-cyan">
          {t('keepBrowsing')} ›
        </Link>
      </div>
    </main>
  )
}
