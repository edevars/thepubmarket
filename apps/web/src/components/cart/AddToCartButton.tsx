'use client'

import type { InventoryItem } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { angularButtonClasses } from '@/components/ui/AngularButton'
import { Link } from '@/i18n/navigation'
import { useCart } from '@/lib/cart'

/** Botón funcional de "Agregar al carrito" para la ficha de detalle. */
export function AddToCartButton({ item }: { item: InventoryItem }) {
  const t = useTranslations('detail')
  const tCart = useTranslations('cart')
  const { add } = useCart()
  const [added, setAdded] = useState(false)
  const soldOut = item.quantity === 0

  if (soldOut) {
    return (
      <button
        type="button"
        disabled
        className="clip-btn-lg cursor-not-allowed border border-line bg-[#10192e] px-7 py-3.5 font-display text-sm font-bold uppercase tracking-[0.1em] text-faint"
      >
        {t('soldOut')}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          add(item)
          setAdded(true)
        }}
        className={angularButtonClasses('primary', 'lg')}
      >
        {t('addCart')}
      </button>
      {added && (
        <Link
          href="/cart"
          className="font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-primary-hover hover:text-cyan"
        >
          {tCart('goToCart')} ›
        </Link>
      )}
    </div>
  )
}
