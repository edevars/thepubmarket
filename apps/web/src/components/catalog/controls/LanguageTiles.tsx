import type { FilterValue } from '@/lib/catalog/filter-model'
import { CONTROL_BASE, DISABLED_TILE } from '../filterControls'

interface LanguageTilesProps {
  values: FilterValue[]
  onToggle: (value: string) => void
}

/**
 * Filtro de idioma de impresión. Sin identidad de color propia a propósito: el
 * idioma no tiene una escala ni un significado cromático, así que usa el
 * acento neutro de marca y deja el color de la consola para la condición
 * (semáforo de calidad) y para la faceta de identidad del juego.
 *
 * El `min-w` cubre lo mismo que en `ConditionTiles`: `grid-cols-3` es
 * `repeat(3, minmax(0,1fr))` y sin un mínimo las columnas colapsan por debajo
 * de su contenido dentro de un popover dimensionado al contenido.
 */
export function LanguageTiles({ values, onToggle }: LanguageTilesProps) {
  return (
    <div className="grid min-w-[186px] grid-cols-3 gap-1.5">
      {values.map(({ value, count, selected, disabled }) => (
        <button
          key={value}
          type="button"
          onClick={() => onToggle(value)}
          disabled={disabled}
          aria-pressed={selected}
          aria-disabled={disabled}
          className={`min-h-12 border px-2.5 py-1.5 ${CONTROL_BASE} ${
            disabled
              ? DISABLED_TILE
              : selected
                ? 'border-primary bg-primary/14 text-[#cfe0ff]'
                : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
          }`}
        >
          <span className="block font-mono text-[11px] font-semibold tracking-[0.06em]">
            {value.toUpperCase()}
          </span>
          <span className={`mt-0.5 block font-mono text-[9px] ${disabled ? '' : 'text-faint'}`}>
            {count}
          </span>
        </button>
      ))}
    </div>
  )
}
