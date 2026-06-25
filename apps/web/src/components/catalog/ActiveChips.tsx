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
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="flex items-center gap-1.5 border border-primary/45 bg-primary/12 px-2.5 py-1 text-xs text-[#cfe0ff]"
        >
          {chip.label} <span className="text-[#7fa8ff]">✕</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-[11px] text-muted-2 underline hover:text-ink"
      >
        {t('clearAll')}
      </button>
    </div>
  )
}
