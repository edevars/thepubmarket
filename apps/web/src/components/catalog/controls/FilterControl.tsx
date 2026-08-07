import type { Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { FACET_PRESENTATION, presentationFor } from '@/lib/catalog/facet-presentation'
import type { FilterDescriptor } from '@/lib/catalog/filter-model'
import { FacetTile } from '../FacetTile'
import { CONTROL_BASE, DISABLED_TILE } from '../filterControls'
import { PipRow } from '../PipRow'
import { ConditionTiles } from './ConditionTiles'
import { FoilToggle } from './FoilToggle'
import { LanguageTiles } from './LanguageTiles'
import { PriceRange } from './PriceRange'

/**
 * Los tres únicos gestos que un control de filtro puede producir. `CatalogView`
 * los cablea a los dos canales de URL de TASK-053 según `descriptor.source`:
 * `local` → `writeLocalFilters` (`history.replaceState`, sin remount),
 * `game` → `navigate` (`router.push`).
 */
export interface FilterHandlers {
  onToggleValue: (descriptor: FilterDescriptor, value: string) => void
  onSetValue: (descriptor: FilterDescriptor, value: string | undefined) => void
  onPriceChange: (field: 'minPesos' | 'maxPesos', value: string) => void
}

interface FilterControlProps {
  descriptor: FilterDescriptor
  handlers: FilterHandlers
  /** Juego activo, solo para resolver la presentación de las facetas de juego. */
  activeGame?: Tcg
  /** El foil es `role="switch"` en el sheet y toggle presionable en el riel. */
  foilVariant?: 'switch' | 'chip'
  /** Los pips se compactan en el riel de la consola. */
  pipVariant?: 'wrap' | 'strip'
}

/**
 * Despacha un descriptor de filtro al control que le corresponde. Es el único
 * sitio del código que conoce el mapa `kind` → componente, así que la consola
 * horizontal y el sheet vertical pintan exactamente los mismos controles sin
 * duplicar una sola rama.
 *
 * No hay ni una condición por nombre de juego: qué se pinta lo deciden
 * `game-filters.ts` (qué facetas existen) y `facet-presentation.ts` (cómo se
 * ven), igual que en TASK-052/054.
 */
export function FilterControl({
  descriptor,
  handlers,
  activeGame,
  foilVariant = 'switch',
  pipVariant = 'wrap',
}: FilterControlProps) {
  const t = useTranslations('catalog')
  const tCondition = useTranslations('condition')
  const { kind, values } = descriptor
  const toggle = (value: string) => handlers.onToggleValue(descriptor, value)

  if (kind === 'pips') {
    const presentation = activeGame
      ? (FACET_PRESENTATION[activeGame]?.[descriptor.id]?.values ?? {})
      : {}
    return (
      <PipRow values={values} presentation={presentation} onToggle={toggle} variant={pipVariant} />
    )
  }

  if (kind === 'switch') {
    const value = values[0]
    return (
      <FoilToggle
        label={t('fFoil')}
        availableLabel={t('available', { count: value?.count ?? 0 })}
        checked={value?.selected ?? false}
        disabled={value?.disabled ?? false}
        onToggle={() => toggle(value?.value ?? 'foil')}
        variant={foilVariant}
      />
    )
  }

  if (kind === 'range') {
    return (
      <PriceRange
        minPesos={descriptor.range?.minPesos ?? ''}
        maxPesos={descriptor.range?.maxPesos ?? ''}
        minLabel={t('priceMin')}
        maxLabel={t('priceMax')}
        onChange={handlers.onPriceChange}
      />
    )
  }

  if (kind === 'ints') {
    // Rejilla compacta de enteros (energy/might 0-12). Sin conteo visible: a
    // este tamaño no cabe, y el estado deshabilitado ya dice si hay stock.
    return (
      <div className="grid grid-cols-7 gap-1.5">
        {values.map(({ value, selected, disabled, count }) => (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            disabled={disabled}
            aria-pressed={selected}
            aria-disabled={disabled}
            title={`${value} · ${count}`}
            className={`min-h-10 border font-mono text-[11px] font-semibold ${CONTROL_BASE} ${
              disabled
                ? DISABLED_TILE
                : selected
                  ? ''
                  : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
            }`}
            style={
              selected
                ? {
                    borderColor: 'var(--game-accent, var(--color-primary))',
                    background:
                      'color-mix(in srgb, var(--game-accent, var(--color-primary)) 14%, transparent)',
                    color: 'var(--game-accent, var(--color-primary))',
                  }
                : undefined
            }
          >
            {value}
          </button>
        ))}
      </div>
    )
  }

  if (kind === 'select') {
    // Valor único (hoy solo `set`): vocabulario abierto derivado del inventario
    // cargado, así que un `<select>` nativo es la opción honesta — y la única
    // que ya trae búsqueda por teclado gratis.
    const selected = values.find((v) => v.selected)?.value ?? ''
    return (
      <select
        value={selected}
        onChange={(e) => handlers.onSetValue(descriptor, e.target.value || undefined)}
        aria-label={t(descriptor.labelKey)}
        className={`min-h-9 w-full min-w-[200px] border border-line bg-input px-2.5 py-1.5 text-[12px] text-ink outline-none ${CONTROL_BASE} focus:border-primary`}
      >
        <option value="">{t('all')}</option>
        {values.map(({ value, label, count }) => (
          <option key={value} value={value}>
            {label ?? value} ({count})
          </option>
        ))}
      </select>
    )
  }

  // 'tiles': condición e idioma (filtros de oferta) tienen primitiva propia
  // porque su presentación no es genérica — la condición es una rampa de
  // color, el idioma no tiene color. El resto de facetas de juego cae en la
  // tile genérica, que resuelve icono/hex desde el registro de presentación.
  if (descriptor.id === 'cond') {
    return (
      <ConditionTiles
        values={values}
        labelFor={(value) => tCondition(value.toLowerCase())}
        onToggle={toggle}
      />
    )
  }

  if (descriptor.id === 'lang') {
    return <LanguageTiles values={values} onToggle={toggle} />
  }

  return (
    <div className="grid min-w-[240px] grid-cols-2 gap-1.5">
      {values.map((value) => (
        <FacetTile
          key={value.value}
          value={value}
          onClick={() => toggle(value.value)}
          presentation={presentationFor(activeGame, descriptor.id, value.value)}
          translateNo
        />
      ))}
    </div>
  )
}
