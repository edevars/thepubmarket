import { setRequestLocale } from 'next-intl/server'
import { SellerGallery } from '@/components/sellers/SellerGallery'
import { EmptyState } from '@/components/states/EmptyState'
import { getSellers } from '@/lib/sellers/data'

interface TiendasPageProps {
  params: Promise<{ locale: string }>
}

export default async function TiendasPage({ params }: TiendasPageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  // Frontera de datos: hoy mocks, mañana la API real (misma firma).
  const sellers = await getSellers()

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6">
      {sellers.length === 0 ? <EmptyState /> : <SellerGallery sellers={sellers} />}
    </main>
  )
}
