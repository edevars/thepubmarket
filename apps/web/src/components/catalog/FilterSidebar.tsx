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
  onToggleTcg: (t: Tcg) => void
  onToggleCondition: (c: Condition) => void
  onToggleLanguage: (l: string) => void
  onToggleFoil: () => void
  onPriceChange: (field: 'minPesos' | 'maxPesos', value: string) => void
  onClear: () => void
}

const sectionLabel = 'mb-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint'

export function FilterSidebar({
  state,
  tcgCounts,
  onToggleTcg,
  onToggleCondition,
  onToggleLanguage,
  onToggleFoil,
  onPriceChange,
  onClear,
}: FilterSidebarProps) {
  const t = useTranslations('catalog')

  return (
    <div className="border border-line-soft bg-panel-2">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
        <span className="font-display text-[15px] font-bold uppercase tracking-[0.08em] text-white">
          {t('filters')}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-primary-hover hover:text-cyan"
        >
          {t('clear')}
        </button>
      </div>

      <div className="p-4">
        {/* Juego */}
        <div className={sectionLabel}>{t('fGame')}</div>
        <div className="mb-5 flex flex-col gap-0.5">
          {tcgCounts.map(({ tcg, count }) => {
            const active = state.tcgs.includes(tcg)
            return (
              <button
                key={tcg}
                type="button"
                onClick={() => onToggleTcg(tcg)}
                className={`flex w-full items-center gap-2.5 px-1 py-1.5 text-left text-[13px] ${active ? 'text-ink' : 'text-muted'}`}
              >
                <span
                  className={`inline-flex h-3.5 w-3.5 shrink-0 border-[1.5px] ${active ? 'border-primary bg-primary' : 'border-line-strong'}`}
                />
                {TCG_META[tcg].name}
                <span className="ml-auto font-mono text-[10px] text-faint">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Condición */}
        <div className={sectionLabel}>{t('fCondition')}</div>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {CONDITIONS.map((c) => {
            const active = state.conditions.includes(c)
            return (
              <button
                key={c}
                type="button"
                onClick={() => onToggleCondition(c)}
                className={`border px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] ${
                  active
                    ? 'border-primary bg-primary/14 text-[#cfe0ff]'
                    : 'border-line bg-input text-muted-2'
                }`}
              >
                {c}
              </button>
            )
          })}
        </div>

        {/* Idioma */}
        <div className={sectionLabel}>{t('fLanguage')}</div>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {FILTER_LANGUAGES.map((l) => {
            const active = state.languages.includes(l)
            return (
              <button
                key={l}
                type="button"
                onClick={() => onToggleLanguage(l)}
                className={`border px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] ${
                  active
                    ? 'border-primary bg-primary/14 text-[#cfe0ff]'
                    : 'border-line bg-input text-muted-2'
                }`}
              >
                {l.toUpperCase()}
              </button>
            )
          })}
        </div>

        {/* Foil */}
        <div className="mb-5 flex items-center justify-between">
          <span className={`${sectionLabel} mb-0`}>{t('fFoil')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={state.foilOnly}
            aria-label={t('fFoil')}
            onClick={onToggleFoil}
            className={`relative h-5 w-[38px] rounded-full transition-colors ${state.foilOnly ? 'bg-primary' : 'bg-line'}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] ${state.foilOnly ? 'left-5' : 'left-0.5'}`}
            />
          </button>
        </div>

        {/* Precio */}
        <div className={sectionLabel}>{t('fPrice')}</div>
        <div className="flex items-center gap-2.5">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={state.minPesos}
            onChange={(e) => onPriceChange('minPesos', e.target.value)}
            placeholder="$0"
            aria-label="min"
            className="w-full border border-line bg-input px-2.5 py-1.5 font-mono text-[11px] text-muted outline-none focus:border-primary"
          />
          <span className="text-faint-2">—</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={state.maxPesos}
            onChange={(e) => onPriceChange('maxPesos', e.target.value)}
            placeholder="$5,000"
            aria-label="max"
            className="w-full border border-line bg-input px-2.5 py-1.5 font-mono text-[11px] text-muted outline-none focus:border-primary"
          />
        </div>
      </div>
    </div>
  )
}
