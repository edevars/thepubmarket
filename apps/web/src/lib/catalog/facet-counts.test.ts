import type { Condition, InventoryItem, MtgAttributes } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import {
  countConditions,
  countFoil,
  countGameFacetValues,
  countLanguages,
  type FacetCountFilters,
} from './facet-counts'
import { facetsFor } from './game-filters'

const BASE_FILTERS: FacetCountFilters = {
  conditions: [],
  languages: [],
  foilOnly: false,
  game: {},
}

let nextId = 0

function mtgItem(
  overrides: Partial<{
    condition: Condition
    language: string
    finish: 'foil' | 'nonfoil'
    priceCents: number
    colors: string[]
    rarity: string
  }> = {},
) {
  nextId += 1
  const attrs: MtgAttributes = {
    tcg: 'mtg',
    colors: overrides.colors ?? ['G'],
    types: ['Creature'],
    typeLine: 'Creature — Bear',
    manaValue: 2,
  }
  return {
    id: `inv-${nextId}`,
    sellerId: 'seller-1',
    sellerName: 'The Pub Game Store',
    sellerVerified: true,
    tcg: 'mtg',
    card: {
      tcg: 'mtg',
      catalogId: `mtg-${nextId}`,
      oracleId: null,
      name: 'Test Bear',
      setCode: 'mh3',
      setName: 'Modern Horizons 3',
      collectorNumber: '100',
      lang: 'en',
      rarity: overrides.rarity ?? 'common',
      artist: null,
      finishes: [],
      imageUrl: null,
      gameAttributes: attrs,
    },
    photos: [],
    condition: overrides.condition ?? 'NM',
    language: overrides.language ?? 'en',
    finish: overrides.finish ?? 'nonfoil',
    priceCents: overrides.priceCents ?? 1000,
    quantity: 1,
    status: 'active',
  } as unknown as InventoryItem
}

describe('countConditions (self-exclusion)', () => {
  const items = [
    mtgItem({ condition: 'NM', language: 'en' }),
    mtgItem({ condition: 'NM', language: 'es' }),
    mtgItem({ condition: 'LP', language: 'en' }),
    mtgItem({ condition: 'MP', language: 'en' }),
  ]

  it('sin otros filtros activos, cuenta cada condición sobre todo el set', () => {
    const counts = countConditions(items, { ...BASE_FILTERS, game: {} })
    expect(counts.NM).toBe(2)
    expect(counts.LP).toBe(1)
    expect(counts.MP).toBe(1)
    expect(counts.HP).toBe(0)
  })

  it('seleccionar NM no colapsa el conteo de NM a 0 (autoexclusión)', () => {
    const counts = countConditions(items, {
      ...BASE_FILTERS,
      conditions: ['NM'],
      game: {},
    })
    // El conteo de NM se calcula IGNORANDO el propio filtro de condición, así
    // que sigue siendo 2 — es lo que hace posible que el usuario vea cuántos
    // resultados tendría cada OTRA condición si cambiara su selección.
    expect(counts.NM).toBe(2)
    expect(counts.LP).toBe(1)
  })

  it('respeta otros filtros activos (idioma) al contar condiciones', () => {
    const counts = countConditions(items, {
      ...BASE_FILTERS,
      languages: ['es'],
      game: {},
    })
    expect(counts.NM).toBe(1)
    expect(counts.LP).toBe(0)
  })
})

describe('countLanguages (self-exclusion)', () => {
  const items = [
    mtgItem({ language: 'en', condition: 'NM' }),
    mtgItem({ language: 'es', condition: 'NM' }),
    mtgItem({ language: 'es', condition: 'LP' }),
  ]

  it('seleccionar un idioma no colapsa su propio conteo', () => {
    const counts = countLanguages(items, {
      ...BASE_FILTERS,
      languages: ['es'],
      game: {},
    })
    expect(counts.es).toBe(2)
    expect(counts.en).toBe(1)
  })

  it('respeta el filtro de condición activo al contar idiomas', () => {
    const counts = countLanguages(items, {
      ...BASE_FILTERS,
      conditions: ['NM'],
      game: {},
    })
    expect(counts.es).toBe(1)
    expect(counts.en).toBe(1)
  })
})

describe('countFoil (self-exclusion)', () => {
  const items = [
    mtgItem({ finish: 'foil' }),
    mtgItem({ finish: 'foil' }),
    mtgItem({ finish: 'nonfoil' }),
  ]

  it('foilOnly activo no colapsa su propio conteo', () => {
    const count = countFoil(items, { ...BASE_FILTERS, foilOnly: true, game: {} })
    expect(count).toBe(2)
  })
})

/**
 * TASK-062: los conteos son de CARTAS, porque el grid muestra una tarjeta por
 * carta. Antes contaban publicaciones y el sidebar prometía más resultados de
 * los que se veían al seleccionar el filtro.
 */
describe('conteos por carta, no por publicación', () => {
  /** Dos ofertas de la MISMA carta: misma impresión, idioma y acabado. */
  function twoOffersOfOneCard() {
    const nm = mtgItem({ condition: 'NM', priceCents: 1000 })
    const lp = mtgItem({ condition: 'LP', priceCents: 3000 })
    lp.card.catalogId = nm.card.catalogId
    return [nm, lp]
  }

  it('dos ofertas de la misma carta suman una sola carta por condición', () => {
    const counts = countConditions(twoOffersOfOneCard(), { ...BASE_FILTERS, game: {} })
    // La carta tiene oferta NM y oferta LP: cuenta 1 en cada valor, que es lo
    // que se ve al seleccionar cualquiera de los dos — una tarjeta.
    expect(counts.NM).toBe(1)
    expect(counts.LP).toBe(1)
  })

  it('un idioma con dos ofertas de la misma carta cuenta una', () => {
    expect(countLanguages(twoOffersOfOneCard(), { ...BASE_FILTERS, game: {} }).en).toBe(1)
  })

  it('foil cuenta cartas, no publicaciones', () => {
    const [nm, lp] = twoOffersOfOneCard()
    if (!nm || !lp) throw new Error('fixture')
    nm.finish = 'foil'
    lp.finish = 'foil'
    expect(countFoil([nm, lp], { ...BASE_FILTERS, game: {} })).toBe(1)
  })

  it('una faceta de juego cuenta la carta una vez aunque tenga varias ofertas', () => {
    const colorFacet = facetsFor('mtg').find((f) => f.param === 'color')
    if (!colorFacet) throw new Error('MTG color facet not registered')
    const counts = countGameFacetValues(
      twoOffersOfOneCard(),
      { ...BASE_FILTERS, game: {} },
      colorFacet,
    )
    expect(counts.G).toBe(1)
  })
})

describe('countGameFacetValues (self-exclusion, facetas de juego)', () => {
  const colorFacet = facetsFor('mtg').find((f) => f.param === 'color')
  const rarityFacet = facetsFor('mtg').find((f) => f.param === 'rarity')
  if (!colorFacet || !rarityFacet) throw new Error('MTG color/rarity facets not registered')
  const items = [
    mtgItem({ colors: ['G'], rarity: 'common' }),
    mtgItem({ colors: ['G'], rarity: 'rare' }),
    mtgItem({ colors: ['U'], rarity: 'common' }),
  ]

  it('seleccionar un valor de la faceta no colapsa su propio conteo', () => {
    const counts = countGameFacetValues(
      items,
      { ...BASE_FILTERS, game: { color: ['G'] } },
      colorFacet,
    )
    expect(counts.G).toBe(2)
    expect(counts.U).toBe(1)
  })

  it('respeta OTRA faceta del mismo juego activa al contar', () => {
    const counts = countGameFacetValues(
      items,
      { ...BASE_FILTERS, game: { rarity: ['common'] } },
      colorFacet,
    )
    // Solo los 2 items 'common' cuentan: 1 verde, 1 azul.
    expect(counts.G).toBe(1)
    expect(counts.U).toBe(1)
  })

  it('respeta filtros locales (condición/idioma/precio) al contar facetas', () => {
    const priced = [
      mtgItem({ colors: ['G'], priceCents: 500 }),
      mtgItem({ colors: ['G'], priceCents: 5000 }),
    ]
    const counts = countGameFacetValues(
      priced,
      { ...BASE_FILTERS, maxCents: 1000, game: {} },
      colorFacet,
    )
    expect(counts.G).toBe(1)
  })

  it('faceta distinta (rarity) se cuenta de forma independiente', () => {
    const counts = countGameFacetValues(
      items,
      { ...BASE_FILTERS, game: { rarity: ['rare'] } },
      rarityFacet,
    )
    expect(counts.common).toBe(2)
    expect(counts.rare).toBe(1)
  })
})
