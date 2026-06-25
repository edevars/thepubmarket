import type { InventoryItem, Tcg } from '@thepubmarket/shared'
import { TCGS } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { TCG_META } from '@/lib/catalog/display'

/** Mosaico "Explora por juego". Juegos sin inventario se muestran como "Pronto". */
export function BrowseByGame({ items }: { items: InventoryItem[] }) {
  const t = useTranslations('home')
  const tCommon = useTranslations('common')

  const counts = new Map<Tcg, number>()
  for (const item of items) counts.set(item.tcg, (counts.get(item.tcg) ?? 0) + 1)

  return (
    <section className="px-6 pt-9">
      <h2 className="mb-4.5 font-display text-[22px] font-bold tracking-[0.03em] text-white">
        {t('browseTitle')}
      </h2>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {TCGS.map((tcg) => {
          const count = counts.get(tcg) ?? 0
          const meta = TCG_META[tcg]
          return (
            <Link
              key={tcg}
              href="/catalog"
              className="clip-tile relative flex min-h-[84px] flex-col justify-between overflow-hidden border border-line bg-panel px-4 py-4.5 transition hover:border-primary hover:bg-[#101a30]"
            >
              <span className="absolute -right-2.5 -top-2.5 font-display text-[46px] font-bold text-white/[0.03]">
                {meta.short}
              </span>
              <span className="relative font-display text-[17px] font-bold tracking-[0.03em] text-ink">
                {meta.name}
              </span>
              <span className="relative font-mono text-[10px] tracking-[0.06em] text-faint">
                {count > 0 ? `${count} singles` : tCommon('soon')}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
