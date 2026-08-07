'use client'

import { useEffect, useId, useRef } from 'react'

interface PopoverProps {
  open: boolean
  /** Se llama cuando el propio popover decide cerrarse (Escape, clic fuera,
   * foco fuera). El estado vive en el padre para que solo haya uno abierto. */
  onClose: () => void
  /** Recibe las props que el trigger DEBE llevar para que el par
   * botón↔panel quede correctamente anunciado. */
  trigger: (props: {
    ref: React.RefObject<HTMLButtonElement | null>
    'aria-haspopup': 'true'
    'aria-expanded': boolean
    'aria-controls': string
  }) => React.ReactNode
  /** Hacia dónde crece el panel. `end` lo ancla al borde derecho del trigger
   * para que no se salga por el lado derecho del riel. */
  align?: 'start' | 'end'
  /** Ancho del panel. Por defecto se adapta al contenido con un mínimo. */
  className?: string
  children: React.ReactNode
}

/**
 * Popover de disclosure: un botón que revela un panel anclado debajo.
 *
 * NO es un dialog. No lleva `role="dialog"` ni atrapa el foco a propósito: el
 * contenido es un puñado de controles y el usuario tiene que poder tabular
 * hacia fuera sin ceremonia. Para la superficie modal de verdad está
 * `MobileFilterSheet`, que sí es `role="dialog"` + `aria-modal`.
 *
 * Reglas de a11y que hereda de `layout/GamesMenu` (el patrón que ya usaba el
 * header): Escape cierra y devuelve el foco al trigger, y un clic o un foco
 * fuera del componente lo cierra. Es CRÍTICO que el panel se renderice dentro
 * del mismo `rootRef` que el trigger — si estuviera fuera, el listener de
 * `focusin` lo cerraría en cuanto el usuario tabulase hacia dentro.
 *
 * Restricciones de layout que el consumidor debe respetar (TASK-057):
 * - Ningún ancestro con `overflow` distinto de `visible`, o el panel se
 *   recorta. `overflow-x: auto` también recorta en vertical, porque el
 *   `overflow-y: visible` computa a `auto`.
 * - El contenedor necesita un `z-index` propio: las tarjetas del grid son
 *   `relative` y, sin él, pintarían por encima del panel.
 * - El panel siempre abre hacia abajo. El header del sitio es `z-20` y crea su
 *   propio contexto de apilamiento, así que nada dentro de un contenedor con
 *   z-index menor puede pintarse por encima de él.
 */
export function Popover({
  open,
  onClose,
  trigger,
  align = 'start',
  className = '',
  children,
}: PopoverProps) {
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function closeIfOutside(e: MouseEvent | FocusEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      onClose()
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', closeIfOutside)
    document.addEventListener('focusin', closeIfOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', closeIfOutside)
      document.removeEventListener('focusin', closeIfOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'true',
        'aria-expanded': open,
        'aria-controls': panelId,
      })}

      {open && (
        <div
          id={panelId}
          className={`tpm-reveal absolute top-full z-30 mt-1.5 border border-line-strong bg-[#0a1120] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.5)] ${
            align === 'end' ? 'right-0' : 'left-0'
          } ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
