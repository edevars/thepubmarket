import { useTranslations } from 'next-intl'

export interface ActiveChip {
  key: string
  label: string
  onRemove: () => void
}

interface ActiveChipsProps {
  chips: ActiveChip[]
  onClearAll: () => void
}

/** Chips de filtros activos, cada uno removible. */
export function ActiveChips({ chips, onClearAll }: ActiveChipsProps) {
  const t = useTranslations('catalog')
  if (chips.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="clip-btn flex min-h-8 items-center gap-2 border border-primary/45 bg-primary/12 px-3 py-1 text-xs text-[#cfe0ff] transition-colors hover:border-primary hover:bg-primary/18"
        >
          <span>{chip.label}</span>
          <span className="font-mono text-[12px] text-[#7fa8ff]">x</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="min-h-8 px-1 text-[11px] text-muted-2 underline underline-offset-4 hover:text-ink"
      >
        {t('clearAll')}
      </button>
    </div>
  )
}
