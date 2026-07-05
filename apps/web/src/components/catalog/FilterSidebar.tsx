import { CONDITIONS, type Condition, type Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { FILTER_LANGUAGES, TCG_META } from '@/lib/catalog/display'

export interface FilterState {
  tcgs: Tcg[]
  conditions: Condition[]
  languages: string[]
  foilOnly: boolean
  minPesos: string
  maxPesos: string
}

interface FilterSidebarProps {
  state: FilterState
  /** Juegos presentes en el inventario, con su conteo. */
  tcgCounts: { tcg: Tcg; count: number }[]
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
}

const sectionLabel = 'font-mono text-[9px] uppercase tracking-[0.14em] text-faint'
const controlBase =
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70'

export function FilterSidebar({
  state,
  tcgCounts,
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
}: FilterSidebarProps) {
  const t = useTranslations('catalog')
  const tCondition = useTranslations('condition')
  const hasFilters = activeCount > 0

  return (
    <div className="flex max-h-[calc(100vh-2rem)] flex-col border border-line-soft bg-panel-2 shadow-[0_18px_60px_rgba(0,0,0,0.35)] md:max-h-none md:shadow-none">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.08em] text-white">
              {t('filters')}
            </span>
            {hasFilters && (
              <span className="border border-primary/45 bg-primary/12 px-1.5 py-0.5 font-mono text-[10px] text-[#cfe0ff]">
                {activeCount}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-2">
            {t('resultsCount', { count: resultCount })}
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasFilters}
          className={`text-[11px] ${controlBase} ${
            hasFilters ? 'text-primary-hover hover:text-cyan' : 'cursor-not-allowed text-faint-2'
          }`}
        >
          {t('clear')}
        </button>
      </div>

      <div className="tpm-scroll flex-1 overflow-y-auto p-4">
        {/* Juego */}
        <div className="mb-2.5 flex items-center justify-between">
          <div className={sectionLabel}>{t('fGame')}</div>
          <span className="font-mono text-[10px] text-faint">{t('all')}</span>
        </div>
        <div className="mb-5 grid gap-1.5">
          {tcgCounts.map(({ tcg, count }) => {
            const active = state.tcgs.includes(tcg)
            return (
              <button
                key={tcg}
                type="button"
                onClick={() => onToggleTcg(tcg)}
                aria-pressed={active}
                className={`flex w-full items-center gap-2.5 border px-3 py-2 text-left text-[13px] ${controlBase} ${
                  active
                    ? 'border-primary/65 bg-primary/12 text-ink'
                    : 'border-line-soft bg-input/60 text-muted hover:border-line-strong hover:text-ink-2'
                }`}
              >
                <span
                  className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border-[1.5px] text-[9px] leading-none ${
                    active ? 'border-primary bg-primary text-white' : 'border-line-strong'
                  }`}
                />
                <span className="min-w-0 flex-1 truncate">{TCG_META[tcg].name}</span>
                <span
                  className={`font-mono text-[10px] ${active ? 'text-[#cfe0ff]' : 'text-faint'}`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Condición */}
        <div className="mb-2.5 flex items-center justify-between">
          <div className={sectionLabel}>{t('fCondition')}</div>
          <span className="font-mono text-[10px] text-faint">{state.conditions.length || ''}</span>
        </div>
        <div className="mb-5 grid grid-cols-5 gap-1.5">
          {CONDITIONS.map((c) => {
            const active = state.conditions.includes(c)
            const count = conditionCounts[c] ?? 0
            return (
              <button
                key={c}
                type="button"
                onClick={() => onToggleCondition(c)}
                aria-pressed={active}
                title={tCondition(c.toLowerCase())}
                className={`min-h-12 border px-1.5 py-1.5 text-center ${controlBase} ${
                  active
                    ? 'border-primary bg-primary/14 text-[#cfe0ff]'
                    : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
                }`}
              >
                <span className="block font-mono text-[11px] font-semibold tracking-[0.06em]">
                  {c}
                </span>
                <span className="mt-0.5 block font-mono text-[9px] text-faint">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Idioma */}
        <div className="mb-2.5 flex items-center justify-between">
          <div className={sectionLabel}>{t('fLanguage')}</div>
          <span className="font-mono text-[10px] text-faint">{state.languages.length || ''}</span>
        </div>
        <div className="mb-5 grid grid-cols-3 gap-1.5">
          {FILTER_LANGUAGES.map((l) => {
            const active = state.languages.includes(l)
            const count = languageCounts[l] ?? 0
            return (
              <button
                key={l}
                type="button"
                onClick={() => onToggleLanguage(l)}
                aria-pressed={active}
                className={`min-h-12 border px-2.5 py-1.5 ${controlBase} ${
                  active
                    ? 'border-primary bg-primary/14 text-[#cfe0ff]'
                    : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
                }`}
              >
                <span className="block font-mono text-[11px] font-semibold tracking-[0.06em]">
                  {l.toUpperCase()}
                </span>
                <span className="mt-0.5 block font-mono text-[9px] text-faint">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Foil */}
        <div className="mb-5 flex items-center justify-between border border-line-soft bg-input/60 px-3 py-2.5">
          <div>
            <span className={sectionLabel}>{t('fFoil')}</span>
            <div className="mt-0.5 font-mono text-[10px] text-faint">
              {t('available', { count: foilCount })}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.foilOnly}
            aria-label={t('fFoil')}
            onClick={onToggleFoil}
            className={`relative h-6 w-11 rounded-full transition-colors ${controlBase} ${
              state.foilOnly ? 'bg-primary' : 'bg-line'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] ${state.foilOnly ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        </div>

        {/* Precio */}
        <div className="mb-2.5 flex items-center justify-between">
          <div className={sectionLabel}>{t('fPrice')}</div>
          <span className="font-mono text-[10px] text-faint">MXN</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2.5">
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
              className="min-h-9 w-full border border-line bg-input px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors focus:border-primary"
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
              className="min-h-9 w-full border border-line bg-input px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors focus:border-primary"
            />
          </label>
        </div>
      </div>

      {onClose && (
        <div className="border-t border-line-soft p-3 md:hidden">
          <button
            type="button"
            onClick={onClose}
            className="clip-btn flex min-h-11 w-full items-center justify-center bg-primary px-4 font-display text-[13px] font-bold uppercase tracking-[0.08em] text-white"
          >
            {t('showResults', { count: resultCount })}
          </button>
        </div>
      )}
    </div>
  )
}
