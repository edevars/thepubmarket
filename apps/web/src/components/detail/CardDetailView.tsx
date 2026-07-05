import type { Condition, InventoryItem, Seller } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { AddToCartButton } from '@/components/cart/AddToCartButton'
import { CardArt } from '@/components/catalog/CardArt'
import { CardGrid } from '@/components/catalog/CardGrid'
import { ConditionBadge } from '@/components/ui/ConditionBadge'
import { FoilTag } from '@/components/ui/FoilTag'
import { Link } from '@/i18n/navigation'
import {
  artTintFor,
  CONDITION_HEX,
  formatMoneyCents,
  setLine,
  TCG_META,
} from '@/lib/catalog/display'

/** Punto + código de condición con color, sin borde (para listados compactos). */
function ConditionDot({ condition }: { condition: Condition }) {
  const color = CONDITION_HEX[condition]
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color }}>
      <span className="h-[7px] w-[7px]" style={{ background: color }} />
      {condition}
    </span>
  )
}

const sectionTitle = 'mb-3 font-display text-sm font-bold uppercase tracking-[0.1em] text-muted'

export function CardDetailView({
  item,
  purchaseOptions,
  related,
  sellers,
}: {
  item: InventoryItem
  purchaseOptions: InventoryItem[]
  related: InventoryItem[]
  sellers: Seller[]
}) {
  const locale = useLocale()
  const t = useTranslations('detail')
  const tCommon = useTranslations('common')
  const gameLabel = TCG_META[item.tcg].name
  const langFull = (l: string) => tCommon(`lang.${l}`)

  // Estado de disponibilidad.
  const soldOut = item.quantity === 0
  const lastOne = item.quantity === 1
  const stockColor = soldOut ? '#d6584f' : lastOne ? '#e0b341' : '#46c98a'
  const stockText = soldOut
    ? t('soldOut')
    : lastOne
      ? t('lastOne')
      : t('inStock', { count: item.quantity })

  const attrs: Array<[string, string]> = [
    [t('attrSet'), `${item.card.setName} (${item.card.setCode.toUpperCase()})`],
    [t('attrNumber'), `${item.card.setCode.toUpperCase()} · #${item.card.collectorNumber}`],
    [t('attrLang'), langFull(item.language)],
    [t('attrFoil'), item.finish === 'foil' ? t('yes') : t('no')],
    [t('attrRarity'), item.card.rarity],
    [t('attrGame'), gameLabel],
    [t('attrArtist'), item.card.artist ?? '—'],
  ]

  const sellerById = new Map(sellers.map((seller) => [seller.id, seller]))

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 pb-10 pt-5 sm:px-6">
      {/* breadcrumb */}
      <div className="mb-5 flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-faint">
        <Link href="/catalog" className="text-faint hover:text-primary-hover">
          {tCommon('navCatalog')}
        </Link>
        <span>/</span>
        <span className="text-muted">{gameLabel}</span>
        <span>/</span>
        <span className="text-ink-2">{item.card.name}</span>
      </div>

      <div className="md:grid md:grid-cols-[minmax(0,400px)_1fr] md:items-start md:gap-10">
        {/* columna imagen */}
        <div>
          <div className="relative mx-auto w-full max-w-[400px] border border-line">
            <CardArt
              name={item.card.name}
              tint={artTintFor(item)}
              imageUrl={item.card.imageUrl}
              size="lg"
            />
            <ConditionBadge
              condition={item.condition}
              size="md"
              className="absolute left-3 top-3 bg-[#060911]/85"
            />
            {item.finish === 'foil' && (
              <span className="absolute right-3 top-3">
                <FoilTag size="md" />
              </span>
            )}
          </div>
          <div className="mt-3.5 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`aspect-[5/7] w-[50px] border bg-[#0e1626] bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.03)_0_2px,transparent_2px_7px)] ${i === 0 ? 'border-primary' : 'border-line'}`}
              />
            ))}
          </div>
        </div>

        {/* columna info */}
        <div className="mt-8 md:mt-0">
          <div className="mb-2.5 font-mono text-[11px] tracking-[0.08em] text-faint">
            {gameLabel} · {setLine(item)}
          </div>
          <h1 className="mb-3 font-display text-[34px] font-bold leading-tight tracking-[0.01em] text-white text-balance">
            {item.card.name}
          </h1>

          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="border border-primary/40 bg-primary/10 px-2.5 py-1 font-mono text-[11px] tracking-[0.06em] text-[#cfe0ff]">
              {item.card.rarity}
            </span>
            <ConditionBadge condition={item.condition} showFull size="md" />
            <span className="border border-line px-2.5 py-1 font-mono text-[11px] tracking-[0.06em] text-muted">
              {item.language.toUpperCase()}
            </span>
          </div>

          {/* buy box (visual, no funcional en Fase 1) */}
          <div className="relative mb-6 overflow-hidden border border-line bg-panel-2 p-5">
            <div className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-primary to-cyan" />
            <div className="flex flex-wrap items-end justify-between gap-3.5">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[34px] font-bold text-white">
                    {formatMoneyCents(item.priceCents, locale)}
                  </span>
                  <span className="text-[13px] font-medium text-muted-2">MXN</span>
                </div>
                <div
                  className="mt-1.5 flex items-center gap-2 text-[12.5px]"
                  style={{ color: stockColor }}
                >
                  <span
                    className="h-2 w-2"
                    style={{
                      background: stockColor,
                      boxShadow: soldOut || lastOne ? undefined : '0 0 8px rgba(70,201,138,.6)',
                    }}
                  />
                  {stockText}
                </div>
              </div>
              <AddToCartButton item={item} />
            </div>
          </div>

          {/* atributos */}
          <div className={sectionTitle}>{t('attributes')}</div>
          <div className="mb-7 border border-line-soft">
            {attrs.map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-3.5 border-b border-[#10192e] px-4 py-2.5 last:border-b-0"
              >
                <span className="text-[13px] text-muted-2">{label}</span>
                <span className="text-right font-mono text-[12.5px] text-ink">{value}</span>
              </div>
            ))}
          </div>

          {/* otras condiciones */}
          <div className={sectionTitle}>{t('otherListings')}</div>
          <div className="flex flex-col gap-2">
            {purchaseOptions.map((option) => {
              const seller = sellerById.get(option.sellerId)
              const sellerLabel = seller?.name ?? option.sellerId
              return (
                <div
                  key={option.id}
                  className="flex flex-wrap items-center gap-3 border border-line-soft bg-input px-4 py-3"
                >
                  <ConditionDot condition={option.condition} />
                  <span className="text-[12.5px] text-muted">{langFull(option.language)}</span>
                  <span className="text-[11.5px] text-faint">
                    {option.finish === 'foil' ? t('foil') : t('nonfoil')}
                  </span>
                  <span className="min-w-0 text-[12px] text-muted-2">
                    {t('soldBy')}{' '}
                    {seller?.slug ? (
                      <Link
                        href={`/tiendas/${seller.slug}`}
                        className="font-semibold text-primary-hover hover:text-cyan"
                      >
                        {sellerLabel}
                      </Link>
                    ) : (
                      <span className="font-semibold text-ink-2">{sellerLabel}</span>
                    )}
                    {seller?.verified && (
                      <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[#46c98a]">
                        {t('verified')}
                      </span>
                    )}
                  </span>
                  <span className="ml-auto text-[15px] font-bold text-white">
                    {formatMoneyCents(option.priceCents, locale)}
                  </span>
                  <Link
                    href={`/catalog/${option.id}`}
                    className="border border-line-strong px-2.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-primary-hover hover:border-primary hover:text-ink"
                  >
                    {t('choose')}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* relacionadas */}
      {related.length > 0 && (
        <div className="mt-10">
          <div className={sectionTitle}>{t('related')}</div>
          <CardGrid items={related} variant="row" />
        </div>
      )}
    </main>
  )
}
