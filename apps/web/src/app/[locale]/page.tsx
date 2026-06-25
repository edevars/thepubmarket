import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { Link } from '../../i18n/navigation'
import { HealthCheck } from './health-check'

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params)
  setRequestLocale(locale)
  const t = useTranslations('health')
  const tCatalog = useTranslations('catalog')

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3rem 1.5rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ marginBottom: '0.25rem' }}>{t('title')}</h1>
      <p style={{ color: '#666', marginTop: 0 }}>{t('subtitle')}</p>
      <p style={{ marginTop: '1rem' }}>
        <Link href="/catalog">{tCatalog('title')}</Link>
      </p>
      <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid #eee' }} />
      <HealthCheck />
    </main>
  )
}
