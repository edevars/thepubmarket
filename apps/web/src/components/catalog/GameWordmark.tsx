import type { Tcg } from '@thepubmarket/shared'
import { TCG_META } from '@/lib/catalog/display'

interface GameWordmarkProps {
  tcg: Tcg
  /** Estado seleccionado (lo controla el padre, p.ej. un botón de filtro). */
  active?: boolean
  /**
   * `plate`: placa angular con borde y glow, para superficies donde el
   * wordmark es el control entero. `bare`: emblema + nombre sin placa, para la
   * tira de pestañas de juego, donde el estado activo ya lo comunica el
   * subrayado y una segunda caja alrededor sería ruido (TASK-057).
   */
  variant?: 'plate' | 'bare'
}

/**
 * Wordmark propio por juego para el selector de catálogo (TASK-048). Es
 * identidad visual de The Pub Market, NO el logo oficial de cada TCG:
 * placa angular con el nombre en tipografía display + un emblema geométrico
 * pequeño. MTG y Riftbound tienen emblema dedicado; el resto usa un
 * monograma genérico dentro de un rombo (`TCG_META.short`).
 *
 * Puramente presentacional: sin estado ni handlers propios, el padre decide
 * `active` (p.ej. un `<button>` de filtro con `aria-pressed`).
 */
export function GameWordmark({ tcg, active = false, variant = 'plate' }: GameWordmarkProps) {
  const meta = TCG_META[tcg]

  if (variant === 'bare') {
    return (
      <span
        className={`inline-flex items-center gap-2 transition duration-fast ease-standard ${
          active ? bareActive : bareInactive
        }`}
      >
        <Emblem tcg={tcg} short={meta.short} />
        <span className={nameClass}>{meta.name}</span>
      </span>
    )
  }

  return (
    <span className={`${plateBase} ${active ? plateActive : plateInactive}`}>
      <Emblem tcg={tcg} short={meta.short} />
      <span className={nameClass}>{meta.name}</span>
      <span className={shortClass}>{meta.short}</span>
    </span>
  )
}

function Emblem({ tcg, short }: { tcg: Tcg; short: string }) {
  if (tcg === 'mtg') return <MtgEmblem />
  if (tcg === 'riftbound') return <RiftboundEmblem />
  return <MonogramEmblem short={short} />
}

/** Colores muted de referencia W/U/B/R/G, en el orden clásico de maná. */
const WUBRG_HEX = ['#e9e7d7', '#4e8fd1', '#9a8fa8', '#d3583c', '#4aa66a']
/** Cinco pips en arco ("sonrisa"), evocando la rueda de colores sin copiarla. */
const PIP_POSITIONS: [number, number][] = [
  [3, 14],
  [7, 9],
  [12, 7],
  [17, 9],
  [21, 14],
]

function MtgEmblem() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      {PIP_POSITIONS.map(([cx, cy], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: posiciones fijas, no reordenan
        <circle key={i} cx={cx} cy={cy} r="2.3" fill={WUBRG_HEX[i]} opacity="0.85" />
      ))}
    </svg>
  )
}

function RiftboundEmblem() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2.5" y="8.5" width="7" height="7" transform="rotate(45 6 12)" />
      <rect
        x="9.5"
        y="3"
        width="6"
        height="6"
        transform="rotate(45 12.5 6)"
        className="fill-cyan/55 stroke-cyan"
      />
      <rect x="14.5" y="9" width="7" height="7" transform="rotate(45 18 12.5)" />
    </svg>
  )
}

/** Monograma genérico (Pokémon, Yu-Gi-Oh!, One Piece, Lorcana): `short` dentro de un rombo. */
function MonogramEmblem({ short }: { short: string }) {
  return (
    <span className="clip-rhombus flex h-5 w-5 shrink-0 items-center justify-center border border-current">
      <span className="font-mono text-[6.5px] font-bold leading-none tracking-[0.02em]">
        {short}
      </span>
    </span>
  )
}

const plateBase =
  'clip-btn inline-flex items-center gap-2 border px-3 py-1.5 transition duration-fast ease-standard hover:brightness-110'
/**
 * Estado activo: borde + texto toman `--game-accent` (con fallback al azul
 * de marca) y un glow suave (~26% alfa). `color-mix` evita tener que
 * hardcodear un hex de glow distinto por juego.
 */
const plateActive =
  'border-[color:var(--game-accent,var(--color-primary))] text-[color:var(--game-accent,var(--color-primary))] shadow-[0_0_22px_color-mix(in_srgb,var(--game-accent,var(--color-primary))_26%,transparent)]'
const plateInactive = 'border-line-soft text-muted hover:border-line-strong hover:text-ink-2'
/** Variante `bare`: solo color, sin caja. El subrayado de la pestaña activa
 * hace el trabajo que en la placa hacían borde y glow. */
const bareActive = 'text-[color:var(--game-accent,var(--color-primary))]'
const bareInactive = 'text-muted-2 hover:text-ink-2'
const nameClass = 'font-display text-[13px] font-bold uppercase tracking-[0.08em]'
const shortClass = 'font-mono text-[9px] uppercase tracking-[0.14em] opacity-70'
