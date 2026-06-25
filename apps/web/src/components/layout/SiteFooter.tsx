import { useTranslations } from 'next-intl'

export function SiteFooter() {
  const t = useTranslations('common')
  return (
    <footer className="mt-7 flex flex-wrap items-center justify-between gap-3.5 border-t border-line-soft px-6 py-8">
      <span className="font-mono text-[10px] tracking-[0.14em] text-faint-2">{t('footerTag')}</span>
      <span className="text-[11px] text-faint-2">{t('footerNote')}</span>
    </footer>
  )
}
