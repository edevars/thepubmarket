'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { CartLine } from '@/components/cart/CartLine'
import { OrderSummary } from '@/components/cart/OrderSummary'
import { Link, useRouter } from '@/i18n/navigation'
import { useCart } from '@/lib/cart'
import { formatMoneyCents } from '@/lib/catalog/display'

/** Tiempo del "redirect" simulado a Stripe antes de aterrizar en éxito. */
const MOCK_REDIRECT_MS = 1800

export default function CartPage() {
  return (
    <Suspense fallback={<main className="px-5 py-16" />}>
      <CartPageInner />
    </Suspense>
  )
}

function CartPageInner() {
  const t = useTranslations('cart')
  const router = useRouter()
  const params = useSearchParams()
  const { user, loading } = useAuth()
  const { items, count, subtotalCents } = useCart()
  const [phase, setPhase] = useState<'browse' | 'redirecting'>('browse')
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoPayDone = useRef(false)

  // Mock de checkout: sin Stripe ni fondos. Solo simula el redirect y aterriza
  // en /checkout/success, que ya vacía el carrito. `createCheckout` se mantiene
  // intacto en lib/client-api para reconectar cuando Stripe esté configurado.
  const startCheckout = useCallback(() => {
    setPhase('redirecting')
    redirectTimer.current = setTimeout(() => {
      router.push('/checkout/success')
    }, MOCK_REDIRECT_MS)
  }, [router])

  // Entrada desde el drawer (`/cart?pay=1`): arranca el checkout si hay sesión.
  useEffect(() => {
    if (autoPayDone.current || loading) return
    if (params.get('pay') === '1' && user && items.length > 0) {
      autoPayDone.current = true
      startCheckout()
    }
  }, [params, user, loading, items.length, startCheckout])

  // Limpia el timer si el componente se desmonta a mitad del redirect.
  useEffect(() => () => clearTimeout(redirectTimer.current ?? undefined), [])

  const cancelRedirect = () => {
    clearTimeout(redirectTimer.current ?? undefined)
    setPhase('browse')
  }

  if (phase === 'redirecting') return <RedirectingView onCancel={cancelRedirect} />
  if (items.length === 0) return <EmptyView />
  if (loading) return <main className="px-5 py-16" />
  if (!user) return <AuthGateView onKeepShopping={() => router.push('/catalog')} />

  const countLine = `${count} ${count === 1 ? t('item') : t('items')}`

  return (
    <main className="mx-auto w-full max-w-[1180px] px-7 pb-10 pt-8">
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="mb-[7px] font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
            {t('eyebrow')}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-[0.02em] text-white">
            {t('title')}
          </h1>
        </div>
        <span className="text-[13px] text-muted-2">{countLine}</span>
      </div>

      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[1fr_320px] md:gap-6 md:items-start">
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <CartLine key={item.inventoryId} item={item} variant="page" />
          ))}
        </div>
        <OrderSummary subtotalCents={subtotalCents} count={count} onCheckout={startCheckout} />
      </div>
    </main>
  )
}

/** Estado vacío: ícono hexagonal + CTA al catálogo. */
function EmptyView() {
  const t = useTranslations('cart')
  return (
    <main className="mx-auto w-full max-w-[1180px] px-7 pb-10 pt-8">
      <div className="mx-auto my-[18px] max-w-[560px] border border-dashed border-line bg-panel-2 px-6 py-[84px] text-center">
        <div className="relative mx-auto mb-[26px] h-[74px] w-[74px]">
          <span
            className="absolute inset-0 border-2 border-line-strong"
            style={{ clipPath: 'polygon(50% 0,100% 27%,100% 73%,50% 100%,0 73%,0 27%)' }}
          />
          <span className="absolute left-1/2 top-1/2 h-5 w-6 -translate-x-1/2 -translate-y-1/2 border-[1.5px] border-t-0 border-line" />
        </div>
        <h3 className="mb-2.5 font-display text-[26px] font-bold tracking-[0.03em] text-white">
          {t('emptyTitle')}
        </h3>
        <p className="mx-auto mb-[26px] max-w-[380px] text-sm leading-relaxed text-muted-2">
          {t('emptyBody')}
        </p>
        <Link
          href="/catalog"
          className="clip-btn-lg glow-primary inline-flex bg-primary px-[26px] py-3.5 font-display text-sm font-bold uppercase tracking-[0.1em] text-[#06121f] hover:bg-primary-hover"
        >
          {t('exploreCta')}
        </Link>
      </div>
    </main>
  )
}

/** Sin sesión: mini-recap de la orden + auth gate. */
function AuthGateView({ onKeepShopping }: { onKeepShopping: () => void }) {
  const t = useTranslations('cart')
  const locale = useLocale()
  const { items, subtotalCents } = useCart()

  return (
    <main className="mx-auto w-full max-w-[1180px] px-7 pb-10 pt-8">
      <div className="flex flex-col-reverse gap-4 md:grid md:grid-cols-[300px_1fr] md:items-start md:gap-6">
        {/* mini recap */}
        <aside className="clip-tile relative overflow-hidden border border-line bg-panel-2 p-[22px]">
          <div className="mb-3.5 font-display text-base font-bold uppercase tracking-[0.08em] text-white">
            {t('summary')}
          </div>
          <div className="mb-3.5 flex flex-col gap-2.5">
            {items.map((item) => (
              <div key={item.inventoryId} className="flex justify-between gap-2.5 text-[12.5px]">
                <span className="min-w-0 truncate text-muted">
                  {item.quantity > 1 ? `${item.quantity}× ` : ''}
                  {item.name}
                </span>
                <span className="shrink-0 text-ink">
                  {formatMoneyCents(item.priceCents * item.quantity, locale)}
                </span>
              </div>
            ))}
          </div>
          <div className="my-3.5 h-px bg-line-soft" />
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em] text-white">
              {t('total')}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[22px] font-bold text-white">
                {formatMoneyCents(subtotalCents, locale)}
              </span>
              <span className="text-[11px] text-muted-2">MXN</span>
            </div>
          </div>
        </aside>

        {/* auth gate */}
        <div className="relative overflow-hidden border border-line bg-panel-2 px-[30px] py-[34px]">
          <div className="absolute left-0 top-0 h-[3px] w-full bg-gradient-to-r from-primary to-cyan" />
          <div className="relative mb-5 h-[52px] w-[52px]">
            <span
              className="absolute inset-0 border-2 border-line-strong"
              style={{ clipPath: 'polygon(50% 0,100% 27%,100% 73%,50% 100%,0 73%,0 27%)' }}
            />
            <span className="absolute left-1/2 top-1/2 h-[11px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-b-[2px] border-[1.5px] border-primary-hover" />
            <span className="absolute left-1/2 top-[40%] h-[9px] w-2 -translate-x-1/2 -translate-y-1/2 rounded-t-[4px] border-[1.5px] border-b-0 border-primary-hover" />
          </div>
          <h3 className="mb-2.5 font-display text-2xl font-bold tracking-[0.02em] text-white">
            {t('authTitle')}
          </h3>
          <p className="mb-6 max-w-[380px] text-[13.5px] leading-relaxed text-muted">
            {t('authBody')}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/login"
              className="clip-btn glow-primary inline-flex bg-primary px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.1em] text-[#06121f] hover:bg-primary-hover"
            >
              {t('signIn')}
            </Link>
            <Link
              href="/login"
              className="inline-flex border border-line-strong px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.08em] text-ink hover:border-primary"
            >
              {t('createAccount')}
            </Link>
          </div>
          <button
            type="button"
            onClick={onKeepShopping}
            className="mt-[18px] text-xs text-faint underline hover:text-muted"
          >
            {t('keepShopping')}
          </button>
        </div>
      </div>
    </main>
  )
}

/** Redirect simulado a Stripe (sin cargo real). */
function RedirectingView({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations('cart')
  return (
    <main className="mx-auto w-full max-w-[520px] px-6 py-24 text-center">
      <div className="relative mx-auto mb-[30px] h-[74px] w-[74px]">
        <span
          className="absolute inset-0 rounded-full border-2 border-line-soft"
          style={{
            borderTopColor: '#3b7bff',
            borderRightColor: '#35e0ee',
            animation: 'tpmSpin 0.9s linear infinite',
          }}
        />
        <span
          className="absolute inset-[18px] rounded-full border-[1.5px] border-line"
          style={{ animation: 'tpmPulse 1.4s ease-in-out infinite' }}
        />
        <span className="absolute left-1/2 top-1/2 h-4 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border-[1.5px] border-primary-hover">
          <span className="absolute left-[2.5px] top-[-5px] h-[7px] w-[7px] rounded-t-[4px] border-[1.5px] border-b-0 border-primary-hover" />
        </span>
      </div>
      <h3 className="mb-2.5 font-display text-2xl font-bold tracking-[0.03em] text-white">
        {t('redirTitle')}
      </h3>
      <p className="mb-[22px] text-sm leading-relaxed text-muted">{t('redirBody')}</p>
      <div className="inline-flex items-center gap-2.5 border border-line-soft bg-panel-2 px-4 py-2.5">
        <span className="relative h-[13px] w-[11px] rounded-[2px] border-[1.5px] border-cond-nm">
          <span className="absolute left-[1.5px] top-[-4px] h-1.5 w-1.5 rounded-t-[3px] border-[1.5px] border-b-0 border-cond-nm" />
        </span>
        <span className="text-xs text-muted-2">{t('secure')}</span>
      </div>
      <div className="mt-[26px]">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-faint underline hover:text-muted"
        >
          {t('cancel')}
        </button>
      </div>
    </main>
  )
}
