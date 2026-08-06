'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/navigation'
import type { GameNavItem } from '@/lib/catalog/game-nav'
import { navLinkClass } from './nav-styles'

/**
 * Menú desplegable "Juegos" del header (desktop). Sustituye el link fijo a
 * Magic y el placeholder inerte por una lista real de TCGs derivada de
 * `getGameNavItems` (TASK-041): cada juego con inventario activo enlaza a su
 * catálogo filtrado, el resto se muestra atenuado con la etiqueta "Pronto",
 * igual criterio que los mosaicos de la home (`BrowseByGame`), sin JSX
 * hardcodeado por juego.
 *
 * Patrón "disclosure": el botón controla `aria-expanded`/`aria-controls` y el
 * panel se cierra con Escape (devolviendo el foco al botón) o al hacer clic o
 * enfocar algo fuera del componente. Los items son links normales — la
 * navegación por Tab ya los recorre en orden, sin necesitar manejo de flechas.
 */
export function GamesMenu({ games }: { games: GameNavItem[] }) {
  const t = useTranslations('common')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function closeIfOutside(e: MouseEvent | FocusEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', closeIfOutside)
    document.addEventListener('focusin', closeIfOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', closeIfOutside)
      document.removeEventListener('focusin', closeIfOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="site-header-games-menu"
        className={`flex items-center gap-1.5 active:scale-[0.97] ${navLinkClass}`}
      >
        {t('navMore')}
        <span
          aria-hidden="true"
          className={`text-[9px] leading-none transition-transform duration-fast ease-standard ${open ? '-rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          id="site-header-games-menu"
          className="tpm-reveal absolute left-0 top-full z-30 mt-2 w-52 border border-line-strong bg-[#0a1120] py-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
        >
          {games.map((game) =>
            game.available ? (
              <Link
                key={game.tcg}
                href={game.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3.5 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-2 transition-colors duration-fast ease-standard hover:bg-panel-2 hover:text-primary-hover focus-visible:outline-none focus-visible:bg-panel-2 focus-visible:text-primary-hover"
              >
                {game.label}
              </Link>
            ) : (
              <div
                key={game.tcg}
                aria-disabled="true"
                className="flex cursor-default items-center justify-between px-3.5 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.05em] text-faint"
              >
                {game.label}
                <span className="font-mono text-[9px] tracking-[0.08em] text-faint-2">
                  {t('soon')}
                </span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
