import type { InventoryItem } from '@thepubmarket/shared'
import { ProductCard } from './ProductCard'

interface CardGridProps {
  items: InventoryItem[]
  /** `grid` (catálogo) o `row` (filas de la home, tarjetas algo más anchas). */
  variant?: 'grid' | 'row'
}

const LAYOUT = {
  grid: 'gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(175px,1fr))]',
  row: 'gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] sm:gap-3.5 sm:[grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]',
}

export function CardGrid({ items, variant = 'grid' }: CardGridProps) {
  return (
    <div className={`grid ${LAYOUT[variant]}`}>
      {items.map((item) => (
        <ProductCard key={item.id} item={item} />
      ))}
    </div>
  )
}
