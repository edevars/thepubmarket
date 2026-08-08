import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { CardDetailView } from '@/components/detail/CardDetailView'
import { getItem, getPurchaseOptions, getRelated } from '@/lib/catalog/data'
import { getSellers } from '@/lib/sellers/data'

interface ItemPageProps {
  params: Promise<{ locale: string; id: string }>
}

export default async function CatalogItemPage({ params }: ItemPageProps) {
  const { locale, id } = await params
  setRequestLocale(locale)

  // Frontera de datos: hoy mocks, mañana la API real (misma firma).
  const item = await getItem(id)
  if (!item) notFound()

  const [related, offers, sellers] = await Promise.all([
    getRelated(item),
    getPurchaseOptions(item),
    getSellers(),
  ])

  return <CardDetailView item={item} offers={offers} related={related} sellers={sellers} />
}
