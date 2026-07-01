import { useTranslations } from 'next-intl'
import { artTintForId, TCG_META } from '@/lib/catalog/display'
import type { SellerProfile } from '@/lib/sellers/types'

/** "Conoce al vendedor": foto, juegos favoritos, años en el hobby, dato curioso. */
export function SellerAbout({ seller }: { seller: SellerProfile }) {
  const t = useTranslations('sellers')

  return (
    <section>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
        {t('aboutEyebrow')}
      </div>
      <h2 className="mb-5 font-display text-2xl font-bold tracking-[0.02em] text-white">
        {t('aboutTitle')}
      </h2>

      <div className="grid gap-5 md:grid-cols-[minmax(0,220px)_1fr] md:items-stretch">
        {/* Foto 4:5 (placeholder geométrico) */}
        <div className="relative aspect-[4/5] w-full overflow-hidden border border-line bg-[#0e1626]">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.028)_0_2px,transparent_2px_9px)]" />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 50% 38%, ${artTintForId(seller.slug)}, transparent 72%)`,
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="font-display text-4xl font-bold tracking-[0.05em] text-white/20">
              {seller.monogram}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-faint-2">
              {t('photoTag')}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-stretch">
            {/* Juegos favoritos */}
            <div className="border border-line-soft bg-panel-2 p-4">
              <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                {t('favoriteGames')}
              </div>
              <div className="flex flex-wrap gap-2">
                {seller.favoriteGames.map((tcg) => (
                  <span
                    key={tcg}
                    className="border border-line bg-input px-3 py-1.5 font-display text-[13px] font-semibold text-ink-2"
                  >
                    {TCG_META[tcg].name}
                  </span>
                ))}
              </div>
            </div>

            {/* Años en el hobby */}
            <div className="flex flex-col items-center justify-center border border-line-soft bg-panel-2 px-6 py-4 text-center sm:min-w-[130px]">
              <span className="font-display text-4xl font-bold text-white">
                {seller.yearsInHobby}
              </span>
              <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
                {t('yearsLabel')}
              </span>
            </div>
          </div>

          {/* Dato curioso */}
          <div className="flex items-start gap-3.5 border border-line-soft bg-panel-2 p-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-cyan/40 font-display text-sm font-bold text-cyan">
              !
            </span>
            <div>
              <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">
                {t('funFact')}
              </div>
              <p className="text-[14px] leading-relaxed text-ink-2">{seller.funFact}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
