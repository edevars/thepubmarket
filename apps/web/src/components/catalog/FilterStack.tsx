import type { Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import type { FilterModel } from '@/lib/catalog/filter-model'
import { CollapsibleSection } from './CollapsibleSection'
import { FilterControl, type FilterHandlers } from './controls/FilterControl'

interface FilterStackProps {
  model: FilterModel
  handlers: FilterHandlers
  activeGame?: Tcg
}

/**
 * Los filtros apilados en vertical, una sección colapsable por descriptor.
 * Es la forma que toman dentro del bottom sheet mobile y dentro del popover
 * "Más filtros" de la consola — los mismos descriptores que el riel horizontal
 * pinta como triggers, sin una sola rama duplicada.
 *
 * El orden es el canónico de `model.all`: identidad del juego, resto de
 * facetas de la carta y por último los filtros de la oferta (condición,
 * idioma, precio, foil). Primero se acota qué carta se busca y después bajo
 * qué condiciones se compra.
 */
export function FilterStack({ model, handlers, activeGame }: FilterStackProps) {
  const t = useTranslations('catalog')

  return (
    <>
      {model.all.map((descriptor, index) => (
        <CollapsibleSection
          key={descriptor.id}
          label={t(descriptor.labelKey)}
          meta={descriptor.selectedCount ? String(descriptor.selectedCount) : undefined}
          index={index}
        >
          <div className="pb-1">
            <FilterControl descriptor={descriptor} handlers={handlers} activeGame={activeGame} />
          </div>
        </CollapsibleSection>
      ))}
    </>
  )
}
