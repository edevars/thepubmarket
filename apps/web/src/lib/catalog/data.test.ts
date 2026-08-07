import type { InventoryItem } from '@thepubmarket/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchCatalog = vi.fn()

vi.mock('@/lib/api', () => ({
  fetchCatalog: (...args: unknown[]) => fetchCatalog(...args),
  fetchCatalogGameCounts: vi.fn(),
  fetchCatalogItem: vi.fn(),
}))

const { applyFilters, getCatalog } = await import('./data')

function item(name: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `i-${name}`,
    sellerId: 's1',
    tcg: 'riftbound',
    condition: 'NM',
    language: 'en',
    finish: 'normal',
    priceCents: 1000,
    quantity: 1,
    status: 'active',
    card: { name, setCode: 'ogn', setName: 'Origins', gameAttributes: null },
    ...overrides,
  } as InventoryItem
}

beforeEach(() => {
  fetchCatalog.mockReset()
  fetchCatalog.mockResolvedValue({ items: [] })
})

describe('getCatalog: dónde se aplica cada filtro', () => {
  /**
   * La regresión de TASK-059. `q` tiene que ir a la API, no aplicarse en
   * cliente sobre una página ya truncada por `FETCH_LIMIT`: con 502 singles de
   * Riftbound, filtrar en cliente dejaba la búsqueda ciega a todo lo que
   * ordenara después del item 200 ("Rengar" no existía para el buscador).
   */
  it('manda el término de búsqueda a la API', async () => {
    await getCatalog({ q: 'Rengar', tcg: 'riftbound' })
    expect(fetchCatalog).toHaveBeenCalledTimes(1)
    expect(fetchCatalog.mock.calls[0]?.[0]).toMatchObject({ q: 'Rengar', tcg: 'riftbound' })
  })

  it('no inventa un término cuando no hay búsqueda', async () => {
    await getCatalog({ tcg: 'riftbound' })
    expect(fetchCatalog.mock.calls[0]?.[0]?.q).toBeUndefined()
  })

  it('pide una sola página con el tope alto, no la página por defecto', async () => {
    await getCatalog({ q: 'Rengar' })
    expect(fetchCatalog.mock.calls[0]?.[0]?.limit).toBe(200)
  })

  /**
   * Las facetas de juego SÍ siguen viajando a la API por este camino, pero
   * `catalog/page.tsx` deliberadamente no las pasa (TASK-053): el motor de
   * conteo con autoexclusión necesita ver los items de los valores NO
   * seleccionados. Este test solo congela que el parámetro existe y se
   * reenvía, para que nadie lo borre creyendo que sobra.
   */
  it('reenvía las facetas de juego cuando el llamador las pasa', async () => {
    await getCatalog({ tcg: 'riftbound', game: { domain: ['Body'] } })
    expect(fetchCatalog.mock.calls[0]?.[0]?.gameFilters).toEqual({ domain: ['Body'] })
  })

  it('sigue acotando en cliente lo que la API devuelva de más', async () => {
    fetchCatalog.mockResolvedValue({
      items: [item('Rengar - Pridestalker'), item('Ahri - Inquisitive')],
    })
    const out = await getCatalog({ q: 'rengar' })
    expect(out.map((i) => i.card.name)).toEqual(['Rengar - Pridestalker'])
  })
})

describe('applyFilters: el término de búsqueda', () => {
  const items = [item('Rengar - Pridestalker'), item('Ahri - Inquisitive'), item('Elder Dragon')]

  it('empareja por substring sin distinguir mayúsculas', () => {
    expect(applyFilters(items, { q: 'RENGAR' }).map((i) => i.card.name)).toEqual([
      'Rengar - Pridestalker',
    ])
    expect(applyFilters(items, { q: 'dragon' }).map((i) => i.card.name)).toEqual(['Elder Dragon'])
  })

  it('ignora espacios alrededor y devuelve todo si el término queda vacío', () => {
    expect(applyFilters(items, { q: '  rengar  ' })).toHaveLength(1)
    expect(applyFilters(items, { q: '   ' })).toHaveLength(3)
  })
})
