import { useTranslations } from 'next-intl'
import type { SellerProfile } from '@/lib/sellers/types'
import { VerifiedBadge } from './VerifiedBadge'

/** Encabezado del hub: identidad de la tienda, sello verificado y stats. */
export function SellerHero({ seller }: { seller: SellerProfile }) {
  const t = useTranslations('sellers')

  const stats = [
    t('singles', { count: seller.singlesCount }),
    `${seller.city} · ${seller.neighborhood}`,
    t('memberSince', { year: seller.memberSince }),
  ]

  return (
    <header className="relative overflow-hidden border border-line bg-panel px-6 py-8 sm:px-9 sm:py-10">
      {/* Rejilla decorativa de fondo */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,123,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,123,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40" />

      <div className="relative flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative hidden h-[74px] w-[74px] shrink-0 items-center justify-center border border-line-strong bg-[#0e1626] sm:flex">
              <span className="font-display text-3xl font-bold tracking-[0.05em] text-white/25">
                {seller.monogram}
              </span>
            </div>
            <h1 className="font-display text-4xl font-bold tracking-[0.01em] text-white sm:text-5xl">
              {seller.name}
            </h1>
          </div>
          {seller.verified && <VerifiedBadge />}
        </div>

        <p className="max-w-[640px] text-[15px] leading-relaxed text-ink-2">{seller.blurb}</p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.04em] text-muted">
          {stats.map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="text-primary">◆</span>
              {s}
            </span>
          ))}
        </div>
      </div>
    </header>
  )
}
