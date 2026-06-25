import { setRequestLocale } from 'next-intl/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { EmptyState } from '@/components/states/EmptyState'
import { getCatalog } from '@/lib/catalog/data'

interface CatalogPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string }>
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const { q } = await searchParams

  // Frontera de datos: hoy mocks, mañana la API real (misma firma).
  const items = await getCatalog()

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6">
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        // `key` por query: el componente cliente re-inicializa su estado de
        // filtros cuando la búsqueda del header cambia la URL.
        <CatalogView key={q ?? ''} items={items} initialQuery={q} />
      )}
    </main>
  )
}
