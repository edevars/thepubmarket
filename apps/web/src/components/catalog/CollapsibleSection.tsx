import { useId, useState } from 'react'
import { CONTROL_BASE, SECTION_LABEL } from './filterControls'

interface CollapsibleSectionProps {
  label: string
  /** Texto pequeño a la derecha del título (p.ej. cantidad seleccionada, "TODOS"). */
  meta?: string
  /** Abierta por defecto (TASK-054 AC: todas las secciones inician abiertas). */
  defaultOpen?: boolean
  /**
   * Orden de montaje para el stagger de entrada (`--i` en `.tpm-reveal`, ver
   * globals.css). No es un índice de array cualquiera: cada sección del
   * sidebar pasa su posición real para que el reveal se sienta secuencial.
   */
  index: number
  children: React.ReactNode
}

/**
 * Sección colapsable del sidebar de filtros ("panel de instrumentos",
 * TASK-054): header con chevron + `aria-expanded`, contenido animado con
 * `grid-template-rows` (transform/opacity serían insuficientes para colapsar
 * altura; `grid-template-rows` sí lo hace sin tocar layout de los hermanos).
 * Ver `.tpm-collapse` en globals.css para la transición — cubierta por el
 * bloque global de `prefers-reduced-motion`, que apunta a `*`.
 */
export function CollapsibleSection({
  label,
  meta,
  defaultOpen = true,
  index,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <div
      className="tpm-reveal mb-5"
      style={{ '--i': index, animationDelay: 'calc(var(--i) * 30ms)' } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        className={`mb-1 flex w-full items-center justify-between gap-2 py-0.5 ${CONTROL_BASE}`}
      >
        <span className={SECTION_LABEL}>{label}</span>
        <span className="flex items-center gap-2">
          {meta && <span className="font-mono text-[10px] text-faint">{meta}</span>}
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 text-faint transition-transform duration-fast ease-standard ${
              open ? 'rotate-0' : '-rotate-90'
            }`}
          >
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <div
        id={contentId}
        className="tpm-collapse"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
