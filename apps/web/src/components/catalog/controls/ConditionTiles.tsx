import type { Condition } from '@thepubmarket/shared'
import { CONDITION_HEX } from '@/lib/catalog/display'
import type { FilterValue } from '@/lib/catalog/filter-model'
import { CONTROL_BASE, DISABLED_TILE } from '../filterControls'

interface ConditionTilesProps {
  values: FilterValue[]
  /** Nombre largo localizado del código (`condition` namespace). */
  labelFor: (value: string) => string
  onToggle: (value: string) => void
}

/**
 * Filtro de condición como **semáforo de calidad**.
 *
 * `CONDITIONS` viene ordenado de mejor a peor (NM → LP → MP → HP → DMG) y
 * `CONDITION_HEX` ya es una rampa verde → rojo, así que las cinco tiles en
 * fila se leen como un gradiente continuo: la posición dentro de la rampa
 * comunica la calidad antes que el código, que es jerga que no todo comprador
 * conoce.
 *
 * La barra superior lleva su color SIEMPRE, no solo al seleccionarse — que era
 * el problema: sin selección el control era una fila de cajas grises idénticas
 * y la rampa no existía. Es el mismo lenguaje de color que `ConditionBadge`
 * usa en las tarjetas del grid, así que el filtro y el resultado hablan igual.
 *
 * `min-w`: Tailwind compila `grid-cols-5` a `repeat(5, minmax(0,1fr))`, y ese
 * mínimo de 0 deja que las columnas colapsen por debajo de su contenido. En un
 * popover, que se dimensiona al contenido, eso estrangulaba las tiles y
 * cortaba los códigos a la mitad ("DMG" → "DM").
 */
export function ConditionTiles({ values, labelFor, onToggle }: ConditionTilesProps) {
  return (
    <div className="grid min-w-[248px] grid-cols-5 gap-1.5">
      {values.map(({ value, count, selected, disabled }) => {
        const color = CONDITION_HEX[value as Condition]
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            disabled={disabled}
            aria-pressed={selected}
            aria-disabled={disabled}
            title={labelFor(value)}
            className={`relative min-h-12 overflow-hidden border px-1.5 pb-1.5 pt-2 text-center ${CONTROL_BASE} ${
              disabled
                ? DISABLED_TILE
                : selected
                  ? ''
                  : 'border-line bg-input hover:border-line-strong'
            }`}
            style={
              selected
                ? {
                    borderColor: color,
                    background: `color-mix(in srgb, ${color} 14%, transparent)`,
                    boxShadow: `0 0 14px color-mix(in srgb, ${color} 33%, transparent)`,
                  }
                : undefined
            }
          >
            {/* El segmento de la rampa. Decorativo: el color duplica lo que ya
                dicen el código y el `title`, no aporta información propia. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[3px]"
              style={{ background: color, opacity: disabled ? 0.35 : selected ? 1 : 0.75 }}
            />
            <span
              className="block font-mono text-[11px] font-semibold tracking-[0.06em]"
              style={disabled ? undefined : { color, opacity: selected ? 1 : 0.8 }}
            >
              {value}
            </span>
            <span
              className={`mt-0.5 block font-mono text-[9px] ${
                disabled ? '' : selected ? 'opacity-85' : 'text-faint'
              }`}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
