'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

export interface ActiveChip {
  key: string
  label: string
  onRemove: () => void
}

interface ActiveChipsProps {
  chips: ActiveChip[]
  onClearAll: () => void
}

/**
 * Debe coincidir con `--duration-fast` en globals.css: es el tiempo que le
 * damos a `.tpm-chip-exit` para terminar su animación antes de avisarle al
 * padre que quite el filtro de verdad.
 */
const CHIP_EXIT_MS = 120

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70'

/**
 * Chips de filtros activos, cada uno removible. Al quitar un chip no lo
 * desmontamos de inmediato: primero juega `.tpm-chip-exit` (fade + shrink,
 * ver globals.css) y solo al terminar se llama `onRemove`, para que el
 * cambio de estado no se sienta como un corte.
 */
export function ActiveChips({ chips, onClearAll }: ActiveChipsProps) {
  const t = useTranslations('catalog')
  const [exitingKeys, setExitingKeys] = useState<Set<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Limpia timers pendientes si el componente se desmonta a medio camino.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
    }
  }, [])

  function handleRemove(chip: ActiveChip) {
    if (exitingKeys.has(chip.key)) return
    setExitingKeys((prev) => new Set(prev).add(chip.key))
    const timer = setTimeout(() => {
      chip.onRemove()
      timers.current.delete(chip.key)
      setExitingKeys((prev) => {
        if (!prev.has(chip.key)) return prev
        const next = new Set(prev)
        next.delete(chip.key)
        return next
      })
    }, CHIP_EXIT_MS)
    timers.current.set(chip.key, timer)
  }

  if (chips.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => {
        const exiting = exitingKeys.has(chip.key)
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => handleRemove(chip)}
            className={`tpm-chip ${exiting ? 'tpm-chip-exit' : ''} clip-btn flex min-h-8 items-center gap-2 border border-primary/45 bg-primary/12 px-3 py-1 text-xs text-[#cfe0ff] transition-colors duration-fast ease-standard hover:border-primary hover:bg-primary/18 ${focusRing}`}
          >
            <span>{chip.label}</span>
            <span className="font-mono text-[12px] text-[#7fa8ff]">x</span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={onClearAll}
        className={`min-h-8 px-1 text-[11px] text-muted-2 underline underline-offset-4 transition-colors duration-fast ease-standard hover:text-ink ${focusRing}`}
      >
        {t('clearAll')}
      </button>
    </div>
  )
}
