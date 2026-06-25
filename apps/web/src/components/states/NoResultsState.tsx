'use client'

import { useTranslations } from 'next-intl'
import { AngularButton } from '@/components/ui/AngularButton'

interface NoResultsStateProps {
  onClear: () => void
}

/** Sin resultados para la búsqueda/filtros actuales. */
export function NoResultsState({ onClear }: NoResultsStateProps) {
  const t = useTranslations('states')
  const tc = useTranslations('catalog')
  return (
    <div className="border border-dashed border-line bg-panel-2 px-6 py-[70px] text-center">
      <div className="relative mx-auto mb-5 h-[54px] w-[54px]">
        <span className="absolute inset-0 rounded-full border-2 border-line-strong" />
        <span className="absolute -bottom-[3px] -right-[3px] h-0.5 w-5 origin-left rotate-45 bg-line-strong" />
      </div>
      <h3 className="mb-2 font-display text-[22px] font-bold tracking-[0.03em] text-white">
        {t('noResultsTitle')}
      </h3>
      <p className="mx-auto mb-5 max-w-[400px] text-[13.5px] text-muted-2">{t('noResultsBody')}</p>
      <AngularButton onClick={onClear}>{tc('clearAll')}</AngularButton>
    </div>
  )
}
