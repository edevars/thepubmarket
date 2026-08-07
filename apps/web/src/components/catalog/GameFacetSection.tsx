import type { Tcg } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { FACET_PRESENTATION, presentationFor } from '@/lib/catalog/facet-presentation'
import type { GameFacet } from '@/lib/catalog/game-filters'
import { CollapsibleSection } from './CollapsibleSection'
import { FacetTile } from './FacetTile'
import { CONTROL_BASE, DISABLED_TILE } from './filterControls'
import { PipRow } from './PipRow'

interface GameFacetSectionProps {
  tcg: Tcg
  facet: GameFacet
  selected: string[]
  /** value -> conteo con autoexclusión (`countGameFacetValues`, TASK-053). Vacío
   * para `freeText` sin conteos calculados por el padre. */
  counts: Record<string, number>
  freeTextOptions: { value: string; label: string }[]
  onToggle: (value: string) => void
  onSet: (value: string | undefined) => void
  index: number
}

/**
 * Renderiza UNA faceta propia de juego (domain/color/type/rarity/…) según su
 * `kind` (`game-filters.ts`) y su presentación registrada (`facet-presentation.ts`,
 * TASK-052). Sin ramas por `tcg`: todo lo que decide el look es el registro —
 * un juego (o faceta) sin entrada cae directo a la tile plana de siempre.
 */
export function GameFacetSection({
  tcg,
  facet,
  selected,
  counts,
  freeTextOptions,
  onToggle,
  onSet,
  index,
}: GameFacetSectionProps) {
  const t = useTranslations('catalog')
  const facetPresentation = FACET_PRESENTATION[tcg]?.[facet.param]
  const meta = selected.length ? String(selected.length) : undefined

  if (facet.kind === 'multiValue' && facetPresentation?.layout === 'pips') {
    return (
      <CollapsibleSection label={t(facet.labelKey)} meta={meta} index={index}>
        <PipRow
          values={facet.values ?? []}
          presentation={facetPresentation.values}
          selected={selected}
          counts={counts}
          onToggle={onToggle}
        />
      </CollapsibleSection>
    )
  }

  if (facet.kind === 'multiValue') {
    return (
      <CollapsibleSection label={t(facet.labelKey)} meta={meta} index={index}>
        <div className="grid grid-cols-2 gap-1.5 pb-1">
          {(facet.values ?? []).map((value) => (
            <FacetTile
              key={value}
              label={value}
              count={counts[value] ?? 0}
              active={selected.includes(value)}
              onClick={() => onToggle(value)}
              presentation={presentationFor(tcg, facet.param, value)}
              translateNo
            />
          ))}
        </div>
      </CollapsibleSection>
    )
  }

  if (facet.kind === 'multiInt') {
    const min = facet.min ?? 0
    const max = facet.max ?? 12
    const values = Array.from({ length: max - min + 1 }, (_, i) => String(min + i))
    return (
      <CollapsibleSection label={t(facet.labelKey)} meta={meta} index={index}>
        <div className="grid grid-cols-7 gap-1.5 pb-1">
          {values.map((value) => {
            const active = selected.includes(value)
            const count = counts[value] ?? 0
            const disabled = count === 0 && !active
            return (
              <button
                key={value}
                type="button"
                onClick={() => onToggle(value)}
                disabled={disabled}
                aria-pressed={active}
                aria-disabled={disabled}
                className={`min-h-10 border font-mono text-[11px] font-semibold ${CONTROL_BASE} ${
                  disabled
                    ? DISABLED_TILE
                    : active
                      ? ''
                      : 'border-line bg-input text-muted-2 hover:border-line-strong hover:text-ink-2'
                }`}
                style={
                  active
                    ? {
                        borderColor: 'var(--game-accent, var(--color-primary))',
                        background:
                          'color-mix(in srgb, var(--game-accent, var(--color-primary)) 14%, transparent)',
                        color: 'var(--game-accent, var(--color-primary))',
                      }
                    : undefined
                }
              >
                {value}
              </button>
            )
          })}
        </div>
      </CollapsibleSection>
    )
  }

  // freeText: <select> de valor único (hoy solo `set`) — sin vocabulario fijo,
  // las opciones (y sus conteos) vienen derivadas de los items cargados.
  return (
    <CollapsibleSection label={t(facet.labelKey)} index={index}>
      <select
        value={selected[0] ?? ''}
        onChange={(e) => onSet(e.target.value || undefined)}
        aria-label={t(facet.labelKey)}
        className={`mb-1 min-h-9 w-full border border-line bg-input px-2.5 py-1.5 text-[12px] text-ink outline-none ${CONTROL_BASE} focus:border-primary`}
      >
        <option value="">{t('all')}</option>
        {freeTextOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {counts[opt.value] != null ? ` (${counts[opt.value]})` : ''}
          </option>
        ))}
      </select>
    </CollapsibleSection>
  )
}
