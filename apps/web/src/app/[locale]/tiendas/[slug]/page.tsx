import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { SellerHubView } from '@/components/sellers/SellerHubView'
import { getSellerBySlug, getSellerInventory } from '@/lib/sellers/data'

interface SellerHubPageProps {
  params: Promise<{ locale: string; slug: string }>
}

export default async function SellerHubPage({ params }: SellerHubPageProps) {
  const { locale, slug } = await params
  setRequestLocale(locale)

  // Frontera de datos: hoy mocks, mañana la API real (misma firma).
  const seller = await getSellerBySlug(slug)
  if (!seller) notFound()

  const inventory = await getSellerInventory(seller.id)

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6">
      <SellerHubView seller={seller} inventory={inventory} />
    </main>
  )
}
