import type { FacetValuePresentation } from '@/lib/catalog/facet-presentation'
import { CONTROL_BASE, DISABLED_TILE } from './filterControls'

interface FacetTileProps {
  label: string
  count: number
  active: boolean
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
 * siente parte del panel del juego activo.
 */
export function FacetTile({
  label,
  count,
  active,
  onClick,
  presentation,
  translateNo,
}: FacetTileProps) {
  const disabled = count === 0 && !active
  const hex = presentation?.hex
  const activeColor = hex ?? 'var(--game-accent, var(--color-primary))'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-disabled={disabled}
      title={label}
      style={
        active
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
          : active
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
        {label}
      </span>
      <span
        className={`shrink-0 font-mono text-[9px] ${disabled ? '' : active ? 'opacity-85' : 'text-faint'}`}
      >
        {count}
      </span>
    </button>
  )
}
