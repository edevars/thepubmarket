import type { InventoryItem } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { CardItem } from './CardItem'

/** Grilla responsiva de items del catálogo. Muestra estado vacío si no hay. */
export function CardGrid({ items }: { items: InventoryItem[] }) {
  const t = useTranslations('catalog')

  if (items.length === 0) {
    return <p style={{ color: '#666', padding: '2rem 0' }}>{t('empty')}</p>
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: '1rem',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      }}
    >
      {items.map((item) => (
        <CardItem key={item.id} item={item} />
      ))}
    </div>
  )
}
