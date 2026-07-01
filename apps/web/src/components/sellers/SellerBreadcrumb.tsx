import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

/** Miga de pan `Catálogo / Tiendas / {nombre}`. */
export function SellerBreadcrumb({ name }: { name: string }) {
  const t = useTranslations('sellers')
  const tCommon = useTranslations('common')

  return (
    <nav
      aria-label="breadcrumb"
      className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-[0.06em] text-faint"
    >
      <Link href="/catalog" className="transition hover:text-ink-2">
        {tCommon('navCatalog')}
      </Link>
      <span className="text-faint-2">/</span>
      <Link href="/tiendas" className="transition hover:text-ink-2">
        {t('breadcrumbStores')}
      </Link>
      <span className="text-faint-2">/</span>
      <span className="text-ink-2">{name}</span>
    </nav>
  )
}
