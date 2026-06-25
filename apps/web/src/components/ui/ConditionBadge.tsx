import type { Condition } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { CONDITION_HEX, conditionKey } from '@/lib/catalog/display'

interface ConditionBadgeProps {
  condition: Condition
  /** Añade el nombre largo localizado (p. ej. "NM · Casi Nueva"). */
  showFull?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Indicador de condición: punto + código, color consistente por estado. */
export function ConditionBadge({
  condition,
  showFull = false,
  size = 'sm',
  className = '',
}: ConditionBadgeProps) {
  const t = useTranslations('condition')
  const color = CONDITION_HEX[condition]
  const dot = size === 'md' ? 'h-2 w-2' : 'h-[7px] w-[7px]'
  const text = size === 'md' ? 'text-[11px]' : 'text-[10px]'

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono ${text} font-semibold tracking-[0.08em] ${className}`}
      style={{ color, borderColor: color }}
    >
      <span className={`${dot} shrink-0`} style={{ background: color }} />
      {condition}
      {showFull && <span className="font-normal opacity-90">· {t(conditionKey(condition))}</span>}
    </span>
  )
}
