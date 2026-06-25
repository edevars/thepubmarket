import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '../../../../i18n/navigation'
import { fetchCatalogItem, formatPriceCents } from '../../../../lib/api'

interface ItemPageProps {
  params: Promise<{ locale: string; id: string }>
}

export default async function CatalogItemPage({ params }: ItemPageProps) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const t = await getTranslations('catalog')

  const item = await fetchCatalogItem(id)

  const wrap = (children: React.ReactNode) => (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '2.5rem 1.5rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <Link href="/catalog" style={{ color: '#666', textDecoration: 'none' }}>
        {t('backToCatalog')}
      </Link>
      {children}
    </main>
  )

  if (!item) {
    return wrap(<p style={{ marginTop: '2rem', color: '#666' }}>{t('notFound')}</p>)
  }

  const { card } = item
  const rows: Array<[string, string]> = [
    [t('set'), `${card.setName} (${card.setCode.toUpperCase()})`],
    [t('collectorNumber'), `#${card.collectorNumber}`],
    [t('rarity'), card.rarity],
    [t('language'), item.language.toUpperCase()],
    [t('condition'), item.condition],
    [t('finish'), item.finish === 'foil' ? t('foil') : t('nonfoil')],
    [t('quantity'), t('available', { count: item.quantity })],
  ]

  return wrap(
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 320px) 1fr',
        gap: '2rem',
        marginTop: '1.5rem',
        alignItems: 'start',
      }}
    >
      {/* TODO: migrar imágenes a R2; por ahora se referencia la URL de Scryfall. */}
      {card.imageUrl ? (
        // biome-ignore lint/performance/noImgElement: imágenes externas de Scryfall (TODO R2)
        <img src={card.imageUrl} alt={card.name} style={{ width: '100%', borderRadius: 14 }} />
      ) : (
        <div
          style={{
            width: '100%',
            aspectRatio: '488 / 680',
            background: '#f3f3f3',
            borderRadius: 14,
          }}
        />
      )}

      <div>
        <h1 style={{ margin: '0 0 0.5rem' }}>{card.name}</h1>
        <p style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 1.25rem' }}>
          {formatPriceCents(item.priceCents, locale)}
        </p>

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '0.4rem 1rem',
            margin: 0,
          }}
        >
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: 'contents' }}>
              <dt style={{ color: '#666' }}>{label}</dt>
              <dd style={{ margin: 0 }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>,
  )
}
