'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useCart } from '@/lib/cart'
import { formatMoneyCents } from '@/lib/catalog/display'
import { CartLine } from './CartLine'

/** Candado minimalista para la nota de "pago seguro". */
function LockIcon() {
  return (
    <span className="relative h-3 w-2.5 rounded-[2px] border-[1.5px] border-cond-nm">
      <span className="absolute left-[1.5px] top-[-3.5px] h-[5px] w-[5px] rounded-t-[3px] border-[1.5px] border-b-0 border-cond-nm" />
    </span>
  )
}

/**
 * Carrito deslizable (quick view). Montado una sola vez en el layout; se abre
 * desde el ícono del header. El pago navega a `/cart?pay=1`, donde la página
 * corre el flujo mock de checkout.
 */
export function CartDrawer() {
  const t = useTranslations('cart')
  const locale = useLocale()
  const router = useRouter()
  const { items, count, subtotalCents, drawerOpen, closeDrawer } = useCart()

  // Bloquea el scroll del fondo y permite cerrar con Escape mientras está abierto.
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen, closeDrawer])

  if (!drawerOpen) return null

  const countLine = `${count} ${count === 1 ? t('item') : t('items')}`
  const total = formatMoneyCents(subtotalCents, locale)

  function pay() {
    closeDrawer()
    router.push('/cart?pay=1')
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* scrim */}
      <button
        type="button"
        aria-label={t('closeCart')}
        onClick={closeDrawer}
        className="absolute inset-0 bg-[#04060d]/[0.66] backdrop-blur-[2px]"
      />

      {/* panel: derecha en desktop, hoja inferior en mobile */}
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88%] flex-col border-t border-line-strong bg-[#0a1120] shadow-[0_-20px_60px_rgba(0,0,0,0.6)] [animation:tpmDrawerIn_0.3s_ease] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:border-l sm:border-t-0 sm:shadow-[-24px_0_60px_rgba(0,0,0,0.55)]">
        <div className="flex shrink-0 items-center justify-between border-b border-line-soft px-5 py-[18px]">
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-lg font-bold uppercase tracking-[0.06em] text-white">
              {t('title')}
            </span>
            <span className="font-mono text-[11px] text-faint">{countLine}</span>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label={t('closeCart')}
            className="flex h-7 w-7 items-center justify-center border border-line text-[13px] text-muted hover:border-primary hover:text-white"
          >
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <p className="text-sm text-muted-2">{t('emptyTitle')}</p>
            <button
              type="button"
              onClick={() => {
                closeDrawer()
                router.push('/catalog')
              }}
              className="font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-primary-hover hover:text-cyan"
            >
              {t('exploreCta')} ›
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
              {items.map((item) => (
                <CartLine key={item.inventoryId} item={item} variant="drawer" />
              ))}
            </div>

            <div className="shrink-0 border-t border-line-soft bg-panel-2 px-5 py-[18px]">
              <div className="mb-3.5 flex items-baseline justify-between">
                <span className="font-display text-[15px] font-bold uppercase tracking-[0.04em] text-white">
                  {t('total')}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[23px] font-bold text-white">{total}</span>
                  <span className="text-[11px] text-muted-2">MXN</span>
                </div>
              </div>
              <button
                type="button"
                onClick={pay}
                className="clip-btn-lg glow-primary w-full bg-primary px-4 py-3.5 font-display text-[15px] font-bold uppercase tracking-[0.12em] text-[#06121f] transition hover:bg-primary-hover"
              >
                {t('pay')}
              </button>
              <div className="mt-2.5 flex items-center justify-center gap-1.5">
                <LockIcon />
                <span className="text-[11px] text-muted-2">{t('secure')}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
