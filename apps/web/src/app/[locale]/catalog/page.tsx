import type { Tcg } from '@thepubmarket/shared'
import { TCGS } from '@thepubmarket/shared'
import { setRequestLocale } from 'next-intl/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { EmptyState } from '@/components/states/EmptyState'
import { getCatalog, getGameCounts } from '@/lib/catalog/data'

interface CatalogPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string; game?: string }>
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const { q, game } = await searchParams

  // Un `game` desconocido en la URL se ignora en vez de vaciar el catálogo:
  // un enlace viejo o mal escrito debe caer al catálogo completo.
  const activeGame = TCGS.includes(game as Tcg) ? (game as Tcg) : undefined

  // El juego lo filtra la API; los conteos son de TODO el inventario para que
  // la barra lateral pueda ofrecer los otros juegos.
  const [items, gameCounts] = await Promise.all([getCatalog({ tcg: activeGame }), getGameCounts()])

  const empty = items.length === 0 && !activeGame

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6">
      {empty ? (
        <EmptyState />
      ) : (
        // `key` por query+juego: el componente cliente re-inicializa su estado
        // de filtros cuando la navegación cambia la URL.
        <CatalogView
          key={`${q ?? ''}|${activeGame ?? ''}`}
          items={items}
          initialQuery={q}
          activeGame={activeGame}
          gameCounts={gameCounts}
        />
      )}
    </main>
  )
}
