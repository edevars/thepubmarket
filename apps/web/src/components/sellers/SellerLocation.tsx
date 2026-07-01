import { useTranslations } from 'next-intl'
import type { SellerProfile } from '@/lib/sellers/types'

/** "Ubicación de la tienda": dirección + mapa estilizado (sin API de mapas). */
export function SellerLocation({ seller }: { seller: SellerProfile }) {
  const t = useTranslations('sellers')
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(seller.address)}`

  return (
    <section>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
        {t('locationEyebrow')}
      </div>
      <h2 className="mb-5 font-display text-2xl font-bold tracking-[0.02em] text-white">
        {t('locationTitle')}
      </h2>

      <div className="grid gap-5 md:grid-cols-2 md:items-stretch">
        {/* Dirección */}
        <div className="flex flex-col gap-4 border border-line-soft bg-panel-2 p-5">
          <div>
            <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
              {t('addressLabel')}
            </div>
            <p className="text-[15px] leading-relaxed text-ink">{seller.address}</p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 border border-line bg-input px-3 py-1.5">
            <span className="text-primary">◆</span>
            <span className="font-mono text-[11px] tracking-[0.06em] text-ink-2">
              {seller.neighborhood}
            </span>
          </div>
        </div>

        {/* Mapa estilizado */}
        <div className="relative min-h-[220px] overflow-hidden border border-line bg-[#0a1120]">
          {/* Rejilla del mapa */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(59,123,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(59,123,255,0.08)_1px,transparent_1px)] bg-[size:28px_28px]" />
          {/* Ruta punteada */}
          <div className="absolute bottom-8 left-6 right-1/3 border-b-2 border-dashed border-primary/50" />
          <div className="absolute bottom-8 right-1/3 top-1/3 border-l-2 border-dashed border-primary/50" />
          {/* Pin */}
          <div className="absolute right-1/3 top-1/3 -translate-y-full">
            <span className="glow-primary block h-4 w-4 -translate-x-1/2 rotate-45 rounded-tl-full rounded-tr-full rounded-br-full bg-primary" />
          </div>

          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="glow-primary clip-btn absolute bottom-4 right-4 inline-flex items-center gap-2 bg-primary px-3.5 py-2 font-display text-[12px] font-bold uppercase tracking-[0.08em] text-[#06121f] transition hover:bg-primary-hover"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {t('directions')}
          </a>
        </div>
      </div>
    </section>
  )
}
