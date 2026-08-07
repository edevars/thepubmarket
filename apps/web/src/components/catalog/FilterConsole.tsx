'use client'

import type { Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Popover } from '@/components/ui/Popover'
import type { FilterDescriptor, FilterModel } from '@/lib/catalog/filter-model'
import { CollapsibleSection } from './CollapsibleSection'
import { FilterControl, type FilterHandlers } from './controls/FilterControl'
import { CONTROL_BASE } from './filterControls'

interface FilterConsoleProps {
  model: FilterModel
  handlers: FilterHandlers
  activeGame?: Tcg
  /** Botón "Filtros (N)" de mobile: se renderiza dentro del riel para que en
   * pantallas chicas la barra siga teniendo una acción propia. */
  mobileTrigger: React.ReactNode
}

const TRIGGER_BASE = `clip-btn relative flex min-h-9 items-center gap-1.5 border px-3 font-display text-[13px] font-semibold uppercase tracking-[0.06em] ${CONTROL_BASE}`

/** Hairline vertical entre zonas. Decorativo: separa visualmente sin meter
 * un `<hr>` semántico en medio de una fila de controles. */
function ZoneRule() {
  return <span aria-hidden="true" className="h-6 w-px shrink-0 bg-line-soft" />
}

/**
 * Badge de selección del trigger. Va ABSOLUTO a propósito: si ocupara espacio
 * en flujo, seleccionar un valor ensancharía su propio trigger y podría
 * empujarlo al overflow con el popover abierto. Por eso `estWidth` en
 * `filter-model.ts` no cuenta el badge.
 */
function SelectionBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      aria-hidden="true"
      className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center px-1 font-mono text-[9px] leading-none"
      style={{
        background: 'var(--game-accent, var(--color-primary))',
        color: '#0a1120',
      }}
    >
      {count}
    </span>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`text-[9px] leading-none transition-transform duration-fast ease-standard ${
        open ? '-rotate-180' : ''
      }`}
    >
      ▾
    </span>
  )
}

/**
 * Consola de filtros del catálogo (TASK-057): un riel horizontal pegado bajo
 * el header que sustituye a la columna de 232px del sidebar anterior. El grid
 * de cartas recupera todo el ancho.
 *
 * Tres zonas separadas por hairlines, no por cajas:
 *  1. IDENTIDAD — la faceta firma del juego (pips de maná, runas de dominio),
 *     inline y a todo color. Es lo único cromático del riel y lo que hace que
 *     el catálogo se lea distinto según el juego.
 *  2. CARTA — el resto de facetas del juego, como triggers callados.
 *  3. OFERTA — condición, idioma, precio (triggers) y foil (toggle directo).
 * Lo que no cabe en el presupuesto de `filter-model.ts` cae en un único
 * trigger "Más filtros", que apila los controles restantes.
 *
 * Restricciones de layout que hay que preservar (ver `ui/Popover.tsx`):
 * - El wrapper sticky NO puede llevar `overflow`: rompería el sticky y
 *   recortaría los popovers. El scroller horizontal de mobile es un hijo
 *   interno, y por eso mismo NINGÚN trigger de popover puede vivir dentro de
 *   él — en mobile solo van los pips, que no abren nada.
 * - `z-10` explícito: las tarjetas del grid son `relative` y sin esto
 *   pintarían por encima de los paneles abiertos.
 */
export function FilterConsole({ model, handlers, activeGame, mobileTrigger }: FilterConsoleProps) {
  const t = useTranslations('catalog')
  // Un solo popover abierto a la vez: el estado vive aquí, no en cada Popover.
  const [openId, setOpenId] = useState<string | null>(null)

  const cardTriggers = model.inline.filter((d) => d.zone === 'card')
  const offerTriggers = model.inline.filter((d) => d.zone === 'offer' && d.kind !== 'switch')
  const foil = model.inline.find((d) => d.kind === 'switch')

  function renderTrigger(descriptor: FilterDescriptor) {
    const open = openId === descriptor.id
    const label = t(descriptor.triggerLabelKey ?? descriptor.labelKey)
    return (
      <Popover
        key={descriptor.id}
        open={open}
        onClose={() => setOpenId((current) => (current === descriptor.id ? null : current))}
        align={descriptor.align}
        trigger={(props) => (
          <button
            {...props}
            type="button"
            onClick={() => setOpenId(open ? null : descriptor.id)}
            className={`${TRIGGER_BASE} ${
              descriptor.selectedCount > 0 || open
                ? 'border-line-strong bg-panel text-ink'
                : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
            }`}
          >
            {label}
            <Chevron open={open} />
            <SelectionBadge count={descriptor.selectedCount} />
          </button>
        )}
      >
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
          {t(descriptor.labelKey)}
        </div>
        <FilterControl descriptor={descriptor} handlers={handlers} activeGame={activeGame} />
      </Popover>
    )
  }

  return (
    // El bleed negativo hace que el fondo del riel cubra también el padding
    // lateral del `main`; si no, las cartas se verían pasar por los costados
    // al hacer scroll.
    <div className="sticky top-[var(--header-h)] z-10 -mx-5 mb-4 border-y border-line-soft bg-panel-2/95 px-5 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-2">
        {model.identity && (
          <>
            <div
              // Scroller solo para los pips: en mobile son 6-7 y no siempre
              // caben. Ningún trigger de popover puede entrar aquí.
              className="tpm-scroll -my-1 flex min-w-0 overflow-x-auto py-1"
            >
              {/* `fieldset` en vez de `role="group"`: son controles de
                  formulario agrupados, y sin el nombre del grupo un lector de
                  pantalla solo oiría "Fury, botón" sin saber de qué faceta. */}
              <fieldset className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
                <legend className="sr-only">{t(model.identity.labelKey)}</legend>
                <FilterControl
                  descriptor={model.identity}
                  handlers={handlers}
                  activeGame={activeGame}
                  pipVariant="strip"
                />
              </fieldset>
            </div>
            <span className="hidden md:contents">
              <ZoneRule />
            </span>
          </>
        )}

        <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
          {cardTriggers.map(renderTrigger)}
          {model.overflow.length > 0 && (
            <Popover
              open={openId === '__more'}
              onClose={() => setOpenId((current) => (current === '__more' ? null : current))}
              align="start"
              className="tpm-scroll max-h-[60vh] w-[300px] overflow-y-auto overscroll-contain"
              trigger={(props) => (
                <button
                  {...props}
                  type="button"
                  onClick={() => setOpenId(openId === '__more' ? null : '__more')}
                  className={`${TRIGGER_BASE} ${
                    model.overflowSelectedCount > 0 || openId === '__more'
                      ? 'border-line-strong bg-panel text-ink'
                      : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
                  }`}
                >
                  {t('moreFilters')}
                  <Chevron open={openId === '__more'} />
                  <SelectionBadge count={model.overflowSelectedCount} />
                </button>
              )}
            >
              {model.overflow.map((descriptor, index) => (
                <CollapsibleSection
                  key={descriptor.id}
                  label={t(descriptor.labelKey)}
                  meta={descriptor.selectedCount ? String(descriptor.selectedCount) : undefined}
                  index={index}
                >
                  <div className="pb-1">
                    <FilterControl
                      descriptor={descriptor}
                      handlers={handlers}
                      activeGame={activeGame}
                    />
                  </div>
                </CollapsibleSection>
              ))}
            </Popover>
          )}

          {cardTriggers.length + model.overflow.length > 0 && <ZoneRule />}

          {offerTriggers.map(renderTrigger)}
          {foil && (
            <FilterControl
              descriptor={foil}
              handlers={handlers}
              activeGame={activeGame}
              foilVariant="chip"
            />
          )}
        </div>

        <div className="ml-auto md:hidden">{mobileTrigger}</div>
      </div>
    </div>
  )
}
