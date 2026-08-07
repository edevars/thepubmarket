'use client'

import type { Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { type RefObject, useCallback, useEffect, useRef } from 'react'
import { accentFor } from '@/lib/catalog/facet-presentation'
import type { FilterModel } from '@/lib/catalog/filter-model'
import type { FilterHandlers } from './controls/FilterControl'
import { FilterStack } from './FilterStack'
import { CONTROL_BASE } from './filterControls'

const TITLE_ID = 'mobile-filter-sheet-title'

interface MobileFilterSheetProps {
  open: boolean
  onClose: () => void
  /** Botón "Filtros" en `CatalogView` — recibe el foco de vuelta al cerrar. */
  triggerRef: RefObject<HTMLButtonElement | null>
  model: FilterModel
  handlers: FilterHandlers
  activeGame?: Tcg
  /** Total de filtros activos, incluidos `q` y los que no gestiona el modelo. */
  activeCount: number
  resultCount: number
  onClear: () => void
}

/**
 * Hoja inferior de filtros para mobile (`md:hidden`, TASK-055). Reutiliza el
 * patrón `.tpm-scrim` / `.tpm-drawer-panel` de `CartDrawer`/`MobileNav` (scrim
 * + panel + bloqueo de scroll + Escape), pero agrega lo que esos dos NO
 * tienen: semántica real de dialog (`role="dialog"`, `aria-modal`,
 * `aria-labelledby`), foco inicial dentro del panel al abrir, y devolución de
 * foco al botón "Filtros" en TODOS los caminos de cierre (Escape, tap en el
 * scrim, CTA "Ver resultados").
 *
 * Desde TASK-057 el encabezado con `TITLE_ID` lo renderiza este componente y
 * no un hijo genérico: el dialog tiene que ser dueño de su propia etiqueta
 * accesible, o `aria-labelledby` queda colgando si el hijo cambia.
 */
export function MobileFilterSheet({
  open,
  onClose,
  triggerRef,
  model,
  handlers,
  activeGame,
  activeCount,
  resultCount,
  onClear,
}: MobileFilterSheetProps) {
  const t = useTranslations('catalog')
  const panelRef = useRef<HTMLDivElement>(null)
  const accent = accentFor(activeGame)

  /** Cierra y regresa el foco al trigger — el único camino real de cierre;
   * Escape, el scrim y el CTA "Ver resultados" pasan por aquí. */
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
        className="tpm-drawer-panel absolute inset-x-0 bottom-0 flex max-h-[88%] flex-col border-t border-line-strong bg-panel-2 outline-none"
        style={accent ? ({ '--game-accent': accent } as React.CSSProperties) : undefined}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                id={TITLE_ID}
                className="font-display text-[15px] font-bold uppercase tracking-[0.08em] text-white"
              >
                {t('filters')}
              </span>
              {activeCount > 0 && (
                <span
                  className="border px-1.5 py-0.5 font-mono text-[10px]"
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--game-accent, var(--color-primary)) 45%, transparent)',
                    background:
                      'color-mix(in srgb, var(--game-accent, var(--color-primary)) 12%, transparent)',
                    color: 'var(--game-accent, var(--color-primary))',
                  }}
                >
                  {activeCount}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted-2">
              <span key={resultCount} className="tpm-tick inline-block">
                {t('resultsCount', { count: resultCount })}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={activeCount === 0}
            className={`text-[11px] ${CONTROL_BASE} ${
              activeCount > 0
                ? 'text-primary-hover hover:text-cyan'
                : 'cursor-not-allowed text-faint-2'
            }`}
          >
            {t('clear')}
          </button>
        </div>

        <div className="tpm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <FilterStack model={model} handlers={handlers} activeGame={activeGame} />
        </div>

        {/* `env(safe-area-inset-bottom)`: el sheet está pegado al borde
            inferior, así que sin esto el CTA queda debajo del indicador de
            home en iPhone. */}
        <div className="border-t border-line-soft p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={close}
            className={`clip-btn flex min-h-11 w-full items-center justify-center bg-primary px-4 font-display text-[13px] font-bold uppercase tracking-[0.08em] text-white ${CONTROL_BASE}`}
          >
            {t('showResults', { count: resultCount })}
          </button>
        </div>
      </div>
    </div>
  )
}
