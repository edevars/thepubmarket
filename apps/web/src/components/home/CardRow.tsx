import type { InventoryItem } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { CardGrid } from '@/components/catalog/CardGrid'
import { Link } from '@/i18n/navigation'

interface CardRowProps {
  title: string
  items: InventoryItem[]
  eyebrow?: string
}

/** Fila de tarjetas con encabezado y enlace "Ver todo" (destacados, novedades). */
export function CardRow({ title, items, eyebrow }: CardRowProps) {
  const t = useTranslations('home')
  return (
    <section className="px-6 pt-9">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan">
              {eyebrow}
            </div>
          )}
          <h2 className="font-display text-2xl font-bold tracking-[0.02em] text-white sm:text-[28px]">
            {title}
          </h2>
        </div>
        <Link
          href="/catalog"
          className="flex shrink-0 items-center gap-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-primary-hover hover:text-cyan"
        >
          {t('viewAll')} <span className="text-sm">›</span>
        </Link>
      </div>
      <CardGrid items={items} variant="row" />
    </section>
  )
}
