import type { InventoryItem } from '@thepubmarket/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchCatalog = vi.fn()

vi.mock('@/lib/api', () => ({
  fetchCatalog: (...args: unknown[]) => fetchCatalog(...args),
  fetchCatalogGameCounts: vi.fn(),
  fetchCatalogItem: vi.fn(),
}))

const { applyFilters, getCatalog, getPurchaseOptions, getRelated } = await import('./data')

function item(name: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `i-${name}`,
    sellerId: 's1',
    tcg: 'riftbound',
    condition: 'NM',
    language: 'en',
    finish: 'nonfoil',
    priceCents: 1000,
    quantity: 1,
    status: 'active',
    card: { name, setCode: 'ogn', setName: 'Origins', gameAttributes: null },
    ...overrides,
  } as InventoryItem
}

/** Publicación de una impresión concreta, para los tests de agrupado. */
function offer(
  id: string,
  catalogId: string,
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  const base = item(`card-${catalogId}`, overrides)
  return { ...base, id, card: { ...base.card, catalogId } }
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

describe('getPurchaseOptions: las ofertas de la carta que se está viendo', () => {
  /**
   * La regresión de TASK-062. Buscar las hermanas dentro del catálogo ya
   * cargado no funciona: con más de mil publicaciones activas y páginas de 200
   * por título, las de una carta que ordene tarde nunca caen en la página. Se
   * piden a la API por id de impresión.
   */
  it('pide a la API las ofertas de esa impresión, no el catálogo completo', async () => {
    const viewing = offer('lp', 'UNL-183', { priceCents: 140000 })
    fetchCatalog.mockResolvedValue({ items: [viewing] })

    await getPurchaseOptions(viewing)

    expect(fetchCatalog).toHaveBeenCalledTimes(1)
    expect(fetchCatalog.mock.calls[0]?.[0]).toMatchObject({
      catalogId: 'UNL-183',
      tcg: 'riftbound',
    })
  })

  it('devuelve todas las ofertas de la carta, de menor a mayor precio', async () => {
    const viewing = offer('lp', 'UNL-183', { priceCents: 140000, condition: 'LP' })
    const cheaper = offer('hp', 'UNL-183', { priceCents: 70000, condition: 'HP' })
    fetchCatalog.mockResolvedValue({ items: [viewing, cheaper] })

    expect((await getPurchaseOptions(viewing)).map((o) => o.id)).toEqual(['hp', 'lp'])
  })

  it('descarta lo que la API devuelva de la misma impresión en otro idioma o acabado', async () => {
    const viewing = offer('es-foil', 'UNL-183', { language: 'es', finish: 'foil' })
    fetchCatalog.mockResolvedValue({
      items: [
        viewing,
        offer('en-foil', 'UNL-183', { language: 'en', finish: 'foil' }),
        offer('es-nonfoil', 'UNL-183', { language: 'es', finish: 'nonfoil' }),
      ],
    })

    expect((await getPurchaseOptions(viewing)).map((o) => o.id)).toEqual(['es-foil'])
  })

  it('no llama a la API cuando la publicación no tiene id de impresión', async () => {
    const orphan = item('Sin catálogo')
    expect((await getPurchaseOptions(orphan)).map((o) => o.id)).toEqual([orphan.id])
    expect(fetchCatalog).not.toHaveBeenCalled()
  })
})

describe('getRelated', () => {
  it('excluye las demás ofertas de la misma carta, no solo la fila que se ve', async () => {
    const viewing = offer('lp', 'UNL-183', { priceCents: 140000 })
    fetchCatalog.mockResolvedValue({
      items: [viewing, offer('hp', 'UNL-183', { priceCents: 70000 }), offer('otra', 'UNL-120')],
    })

    expect((await getRelated(viewing)).map((i) => i.id)).toEqual(['otra'])
  })

  it('deja una sola tarjeta por carta', async () => {
    fetchCatalog.mockResolvedValue({
      items: [
        offer('a1', 'UNL-001', { priceCents: 100 }),
        offer('a2', 'UNL-001', { priceCents: 300 }),
        offer('b1', 'UNL-002'),
      ],
    })

    const out = await getRelated(offer('viewing', 'UNL-999'))
    expect(out.map((i) => i.id)).toEqual(['a1', 'b1'])
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
