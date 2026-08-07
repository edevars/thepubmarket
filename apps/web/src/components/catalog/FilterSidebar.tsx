import { CONDITIONS, type Condition, type Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { CONDITION_HEX, FILTER_LANGUAGES } from '@/lib/catalog/display'
import { accentFor } from '@/lib/catalog/facet-presentation'
import type { GameFacet } from '@/lib/catalog/game-filters'
import { CollapsibleSection } from './CollapsibleSection'
import { CONTROL_BASE, DISABLED_TILE } from './filterControls'
import { GameFacetSection } from './GameFacetSection'
import { GameWordmark } from './GameWordmark'

export interface FilterState {
  conditions: Condition[]
  languages: string[]
  foilOnly: boolean
  minPesos: string
  maxPesos: string
  /** Filtros propios del juego activo (TASK-040): param -> valores seleccionados. */
  game: Record<string, string[]>
}

interface FilterSidebarProps {
  state: FilterState
  /** Juegos presentes en el inventario, con su conteo. */
  tcgCounts: { tcg: Tcg; count: number }[]
  /**
   * Juego activo. Es de selección única y vive en la URL (lo filtra la API),
   * a diferencia del resto de los filtros, que son estado local.
   */
  activeGame?: Tcg
  /** Conteos con autoexclusión (TASK-053, `lib/catalog/facet-counts.ts`). */
  conditionCounts: Record<Condition, number>
  languageCounts: Record<string, number>
  foilCount: number
  activeCount: number
  resultCount: number
  onToggleTcg: (t: Tcg) => void
  onToggleCondition: (c: Condition) => void
  onToggleLanguage: (l: string) => void
  onToggleFoil: () => void
  onPriceChange: (field: 'minPesos' | 'maxPesos', value: string) => void
  onClear: () => void
  onClose?: () => void
  /** Facetas propias del juego activo (vacío si el juego no tiene, p.ej. Pokémon hoy). */
  gameFacets: readonly GameFacet[]
  gameFilterState: Record<string, string[]>
  /** Opciones de las facetas de texto libre (hoy solo `set`), derivadas de los items cargados. */
  freeTextOptions: Record<string, { value: string; label: string }[]>
  /** Conteos por valor de cada faceta de juego, param -> value -> conteo (TASK-053/054). */
  gameFacetCounts: Record<string, Record<string, number>>
  onToggleGameFilterValue: (param: string, value: string) => void
  onSetGameFilterValue: (param: string, value: string | undefined) => void
}

/**
 * Sidebar de filtros ("panel de instrumentos", TASK-054): puramente
 * presentacional y controlado por `CatalogView` (sin estado propio de datos,
 * sin `'use client'` — vive dentro del árbol cliente de `CatalogView` sin
 * necesitar su propia frontera). El acento visual del juego activo
 * (`--game-accent`, TASK-052) se inyecta aquí como custom property CSS y lo
 * consumen la placa de juego activa, el badge de conteo, el switch de foil y
 * las tiles genéricas sin identidad propia — con fallback al azul de marca.
 */
export function FilterSidebar({
  state,
  tcgCounts,
  activeGame,
  conditionCounts,
  languageCounts,
  foilCount,
  activeCount,
  resultCount,
  onToggleTcg,
  onToggleCondition,
  onToggleLanguage,
  onToggleFoil,
  onPriceChange,
  onClear,
  onClose,
  gameFacets,
  gameFilterState,
  freeTextOptions,
  gameFacetCounts,
  onToggleGameFilterValue,
  onSetGameFilterValue,
}: FilterSidebarProps) {
  const t = useTranslations('catalog')
  const tCondition = useTranslations('condition')
  const hasFilters = activeCount > 0
  const accent = accentFor(activeGame)

  return (
    <div
      className="flex max-h-[calc(100vh-2rem)] flex-col border border-line-soft bg-panel-2 shadow-[0_18px_60px_rgba(0,0,0,0.35)] md:max-h-none md:shadow-none"
      style={accent ? ({ '--game-accent': accent } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.08em] text-white">
              {t('filters')}
            </span>
            {hasFilters && (
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
          disabled={!hasFilters}
          className={`text-[11px] ${CONTROL_BASE} ${
            hasFilters ? 'text-primary-hover hover:text-cyan' : 'cursor-not-allowed text-faint-2'
          }`}
        >
          {t('clear')}
        </button>
      </div>

      <div className="tpm-scroll flex-1 overflow-y-auto overscroll-contain p-4">
        {/* Juego: placas con emblema propio (TASK-048) en vez de checkboxes genéricos. */}
        <CollapsibleSection label={t('fGame')} meta={t('all')} index={0}>
          <div className="grid gap-1.5 pb-1">
            {tcgCounts.map(({ tcg, count }) => {
              const active = activeGame === tcg
              const tcgAccent = accentFor(tcg)
              return (
                <button
                  key={tcg}
                  type="button"
                  onClick={() => onToggleTcg(tcg)}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-between gap-2 ${CONTROL_BASE}`}
                  style={
                    tcgAccent ? ({ '--game-accent': tcgAccent } as React.CSSProperties) : undefined
                  }
                >
                  <GameWordmark tcg={tcg} active={active} />
                  <span
                    className={`shrink-0 font-mono text-[10px] ${active ? '' : 'text-faint'}`}
                    style={
                      active ? { color: 'var(--game-accent, var(--color-primary))' } : undefined
                    }
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </CollapsibleSection>

        {/* Condición: coloreada con CONDITION_HEX (mismo patrón que ConditionBadge/AddCardFlow). */}
        <CollapsibleSection
          label={t('fCondition')}
          meta={state.conditions.length ? String(state.conditions.length) : undefined}
          index={1}
        >
          <div className="grid grid-cols-5 gap-1.5 pb-1">
            {CONDITIONS.map((c) => {
              const active = state.conditions.includes(c)
              const count = conditionCounts[c] ?? 0
              const disabled = count === 0 && !active
              const color = CONDITION_HEX[c]
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onToggleCondition(c)}
                  disabled={disabled}
                  aria-pressed={active}
                  aria-disabled={disabled}
                  title={tCondition(c.toLowerCase())}
                  className={`min-h-12 border px-1.5 py-1.5 text-center ${CONTROL_BASE} ${
                    disabled
                      ? DISABLED_TILE
                      : active
                        ? ''
                        : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
                  }`}
                  style={
                    active
                      ? {
                          borderColor: color,
                          background: `color-mix(in srgb, ${color} 14%, transparent)`,
                          color,
                          boxShadow: `0 0 14px color-mix(in srgb, ${color} 33%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span className="block font-mono text-[11px] font-semibold tracking-[0.06em]">
                    {c}
                  </span>
                  <span
                    className={`mt-0.5 block font-mono text-[9px] ${
                      disabled ? '' : active ? 'opacity-85' : 'text-faint'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </CollapsibleSection>

        {/* Idioma */}
        <CollapsibleSection
          label={t('fLanguage')}
          meta={state.languages.length ? String(state.languages.length) : undefined}
          index={2}
        >
          <div className="grid grid-cols-3 gap-1.5 pb-1">
            {FILTER_LANGUAGES.map((l) => {
              const active = state.languages.includes(l)
              const count = languageCounts[l] ?? 0
              const disabled = count === 0 && !active
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => onToggleLanguage(l)}
                  disabled={disabled}
                  aria-pressed={active}
                  aria-disabled={disabled}
                  className={`min-h-12 border px-2.5 py-1.5 ${CONTROL_BASE} ${
                    disabled
                      ? DISABLED_TILE
                      : active
                        ? 'border-primary bg-primary/14 text-[#cfe0ff]'
                        : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
                  }`}
                >
                  <span className="block font-mono text-[11px] font-semibold tracking-[0.06em]">
                    {l.toUpperCase()}
                  </span>
                  <span
                    className={`mt-0.5 block font-mono text-[9px] ${disabled ? '' : 'text-faint'}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </CollapsibleSection>

        {/* Foil */}
        <CollapsibleSection label={t('fFoil')} index={3}>
          <div className="flex items-center justify-between border border-line-soft bg-input/60 px-3 py-2.5">
            <div className="font-mono text-[10px] text-faint">
              {t('available', { count: foilCount })}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={state.foilOnly}
              aria-label={t('fFoil')}
              onClick={onToggleFoil}
              className={`relative h-6 w-11 rounded-full ${CONTROL_BASE} ${state.foilOnly ? '' : 'bg-line'}`}
              style={
                state.foilOnly
                  ? { background: 'var(--game-accent, var(--color-primary))' }
                  : undefined
              }
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-base ease-emphasized ${state.foilOnly ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        </CollapsibleSection>

        {/*
         * Facetas propias del juego activo (TASK-040/052/053/054). Vacío para
         * juegos sin registro propio — ver `game-filters.ts`. El look
         * (pips/tiles/select) lo decide `GameFacetSection` consultando SOLO
         * el registro de presentación, nunca el nombre del juego.
         */}
        {gameFacets.map((facet, i) => (
          <GameFacetSection
            key={facet.param}
            tcg={activeGame as Tcg}
            facet={facet}
            selected={gameFilterState[facet.param] ?? []}
            counts={gameFacetCounts[facet.param] ?? {}}
            freeTextOptions={freeTextOptions[facet.param] ?? []}
            onToggle={(value) => onToggleGameFilterValue(facet.param, value)}
            onSet={(value) => onSetGameFilterValue(facet.param, value)}
            index={4 + i}
          />
        ))}

        {/* Precio */}
        <CollapsibleSection label={t('fPrice')} meta="MXN" index={4 + gameFacets.length}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2.5 pb-1">
            <label className="grid gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                {t('priceMin')}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={state.minPesos}
                onChange={(e) => onPriceChange('minPesos', e.target.value)}
                placeholder="$0"
                className="min-h-9 w-full border border-line bg-input px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors duration-fast ease-standard focus:border-primary"
              />
            </label>
            <span className="text-faint-2">—</span>
            <label className="grid gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
                {t('priceMax')}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={state.maxPesos}
                onChange={(e) => onPriceChange('maxPesos', e.target.value)}
                placeholder="$5,000"
                className="min-h-9 w-full border border-line bg-input px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors duration-fast ease-standard focus:border-primary"
              />
            </label>
          </div>
        </CollapsibleSection>
      </div>

      {onClose && (
        <div className="border-t border-line-soft p-3 md:hidden">
          <button
            type="button"
            onClick={onClose}
            className={`clip-btn flex min-h-11 w-full items-center justify-center bg-primary px-4 font-display text-[13px] font-bold uppercase tracking-[0.08em] text-white ${CONTROL_BASE}`}
          >
            {t('showResults', { count: resultCount })}
          </button>
        </div>
      )}
    </div>
  )
}
