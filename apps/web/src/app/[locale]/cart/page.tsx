'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { AngularButton } from '@/components/ui/AngularButton'
import { Link, useRouter } from '@/i18n/navigation'
import { useCart } from '@/lib/cart'
import { formatMoneyCents } from '@/lib/catalog/display'
import { createCheckout } from '@/lib/client-api'
import { getToken } from '@/lib/session'

export default function CartPage() {
  const t = useTranslations('cart')
  const locale = useLocale()
  const router = useRouter()
  const { user } = useAuth()
  const { items, subtotalCents, setQuantity, remove } = useCart()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function checkout() {
    const token = getToken()
    if (!user || !token) {
      router.push('/login')
      return
    }
    setBusy(true)
    setError(null)
    const res = await createCheckout(token, {
      items: items.map((i) => ({ inventoryId: i.inventoryId, quantity: i.quantity })),
    })
    if (res.ok) {
      // Redirige a Stripe Checkout (hospedado).
      window.location.href = res.data.url
      return
    }
    setBusy(false)
    setError(res.error.error)
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[800px] px-5 py-16 text-center">
        <h1 className="mb-3 font-display text-3xl font-bold text-white">{t('title')}</h1>
        <p className="mb-6 text-muted">{t('empty')}</p>
        <Link href="/catalog" className={angularLink}>
          {t('browse')}
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[800px] px-5 py-10">
      <h1 className="mb-6 font-display text-3xl font-bold tracking-[0.02em] text-white">
        {t('title')}
      </h1>

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.inventoryId}
            className="flex items-center gap-4 border border-line-soft bg-panel-2 p-3"
          >
            <div className="h-[84px] w-[60px] shrink-0 overflow-hidden bg-[#0e1626]">
              {item.imageUrl && (
                // biome-ignore lint/performance/noImgElement: imágenes externas de Scryfall
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Link
                href={`/catalog/${item.inventoryId}`}
                className="block truncate font-display text-base font-semibold text-ink hover:text-primary-hover"
              >
                {item.name}
              </Link>
              <div className="mt-1 font-mono text-[12px] text-muted-2">
                {formatMoneyCents(item.priceCents, locale)}
              </div>
            </div>

            <div className="flex items-center border border-line">
              <button
                type="button"
                onClick={() => setQuantity(item.inventoryId, item.quantity - 1)}
                className="px-2.5 py-1 text-muted hover:text-ink"
                aria-label="−"
              >
                −
              </button>
              <span className="min-w-[28px] text-center font-mono text-sm text-ink">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(item.inventoryId, item.quantity + 1)}
                disabled={item.quantity >= item.maxQuantity}
                className="px-2.5 py-1 text-muted hover:text-ink disabled:opacity-40"
                aria-label="+"
              >
                +
              </button>
            </div>

            <div className="w-[90px] text-right font-bold text-white">
              {formatMoneyCents(item.priceCents * item.quantity, locale)}
            </div>

            <button
              type="button"
              onClick={() => remove(item.inventoryId)}
              className="text-faint hover:text-[#d6584f]"
              aria-label={t('remove')}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-end gap-3 border-t border-line-soft pt-6">
        <div className="flex items-baseline gap-3">
          <span className="text-sm text-muted-2">{t('subtotal')}</span>
          <span className="text-2xl font-bold text-white">
            {formatMoneyCents(subtotalCents, locale)}
          </span>
          <span className="text-[11px] text-faint">MXN</span>
        </div>

        {!user && <p className="text-[12.5px] text-muted-2">{t('signInToCheckout')}</p>}
        {error && <p className="text-[12.5px] text-[#d6584f]">{t('checkoutError')}</p>}

        <AngularButton size="lg" onClick={checkout} disabled={busy}>
          {busy ? t('redirecting') : user ? t('checkout') : t('signInAndCheckout')}
        </AngularButton>
      </div>
    </main>
  )
}

const angularLink =
  'inline-flex items-center justify-center clip-btn px-4 py-2.5 text-[13px] font-display font-bold uppercase tracking-[0.1em] glow-primary bg-primary text-[#06121f] hover:bg-primary-hover'
