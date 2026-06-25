import { useTranslations } from 'next-intl'

/** Skeleton de carga del catálogo (shimmer), fiel al diseño. */
export function LoadingSkeletonGrid({ count = 10 }: { count?: number }) {
  const t = useTranslations('states')
  return (
    <div>
      <div className="mb-5 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
        <span className="h-[15px] w-[15px] animate-spin rounded-full border-2 border-line border-t-primary" />
        {t('loadingMsg')}
      </div>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] sm:[grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton estático sin identidad
          <div key={i} className="border border-line-soft bg-panel">
            <div className="tpm-shimmer aspect-[5/7] w-full" />
            <div className="p-2.5">
              <div className="mb-2.5 h-3 w-4/5 bg-[#16213a]" />
              <div className="mb-3.5 h-2 w-1/2 bg-[#131d33]" />
              <div className="h-3.5 w-2/5 bg-[#16213a]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
