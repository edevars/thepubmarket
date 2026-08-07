import { CONTROL_BASE } from '../filterControls'

interface FoilToggleProps {
  label: string
  /** "12 disponibles" / "Agotado", ya localizado por el llamador. */
  availableLabel: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
  /**
   * `switch`: interruptor real con `role="switch"` + `aria-checked`, para el
   * sheet mobile, donde va dentro de su propia sección con el conteo al lado.
   * `chip`: botón presionable (`aria-pressed`) para el riel de la consola,
   * donde el foil no merece un popover — es binario, se activa de un toque.
   *
   * La semántica cambia con la variante A PROPÓSITO y de forma explícita: un
   * primitive compartido no debe cambiar en silencio lo que anuncia un lector
   * de pantalla según dónde se monte.
   */
  variant?: 'switch' | 'chip'
}

/** Filtro de foil. Binario, así que es el único filtro de oferta que no
 * necesita abrir nada para usarse. */
export function FoilToggle({
  label,
  availableLabel,
  checked,
  disabled,
  onToggle,
  variant = 'switch',
}: FoilToggleProps) {
  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={checked}
        aria-disabled={disabled}
        title={`${label} · ${availableLabel}`}
        className={`clip-btn flex min-h-9 items-center gap-1.5 border px-3 font-display text-[13px] font-semibold uppercase tracking-[0.06em] ${CONTROL_BASE} ${
          disabled
            ? 'cursor-not-allowed border-line-soft bg-input/40 text-faint-2 opacity-40'
            : checked
              ? ''
              : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
        }`}
        style={
          checked
            ? {
                borderColor: 'var(--game-accent, var(--color-primary))',
                background:
                  'color-mix(in srgb, var(--game-accent, var(--color-primary)) 14%, transparent)',
                color: 'var(--game-accent, var(--color-primary))',
              }
            : undefined
        }
      >
        <span
          aria-hidden="true"
          className="text-[11px] leading-none"
          style={checked ? undefined : { opacity: 0.6 }}
        >
          ✦
        </span>
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between border border-line-soft bg-input/60 px-3 py-2.5">
      <div className="font-mono text-[10px] text-faint">{availableLabel}</div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-6 w-11 rounded-full ${CONTROL_BASE} ${
          disabled ? 'cursor-not-allowed opacity-40' : ''
        } ${checked ? '' : 'bg-line'}`}
        style={checked ? { background: 'var(--game-accent, var(--color-primary))' } : undefined}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-base ease-emphasized ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
