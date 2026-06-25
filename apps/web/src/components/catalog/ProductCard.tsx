import type { InventoryItem } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { ConditionBadge } from '@/components/ui/ConditionBadge'
import { FoilTag } from '@/components/ui/FoilTag'
import { LangTag } from '@/components/ui/LangTag'
import { Link } from '@/i18n/navigation'
import { artTintFor, formatMoneyCents, setLine } from '@/lib/catalog/display'
import { CardArt } from './CardArt'

interface ProductCardProps {
  item: InventoryItem
}

/**
 * Tarjeta de producto: el componente más repetido. La imagen manda; condición y
 * precio legibles de un vistazo. Estados: normal, hover (glow + lift), agotado.
 */
export function ProductCard({ item }: ProductCardProps) {
  const locale = useLocale()
  const t = useTranslations('detail')
  const soldOut = item.quantity === 0

  return (
    <Link
      href={`/catalog/${item.id}`}
      className="clip-card group relative flex flex-col border border-line bg-panel transition duration-150 hover:-translate-y-1 hover:border-primary hover:shadow-[0_12px_34px_rgba(0,0,0,0.55),0_0_22px_rgba(59,123,255,0.26)]"
    >
      <div className="relative">
        <CardArt name={item.card.name} tint={artTintFor(item)} imageUrl={item.card.imageUrl} />

        <ConditionBadge
          condition={item.condition}
          className="absolute left-2 top-2 bg-[#060911]/82 backdrop-blur-sm"
        />

        {item.finish === 'foil' && (
          <span className="absolute right-2 top-2">
            <FoilTag />
          </span>
        )}

        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#060911]/74">
            <span className="-rotate-6 border-[1.5px] border-[#d6584f] px-3.5 py-1.5 font-display text-[15px] font-bold tracking-[0.18em] text-[#d6584f]">
              {t('soldOut').toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2.5">
        <div className="truncate font-display text-[15.5px] font-semibold tracking-[0.01em] text-ink">
          {item.card.name}
        </div>
        <div className="truncate font-mono text-[10px] tracking-[0.04em] text-faint">
          {setLine(item)}
        </div>
        <div className="mt-px flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold text-white">
              {formatMoneyCents(item.priceCents, locale)}
            </span>
            <span className="text-[9px] font-medium text-faint">MXN</span>
          </div>
          <LangTag lang={item.language} />
        </div>
      </div>
    </Link>
  )
}
