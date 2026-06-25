import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CardGrid } from '../../../components/catalog/CardGrid'
import { Pagination } from '../../../components/catalog/Pagination'
import { SearchBar } from '../../../components/catalog/SearchBar'
import { CATALOG_PAGE_SIZE, fetchCatalog } from '../../../lib/api'

interface CatalogPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const { q, page: pageParam } = await searchParams
  const t = await getTranslations('catalog')

  const page = Math.max(1, Number(pageParam) || 1)

  let body: React.ReactNode
  let count = 0
  try {
    const data = await fetchCatalog({ q, page })
    count = data.total
    const pages = Math.max(1, Math.ceil(data.total / CATALOG_PAGE_SIZE))
    body = (
      <>
        <CardGrid items={data.items} />
        <Pagination page={page} pages={pages} query={{ q }} />
      </>
    )
  } catch {
    body = <p style={{ color: '#dc2626', padding: '2rem 0' }}>{t('loadError')}</p>
  }

  return (
    <main
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '2.5rem 1.5rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ marginBottom: '0.25rem' }}>{t('title')}</h1>
      <p style={{ color: '#666', marginTop: 0 }}>{t('subtitle')}</p>

      <SearchBar defaultValue={q} />

      <p style={{ color: '#666', fontSize: '0.9rem' }}>{t('resultsCount', { count })}</p>

      {body}
    </main>
  )
}
