import type { FacetValuePresentation } from '@/lib/catalog/facet-presentation'
import type { FilterValue } from '@/lib/catalog/filter-model'
import { CONTROL_BASE, DISABLED_TILE } from './filterControls'

interface FacetTileProps {
  /** Valor ya resuelto por `buildFilterModel`: la regla de deshabilitado vive
   * allí, no aquí (TASK-057). */
  value: FilterValue
  onClick: () => void
  /** Icono/color identidad del valor, o `undefined` si no hay entrada registrada
   * (degrada a tile plana — ver `facet-presentation.ts`). */
  presentation?: FacetValuePresentation
  /** Términos propios del juego (p.ej. nombres de dominio): no se traducen. */
  translateNo?: boolean
}

/**
 * Tile genérica de valor de faceta (TASK-054): 18px de ícono (si lo hay) +
 * nombre + conteo. Con `presentation.hex` el estado seleccionado se tiñe con
 * ese color (borde sólido + ~14% de fondo + texto), mismo patrón que
 * `CONDITION_HEX` en `ConditionBadge`/`AddCardFlow`. Sin hex, el seleccionado
 * cae al acento del juego activo (`--game-accent`, con fallback al azul de
 * marca) — así una faceta sin identidad propia (type/supertype/…) igual se
 * siente parte del juego activo.
 */
export function FacetTile({ value, onClick, presentation, translateNo }: FacetTileProps) {
  const { count, selected, disabled, label } = value
  const text = label ?? value.value
  const hex = presentation?.hex
  const activeColor = hex ?? 'var(--game-accent, var(--color-primary))'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-disabled={disabled}
      title={text}
      style={
        selected
          ? {
              borderColor: activeColor,
              background: `color-mix(in srgb, ${activeColor} 14%, transparent)`,
              color: activeColor,
            }
          : undefined
      }
      className={`flex min-h-10 items-center gap-1.5 border px-2.5 py-1.5 text-left text-[12px] font-medium capitalize ${CONTROL_BASE} ${
        disabled
          ? DISABLED_TILE
          : selected
            ? ''
            : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
      }`}
    >
      {presentation?.icon ? (
        <img
          src={presentation.icon}
          alt=""
          aria-hidden="true"
          width={18}
          height={18}
          className="h-[18px] w-[18px] shrink-0"
        />
      ) : (
        hex && (
          <span
            className="clip-rhombus h-2 w-2 shrink-0"
            style={{ background: hex }}
            aria-hidden="true"
          />
        )
      )}
      <span className="min-w-0 flex-1 truncate" translate={translateNo ? 'no' : undefined}>
        {text}
      </span>
      <span
        className={`shrink-0 font-mono text-[9px] ${disabled ? '' : selected ? 'opacity-85' : 'text-faint'}`}
      >
        {count}
      </span>
    </button>
  )
}
