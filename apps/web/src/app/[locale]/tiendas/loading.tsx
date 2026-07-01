import { useTranslations } from 'next-intl'

/** Skeleton de carga de la galería de tiendas (Suspense del App Router). */
export default function TiendasLoading() {
  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6">
      <LoadingGallery />
    </main>
  )
}

function LoadingGallery() {
  const t = useTranslations('sellers')
  return (
    <div>
      <div className="mb-5 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
        <span className="h-[15px] w-[15px] animate-spin rounded-full border-2 border-line border-t-primary" />
        {t('galleryLoading')}
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton estático sin identidad
          <div key={i} className="border border-line-soft bg-panel">
            <div className="tpm-shimmer aspect-[16/9] w-full" />
            <div className="p-4">
              <div className="mb-2.5 h-4 w-3/5 bg-[#16213a]" />
              <div className="mb-3.5 h-2.5 w-2/5 bg-[#131d33]" />
              <div className="h-3 w-1/3 bg-[#16213a]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
