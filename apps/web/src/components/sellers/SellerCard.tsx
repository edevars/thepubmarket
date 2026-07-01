import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { artTintForId } from '@/lib/catalog/display'
import type { SellerProfile } from '@/lib/sellers/types'

/** Tarjeta de tienda para la galería `/tiendas`. */
export function SellerCard({ seller }: { seller: SellerProfile }) {
  const t = useTranslations('sellers')

  return (
    <Link
      href={`/tiendas/${seller.slug}`}
      className="clip-tile group relative flex flex-col overflow-hidden border border-line bg-panel transition duration-150 hover:-translate-y-1 hover:border-primary hover:shadow-[0_12px_34px_rgba(0,0,0,0.55),0_0_22px_rgba(59,123,255,0.26)]"
    >
      {/* Monograma */}
      <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-[#0e1626]">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.028)_0_2px,transparent_2px_9px)]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 40%, ${artTintForId(seller.id)}, transparent 72%)`,
          }}
        />
        <span className="relative font-display text-5xl font-bold tracking-[0.06em] text-white/[0.14]">
          {seller.monogram}
        </span>
        {seller.verified && (
          <span
            className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 border border-cyan/40 bg-[#060911]/70 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-cyan backdrop-blur-sm"
            title={t('verified')}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2 4 5v6c0 4.5 3.2 8.4 8 10 4.8-1.6 8-5.5 8-10V5z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            {t('verifiedShort')}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3">
        <div className="truncate font-display text-[18px] font-bold tracking-[0.02em] text-ink">
          {seller.name}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
          {seller.city} · {seller.neighborhood}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="font-mono text-[11px] tracking-[0.04em] text-cyan">
            {t('singles', { count: seller.singlesCount })}
          </span>
          <span className="font-mono text-[10px] text-faint-2">
            {t('memberSinceShort', { year: seller.memberSince })}
          </span>
        </div>
      </div>
    </Link>
  )
}
