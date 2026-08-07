import type { FacetValuePresentation } from '@/lib/catalog/facet-presentation'
import type { FilterValue } from '@/lib/catalog/filter-model'
import { CONTROL_BASE } from './filterControls'

interface PipRowProps {
  /** Valores ya resueltos por `buildFilterModel`: conteo, selección y
   * deshabilitado vienen decididos, aquí solo se pintan. */
  values: FilterValue[]
  /** value -> icono/hex, ya resuelto desde `FACET_PRESENTATION` por el padre. */
  presentation: Record<string, FacetValuePresentation>
  onToggle: (value: string) => void
  /**
   * `wrap`: pips de 34px con su conteo debajo, para el sheet mobile, donde hay
   * alto de sobra. `strip`: pips de 30px sin conteo, para la consola — es el
   * elemento firma del riel y el conteo lo convertiría en ruido; el estado
   * atenuado ya comunica "aquí no hay nada".
   */
  variant?: 'wrap' | 'strip'
}

/**
 * Fila de "pips" circulares (TASK-054): la faceta de IDENTIDAD del juego —
 * colores de maná en MTG, dominios en Riftbound. Es lo único a color de la
 * consola de filtros, y lo que hace que el catálogo se lea distinto según el
 * juego activo. Sin seleccionar: ícono en escala de grises y tenue.
 * Seleccionado: ícono a color + anillo de 2px en el hex identidad + glow suave
 * + press-pop al tocar.
 */
export function PipRow({ values, presentation, onToggle, variant = 'wrap' }: PipRowProps) {
  const strip = variant === 'strip'
  const size = strip ? 30 : 34

  return (
    <div className={strip ? 'flex items-center gap-2' : 'flex flex-wrap gap-2.5 pb-1'}>
      {values.map(({ value, count, selected, disabled }) => {
        const pres = presentation[value]
        const hex = pres?.hex

        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            disabled={disabled}
            aria-pressed={selected}
            aria-disabled={disabled}
            aria-label={value}
            title={value}
            className={`flex flex-col items-center gap-1 ${CONTROL_BASE} active:scale-[0.94] ${
              disabled ? 'pointer-events-none cursor-not-allowed opacity-40' : ''
            }`}
          >
            <span
              className="flex items-center justify-center rounded-full border-2 border-line bg-input transition-[border-color,box-shadow] duration-fast ease-standard"
              style={{
                height: size,
                width: size,
                ...(selected && hex
                  ? {
                      borderColor: hex,
                      boxShadow: `0 0 10px color-mix(in srgb, ${hex} 55%, transparent)`,
                    }
                  : null),
              }}
            >
              {pres?.icon && (
                <img
                  src={pres.icon}
                  alt=""
                  aria-hidden="true"
                  width={strip ? 17 : 20}
                  height={strip ? 17 : 20}
                  className={`transition duration-base ease-standard ${strip ? 'h-[17px] w-[17px]' : 'h-5 w-5'} ${
                    selected ? '' : 'opacity-45 grayscale'
                  }`}
                />
              )}
            </span>
            {!strip && (
              <span
                className={`font-mono text-[9px] ${
                  disabled ? 'text-faint-2' : selected ? 'text-ink-2' : 'text-faint'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
