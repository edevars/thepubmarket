import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BrowseByGame } from '@/components/home/BrowseByGame'
import { CardRow } from '@/components/home/CardRow'
import { Hero } from '@/components/home/Hero'
import { PubBand } from '@/components/home/PubBand'
import { TrustStrip } from '@/components/home/TrustStrip'
import { getCatalog, getFeatured, getHeroCards, getNewArrivals } from '@/lib/catalog/data'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('home')

  const [heroCards, featured, newArrivals, all] = await Promise.all([
    getHeroCards(),
    getFeatured(),
    getNewArrivals(),
    getCatalog(),
  ])

  return (
    <main>
      <Hero heroCards={heroCards} />
      <TrustStrip />
      <CardRow eyebrow={t('featuredEyebrow')} title={t('featuredTitle')} items={featured} />
      <BrowseByGame items={all} />
      <CardRow title={t('newTitle')} items={newArrivals} />
      <PubBand />
    </main>
  )
}
