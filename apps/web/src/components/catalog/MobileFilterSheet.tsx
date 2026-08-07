'use client'

import { useTranslations } from 'next-intl'
import { type RefObject, useCallback, useEffect, useRef } from 'react'
import { FilterSidebar, type FilterSidebarProps } from './FilterSidebar'

const TITLE_ID = 'mobile-filter-sheet-title'

interface MobileFilterSheetProps extends Omit<FilterSidebarProps, 'titleId' | 'onClose'> {
  open: boolean
  onClose: () => void
  /** Botón "Filtros" en `CatalogView` — recibe el foco de vuelta al cerrar. */
  triggerRef: RefObject<HTMLButtonElement | null>
}

/**
 * Hoja inferior de filtros para mobile (`md:hidden`, TASK-055): reemplaza el
 * `<aside>` inline que antes hacía doble función mobile/desktop en
 * `CatalogView`. Reutiliza el patrón `.tpm-scrim` / `.tpm-drawer-panel` de
 * `CartDrawer`/`MobileNav` (scrim + panel + bloqueo de scroll + Escape), pero
 * agrega lo que esos dos NO tienen: semántica real de dialog
 * (`role="dialog"`, `aria-modal`, `aria-labelledby`), foco inicial dentro del
 * panel al abrir, y devolución de foco al botón "Filtros" en TODOS los
 * caminos de cierre (Escape, tap en el scrim, CTA "Ver resultados" de
 * `FilterSidebar`) — no solo Escape como en `MobileNav`.
 */
export function MobileFilterSheet({
  open,
  onClose,
  triggerRef,
  ...filterSidebarProps
}: MobileFilterSheetProps) {
  const t = useTranslations('catalog')
  const panelRef = useRef<HTMLDivElement>(null)

  /** Cierra y regresa el foco al trigger — el único camino real de cierre;
   * Escape, el scrim y el CTA interno de `FilterSidebar` pasan por aquí. */
  const close = useCallback(() => {
    onClose()
    triggerRef.current?.focus()
  }, [onClose, triggerRef])

  // Bloquea el scroll del fondo, cierra con Escape y mueve el foco al panel
  // al abrir (mismo mecanismo de CartDrawer + foco inicial que a él le falta).
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label={t('closeFilters')}
        onClick={close}
        className="tpm-scrim absolute inset-0 bg-[#04060d]/[0.66] backdrop-blur-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/70"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        className="tpm-drawer-panel absolute inset-x-0 bottom-0 flex max-h-[88%] flex-col border-t border-line-strong outline-none"
      >
        <FilterSidebar {...filterSidebarProps} titleId={TITLE_ID} onClose={close} />
      </div>
    </div>
  )
}
