'use client'

import type { Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { accentFor } from '@/lib/catalog/facet-presentation'
import { CONTROL_BASE } from './filterControls'
import { GameWordmark } from './GameWordmark'

interface GameTabsProps {
  /** Juegos con inventario, con su conteo total (no el filtrado). */
  tcgCounts: { tcg: Tcg; count: number }[]
  activeGame?: Tcg
  /**
   * URL del catálogo para ese juego (o para el catálogo completo con
   * `undefined`). La construye `CatalogView` con el MISMO builder que usa
   * `navigate()`, así que conserva la búsqueda y todos los filtros locales —
   * un `/catalog?game=X` pelado los perdería y rompería TASK-053.
   */
  hrefFor: (tcg: Tcg | undefined) => string
}

const TAB_BASE = `relative flex items-center gap-2 border-b-2 px-1 pb-2 pt-1 ${CONTROL_BASE}`

/**
 * Tira de pestañas de juego (TASK-057). Antes esto vivía dentro del panel de
 * filtros, donde ocupaba la sección más alta y se leía como un filtro más —
 * pero el juego NO es un filtro: cambia la URL, refiltra en el servidor y
 * remonta la vista. Sacarlo aquí lo dice sin ambigüedad y libera el riel.
 *
 * Son `<Link>` reales, no botones: cambiar de juego es navegación, así que
 * tiene que soportar Cmd/Ctrl+clic y clic central para abrir en otra pestaña.
 * `scroll={false}` mantiene la posición, igual que el resto de la consola.
 */
export function GameTabs({ tcgCounts, activeGame, hrefFor }: GameTabsProps) {
  const t = useTranslations('catalog')

  return (
    <nav
      aria-label={t('gamesNav')}
      className="tpm-scroll -mx-5 mb-1 overflow-x-auto px-5 sm:mx-0 sm:px-0"
    >
      <div className="flex w-max items-end gap-5 border-b border-line-soft sm:w-auto">
        {tcgCounts.map(({ tcg, count }) => {
          const active = activeGame === tcg
          const accent = accentFor(tcg)
          return (
            <Link
              key={tcg}
              href={hrefFor(tcg)}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              style={accent ? ({ '--game-accent': accent } as React.CSSProperties) : undefined}
              className={`${TAB_BASE} ${
                active
                  ? 'border-[color:var(--game-accent,var(--color-primary))]'
                  : 'border-transparent hover:border-line-strong'
              }`}
            >
              <GameWordmark tcg={tcg} active={active} variant="bare" />
              <span
                className={`font-mono text-[10px] ${active ? '' : 'text-faint'}`}
                style={active ? { color: 'var(--game-accent, var(--color-primary))' } : undefined}
              >
                {count}
              </span>
            </Link>
          )
        })}

        {/* Volver al catálogo completo. Antes solo se podía "des-seleccionar"
            el juego volviendo a tocarlo, que no era descubrible. */}
        <Link
          href={hrefFor(undefined)}
          scroll={false}
          aria-current={activeGame ? undefined : 'page'}
          className={`${TAB_BASE} font-display text-[13px] font-bold uppercase tracking-[0.08em] ${
            activeGame
              ? 'border-transparent text-muted-2 hover:border-line-strong hover:text-ink-2'
              : 'border-primary text-primary'
          }`}
        >
          {t('allGames')}
        </Link>
      </div>
    </nav>
  )
}
