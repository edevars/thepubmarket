import type { Tcg } from '@thepubmarket/shared'
import { TCGS } from '@thepubmarket/shared'
import { setRequestLocale } from 'next-intl/server'
import { CatalogView } from '@/components/catalog/CatalogView'
import { EmptyState } from '@/components/states/EmptyState'
import { getCatalog, getGameCounts } from '@/lib/catalog/data'
import { parseGameFiltersFromSearchParams } from '@/lib/catalog/game-filters'
import { parseLocalFiltersFromSearchParams } from '@/lib/catalog/local-filters'

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

  // Filtros locales (condición/idioma/foil/precio/orden, TASK-053): se
  // parsean también en el servidor y se pasan como props iniciales para que
  // el primer render coincida con la URL sin parpadeo — el cliente los
  // vuelve a leer de `location.search` al montar, pero este valor evita un
  // flash sin filtros mientras hidrata.
  const initialLocalFilters = parseLocalFiltersFromSearchParams(sp)

  // TASK-053: `game` YA NO se manda a la API — las facetas de juego se
  // aplican en cliente (`CatalogView`, vía `matchesGameFilters`) sobre el
  // mismo inventario ya filtrado por `tcg`. Es lo que hace computable el
  // conteo por valor de facet-counts.ts: si el servidor filtrara por
  // facetas, los items de los valores NO seleccionados nunca llegarían.
  const [items, gameCounts] = await Promise.all([getCatalog({ tcg: activeGame }), getGameCounts()])

  const empty = items.length === 0 && !activeGame

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-6 sm:px-6">
      {empty ? (
        <EmptyState />
      ) : (
        // `key` por query+juego SOLAMENTE: es exactamente lo que entra al
        // fetch de arriba (`getCatalog({ tcg: activeGame })` + el `q` que
        // `CatalogView` usa para ordenar por relevancia). Ni los filtros
        // locales (cond/lang/foil/precio/orden) ni las facetas de juego
        // forman parte de la key — ambos se aplican en cliente, así que
        // remontar por ellos solo destruye foco, estado de popover y
        // animaciones sin traer un solo item nuevo (TASK-053 AC#3,
        // TASK-057). `CatalogView` re-sincroniza `gameFilters` desde las
        // props cuando la URL cambia por navegación del historial.
        <CatalogView
          key={`${q ?? ''}|${activeGame ?? ''}`}
          items={items}
          initialQuery={q}
          activeGame={activeGame}
          gameCounts={gameCounts}
          initialGameFilters={gameFilters}
          initialLocalFilters={initialLocalFilters}
        />
      )}
    </main>
  )
}
