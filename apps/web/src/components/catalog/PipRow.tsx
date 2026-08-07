import type { FacetValuePresentation } from '@/lib/catalog/facet-presentation'
import { CONTROL_BASE } from './filterControls'

interface PipRowProps {
  /** Vocabulario canónico del valor (p.ej. MTG_COLORS: W/U/B/R/G/C). */
  values: readonly string[]
  /** value -> icono/hex, ya resuelto desde `FACET_PRESENTATION` por el padre. */
  presentation: Record<string, FacetValuePresentation>
  selected: string[]
  /** value -> conteo con autoexclusión (`countGameFacetValues`, TASK-053). */
  counts: Record<string, number>
  onToggle: (value: string) => void
}

/**
 * Fila de "pips" circulares (TASK-054) — hoy solo para `color` de MTG
 * (`layout: 'pips'` en `facet-presentation.ts`). Sin seleccionar: ícono en
 * escala de grises y tenue. Seleccionado: ícono a color completo + anillo de
 * 2px en el hex identidad + glow suave + press-pop al tocar.
 */
export function PipRow({ values, presentation, selected, counts, onToggle }: PipRowProps) {
  return (
    <div className="flex flex-wrap gap-2.5 pb-1">
      {values.map((value) => {
        const active = selected.includes(value)
        const count = counts[value] ?? 0
        const disabled = count === 0 && !active
        const pres = presentation[value]
        const hex = pres?.hex

        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            disabled={disabled}
            aria-pressed={active}
            aria-disabled={disabled}
            aria-label={value}
            title={value}
            className={`flex flex-col items-center gap-1 ${CONTROL_BASE} active:scale-[0.94] ${
              disabled ? 'cursor-not-allowed pointer-events-none opacity-40' : ''
            }`}
          >
            <span
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-line bg-input transition-[border-color,box-shadow] duration-fast ease-standard"
              style={
                active && hex
                  ? {
                      borderColor: hex,
                      boxShadow: `0 0 10px color-mix(in srgb, ${hex} 55%, transparent)`,
                    }
                  : undefined
              }
            >
              {pres?.icon && (
                <img
                  src={pres.icon}
                  alt=""
                  aria-hidden="true"
                  width={20}
                  height={20}
                  className={`h-5 w-5 transition duration-base ease-standard ${
                    active ? '' : 'opacity-45 grayscale'
                  }`}
                />
              )}
            </span>
            <span
              className={`font-mono text-[9px] ${
                disabled ? 'text-faint-2' : active ? 'text-ink-2' : 'text-faint'
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
