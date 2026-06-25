import { useTranslations } from 'next-intl'
import { AngularButton } from '@/components/ui/AngularButton'

/** Banda de marca: el vínculo con The Pub Game Store (tienda física en CDMX). */
export function PubBand() {
  const t = useTranslations('home')
  return (
    <section className="relative mx-6 mt-10 flex flex-wrap items-center justify-between gap-8 overflow-hidden border border-line bg-[linear-gradient(110deg,#0a1426,#0c1322)] px-9 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(125deg,rgba(59,123,255,0.05)_0_1px,transparent_1px_22px)]" />
      <div className="relative max-w-[560px]">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
          {t('pubEyebrow')}
        </div>
        <h2 className="mb-3 font-display text-[26px] font-bold leading-tight tracking-[0.02em] text-white">
          {t('pubTitle')}
        </h2>
        <p className="text-sm leading-relaxed text-muted">{t('pubBody')}</p>
      </div>
      <AngularButton variant="outline" size="lg" className="relative shrink-0">
        {t('pubCta')}
      </AngularButton>
    </section>
  )
}
