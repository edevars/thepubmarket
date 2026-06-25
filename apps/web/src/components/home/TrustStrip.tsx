import { useTranslations } from 'next-intl'

const KEYS = ['curated', 'condition', 'sellers'] as const

/** Tira de confianza: posicionamiento curado, condición, vendedores conocidos. */
export function TrustStrip() {
  const t = useTranslations('home.trust')
  return (
    <section className="grid gap-px border-b border-line-soft bg-line-soft [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {KEYS.map((key) => (
        <div key={key} className="flex items-start gap-3 bg-panel-2 px-5 py-5">
          <span className="clip-rhombus mt-1.5 h-2.5 w-2.5 shrink-0 bg-cyan" />
          <div>
            <div className="mb-1 font-display text-[15px] font-semibold uppercase tracking-[0.04em] text-ink">
              {t(`${key}.title`)}
            </div>
            <div className="text-[12.5px] leading-relaxed text-muted-2">{t(`${key}.body`)}</div>
          </div>
        </div>
      ))}
    </section>
  )
}
