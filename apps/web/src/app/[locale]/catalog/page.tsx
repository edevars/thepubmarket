import type { Tcg } from '@thepubmarket/shared'
import { TCGS } from '@thepubmarket/shared'
import { setRequestLocale } from 'next-intl/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { EmptyState } from '@/components/states/EmptyState'
import { getCatalog, getGameCounts } from '@/lib/catalog/data'
import { parseGameFiltersFromSearchParams, serializeGameFilters } from '@/lib/catalog/game-filters'

interface CatalogPageProps {
  params: Promise<{ locale: string }>
  // Next entrega TODOS los query params, no solo `q`/`game`: las facetas
  // propias de cada juego (domain, energy… TASK-040) llegan aquí también.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : undefined
  const gameRaw = typeof sp.game === 'string' ? sp.game : undefined

  // Un `game` desconocido en la URL se ignora en vez de vaciar el catálogo:
  // un enlace viejo o mal escrito debe caer al catálogo completo.
  const activeGame = TCGS.includes(gameRaw as Tcg) ? (gameRaw as Tcg) : undefined

  // Filtros propios del juego activo (TASK-040): `parseGameFiltersFromSearchParams`
  // solo lee las facetas registradas para `activeGame`, así que cambiar o
  // quitar el juego en la URL ya purga estos params por construcción (AC#3) —
  // nunca llegan a `getCatalog` sin el `tcg` que la API exige.
  const gameFilters = parseGameFiltersFromSearchParams(activeGame, sp)

  // El juego y sus filtros propios los filtra la API; los conteos son de TODO
  // el inventario para que la barra lateral pueda ofrecer los otros juegos.
  const [items, gameCounts] = await Promise.all([
    getCatalog({ tcg: activeGame, game: gameFilters }),
    getGameCounts(),
  ])

  const empty = items.length === 0 && !activeGame

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6">
      {empty ? (
        <EmptyState />
      ) : (
        // `key` por query+juego+facetas: el componente cliente re-inicializa
        // su estado de filtros cuando la navegación cambia la URL.
        <CatalogView
          key={`${q ?? ''}|${activeGame ?? ''}|${serializeGameFilters(gameFilters)}`}
          items={items}
          initialQuery={q}
          activeGame={activeGame}
          gameCounts={gameCounts}
          initialGameFilters={gameFilters}
        />
      )}
    </main>
  )
}
