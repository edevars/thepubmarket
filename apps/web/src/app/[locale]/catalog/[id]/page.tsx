import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { CardDetailView } from '@/components/detail/CardDetailView'
import { getItem, getRelated } from '@/lib/catalog/data'

interface ItemPageProps {
  params: Promise<{ locale: string; id: string }>
}

export default async function CatalogItemPage({ params }: ItemPageProps) {
  const { locale, id } = await params
  setRequestLocale(locale)

  // Frontera de datos: hoy mocks, mañana la API real (misma firma).
  const item = await getItem(id)
  if (!item) notFound()

  const related = await getRelated(item)

  return <CardDetailView item={item} related={related} />
}
