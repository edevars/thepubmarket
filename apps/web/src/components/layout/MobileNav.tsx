'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/navigation'
import type { GameNavItem } from '@/lib/catalog/game-nav'

const itemClass =
  'flex items-center justify-between px-1.5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-ink-2 transition-colors duration-fast ease-standard hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70'
const disabledItemClass =
  'flex cursor-default items-center justify-between px-1.5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-faint'

/**
 * Navegación mobile (hamburguesa → hoja deslizable). Reemplaza el link fijo a
 * `/catalog` por un trigger que abre el mismo listado de juegos que
 * `GamesMenu` (derivado de `getGameNavItems`, TASK-041) más los links de
 * nivel superior. Reutiliza el patrón `.tpm-scrim` / `.tpm-drawer-panel` del
 * `CartDrawer` — mismo bloqueo de scroll de fondo y cierre con Escape.
 */
export function MobileNav({ games }: { games: GameNavItem[] }) {
  const t = useTranslations('common')
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('openMenu')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="site-header-mobile-menu"
        className="flex cursor-pointer flex-col gap-[3px] p-1 transition-transform duration-fast ease-standard active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 md:hidden"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="h-0.5 w-[18px] bg-ink-2" />
          <span className="h-0.5 w-[18px] bg-ink-2" />
          <span className="h-0.5 w-[18px] bg-ink-2" />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label={t('closeMenu')}
            onClick={() => setOpen(false)}
            className="tpm-scrim absolute inset-0 bg-[#04060d]/[0.66] backdrop-blur-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/70"
          />

          <nav
            id="site-header-mobile-menu"
            aria-label={t('navMore')}
            className="tpm-drawer-panel absolute inset-y-0 right-0 flex w-[78%] max-w-[300px] flex-col gap-1 overflow-y-auto overscroll-contain border-l border-line-strong bg-[#0a1120] px-5 py-5 shadow-[-24px_0_60px_rgba(0,0,0,0.55)]"
          >
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <span className="font-display text-sm font-bold uppercase tracking-[0.08em] text-white">
                {t('brand')}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('closeMenu')}
                className="flex h-7 w-7 items-center justify-center border border-line text-[13px] text-muted transition duration-fast ease-standard hover:border-primary hover:text-white active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                ✕
              </button>
            </div>

            <Link href="/catalog" onClick={() => setOpen(false)} className={itemClass}>
              {t('navCatalog')}
            </Link>

            <span className="mt-2 px-1.5 font-mono text-[10px] tracking-[0.1em] text-faint">
              {t('navMore')}
            </span>
            {games.map((game) =>
              game.available ? (
                <Link
                  key={game.tcg}
                  href={game.href}
                  onClick={() => setOpen(false)}
                  className={itemClass}
                >
                  {game.label}
                </Link>
              ) : (
                <div key={game.tcg} aria-disabled="true" className={disabledItemClass}>
                  {game.label}
                  <span className="font-mono text-[9px] tracking-[0.08em] text-faint-2">
                    {t('soon')}
                  </span>
                </div>
              ),
            )}

            <Link href="/tiendas" onClick={() => setOpen(false)} className={`mt-2 ${itemClass}`}>
              {t('navStores')}
            </Link>
          </nav>
        </div>
      )}
    </>
  )
}
