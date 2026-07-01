import { useTranslations } from 'next-intl'
import type { SellerProfile } from '@/lib/sellers/types'
import { SellerCard } from './SellerCard'

/** Galería de tiendas del market. */
export function SellerGallery({ sellers }: { sellers: SellerProfile[] }) {
  const t = useTranslations('sellers')

  return (
    <section>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
        {t('galleryEyebrow')}
      </div>
      <h1 className="font-display text-3xl font-bold tracking-[0.02em] text-white">
        {t('galleryTitle')}
      </h1>
      <p className="mb-6 mt-1.5 max-w-[560px] text-[13px] leading-relaxed text-muted-2">
        {t('gallerySubtitle')}
      </p>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {sellers.map((seller) => (
          <SellerCard key={seller.id} seller={seller} />
        ))}
      </div>
    </section>
  )
}
