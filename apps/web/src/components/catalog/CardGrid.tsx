import type { InventoryItem } from '@thepubmarket/shared'
import type { CardOffers } from '@/lib/catalog/grouping'
import { ProductCard } from './ProductCard'

/**
 * Grid de tarjetas de producto. El fade/rise al cambiar de contenido (juego o
 * filtros) vive en cada `ProductCard` (`.tpm-grid-item`, ver globals.css), no
 * aquí: React ya remonta cada tarjeta con `key={item.id}` cuando la lista de
 * items cambia, así que basta con que la tarjeta anime su propia entrada.
 */
interface CardGridProps {
  items: InventoryItem[]
  /** `grid` (catálogo) o `row` (filas de la home, tarjetas algo más anchas). */
  variant?: 'grid' | 'row'
  /**
   * Ofertas de cada carta indexadas por el id de su publicación representante
   * (TASK-062), para que la tarjeta pueda anunciar "N ofertas · desde $X".
   * Opcional: las filas de la home y las relacionadas muestran una carta suelta
   * y no necesitan el grupo.
   */
  offers?: Map<string, CardOffers>
}

const LAYOUT = {
  grid: 'gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(175px,1fr))]',
  row: 'gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] sm:gap-3.5 sm:[grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]',
}

export function CardGrid({ items, variant = 'grid', offers }: CardGridProps) {
  return (
    <div className={`grid ${LAYOUT[variant]}`}>
      {items.map((item) => (
        <ProductCard key={item.id} item={item} offers={offers?.get(item.id)} />
      ))}
    </div>
  )
}
