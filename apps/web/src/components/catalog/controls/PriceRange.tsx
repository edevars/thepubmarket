interface PriceRangeProps {
  minPesos: string
  maxPesos: string
  minLabel: string
  maxLabel: string
  onChange: (field: 'minPesos' | 'maxPesos', value: string) => void
}

const INPUT =
  'min-h-9 w-full border border-line bg-input px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors duration-fast ease-standard focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/70'

/** Rango de precio en pesos. Los valores viajan como strings crudos hasta
 * `local-filters.ts`, que es quien decide qué es un entero válido — el input
 * no valida por su cuenta para no pelearse con lo que el usuario está
 * tecleando a medias. */
export function PriceRange({ minPesos, maxPesos, minLabel, maxLabel, onChange }: PriceRangeProps) {
  return (
    <div className="grid min-w-[220px] grid-cols-[1fr_auto_1fr] items-end gap-2.5">
      <label className="grid gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
          {minLabel}
        </span>
        <input
          type="number"
          inputMode="numeric"
          name="priceMin"
          autoComplete="off"
          min={0}
          value={minPesos}
          onChange={(e) => onChange('minPesos', e.target.value)}
          placeholder="$0"
          className={INPUT}
        />
      </label>
      <span className="pb-2 text-faint-2">—</span>
      <label className="grid gap-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
          {maxLabel}
        </span>
        <input
          type="number"
          inputMode="numeric"
          name="priceMax"
          autoComplete="off"
          min={0}
          value={maxPesos}
          onChange={(e) => onChange('maxPesos', e.target.value)}
          placeholder="$5,000"
          className={INPUT}
        />
      </label>
    </div>
  )
}
