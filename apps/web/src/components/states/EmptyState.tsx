import { useTranslations } from 'next-intl'
import { angularButtonClasses } from '@/components/ui/AngularButton'
import { Link } from '@/i18n/navigation'

/** Estado de catálogo vacío (sin inventario publicado). */
export function EmptyState() {
  const t = useTranslations('states')
  return (
    <div className="border border-dashed border-line bg-panel-2 px-6 py-20 text-center">
      <div className="relative mx-auto mb-6 h-[70px] w-[70px]">
        <span className="absolute inset-0 border-2 border-line-strong [clip-path:polygon(50%_0,100%_27%,100%_73%,50%_100%,0_73%,0_27%)]" />
        <span className="absolute inset-6 border-[1.5px] border-line" />
      </div>
      <h3 className="mb-2 font-display text-2xl font-bold tracking-[0.03em] text-white">
        {t('emptyTitle')}
      </h3>
      <p className="mx-auto mb-6 max-w-[380px] text-sm leading-relaxed text-muted-2">
        {t('emptyBody')}
      </p>
      <Link href="/" className={angularButtonClasses('primary')}>
        {t('emptyCta')}
      </Link>
    </div>
  )
}
