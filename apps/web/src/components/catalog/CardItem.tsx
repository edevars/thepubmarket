import type { InventoryItem } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../i18n/navigation'
import { formatPriceCents } from '../../lib/api'

/** Tarjeta de un single en la grilla del catálogo. */
export function CardItem({ item }: { item: InventoryItem }) {
  const t = useTranslations('catalog')
  const locale = useLocale()
  const { card } = item

  return (
    <Link
      href={`/catalog/${item.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #eee',
        borderRadius: 12,
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        background: '#fff',
      }}
    >
      {/* TODO: migrar imágenes a R2; por ahora se referencia la URL de Scryfall. */}
      {card.imageUrl ? (
        // biome-ignore lint/performance/noImgElement: imágenes externas de Scryfall (TODO R2)
        <img
          src={card.imageUrl}
          alt={card.name}
          loading="lazy"
          style={{ width: '100%', aspectRatio: '488 / 680', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ width: '100%', aspectRatio: '488 / 680', background: '#f3f3f3' }} />
      )}
      <div style={{ padding: '0.75rem', display: 'grid', gap: '0.2rem' }}>
        <strong style={{ fontSize: '0.95rem', lineHeight: 1.2 }}>{card.name}</strong>
        <span style={{ fontSize: '0.8rem', color: '#666' }}>
          {card.setName} · #{card.collectorNumber}
        </span>
        <span style={{ fontSize: '0.8rem', color: '#666' }}>
          {item.condition} · {item.finish === 'foil' ? t('foil') : t('nonfoil')} ·{' '}
          {item.language.toUpperCase()}
        </span>
        <span style={{ fontWeight: 700, marginTop: '0.25rem' }}>
          {formatPriceCents(item.priceCents, locale)}
        </span>
      </div>
    </Link>
  )
}
