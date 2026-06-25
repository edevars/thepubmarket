'use client'

import type { InventoryItem } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ProductCard } from '@/components/catalog/ProductCard'
import { AngularButton } from '@/components/ui/AngularButton'
import { useRouter } from '@/i18n/navigation'

const POPULAR = ['Ragavan', 'Sol Ring', 'Lightning Bolt', 'Charizard']

export function Hero({ heroCards }: { heroCards: InventoryItem[] }) {
  const t = useTranslations('home')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [search, setSearch] = useState('')

  function go(q: string) {
    router.push(q.trim() ? `/catalog?q=${encodeURIComponent(q.trim())}` : '/catalog')
  }

  // Posiciones del abanico de cartas (desktop).
  const fan = [
    'left-[18%] top-[30px] w-[150px] -rotate-[9deg] z-[1]',
    'left-[44%] top-0 w-[160px] rotate-[3deg] z-[3] drop-shadow-[0_18px_40px_rgba(0,0,0,0.6)]',
    'left-[68%] top-[48px] w-[148px] rotate-[10deg] z-[2]',
  ]

  return (
    <section className="relative overflow-hidden border-b border-line-soft bg-gradient-to-b from-panel/60 to-transparent px-6 py-12 lg:py-14">
      <div className="pointer-events-none absolute right-0 top-0 h-full w-[46%] bg-[repeating-linear-gradient(115deg,rgba(59,123,255,0.05)_0_1px,transparent_1px_26px)]" />
      <div className="relative mx-auto max-w-[1100px] lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-8">
        <div className="relative z-[2]">
          <div className="mb-4.5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
            <span className="h-px w-[18px] bg-cyan" />
            {t('heroEyebrow')}
          </div>
          <h1 className="mb-4 font-display text-[40px] font-bold leading-[1.02] tracking-[0.005em] text-white text-balance sm:text-[46px]">
            {t('heroTitle')}
          </h1>
          <p className="mb-6 max-w-[460px] text-[15px] leading-relaxed text-muted">
            {t('heroSub')}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              go(search)
            }}
            className="flex max-w-[480px] items-center gap-2.5 border border-line-strong bg-input px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.4)]"
          >
            <span className="h-[15px] w-[15px] shrink-0 rounded-full border-[1.5px] border-primary-hover" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tCommon('searchPlaceholder')}
              aria-label={tCommon('search')}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
            />
            <AngularButton type="submit">{tCommon('search')}</AngularButton>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.1em] text-faint-2">
              {t('popular')}
            </span>
            {POPULAR.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => go(label)}
                className="border border-line bg-[#141d33]/60 px-2.5 py-1 text-xs text-ink-2 hover:border-primary hover:text-white"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative hidden h-[340px] lg:block">
          {heroCards.map((card, i) => (
            <div key={card.id} className={`absolute ${fan[i]}`}>
              <ProductCard item={card} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
