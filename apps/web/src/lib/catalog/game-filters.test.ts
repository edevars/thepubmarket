import type { InventoryItem, MtgAttributes, RiftboundAttributes } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import {
  facetsFor,
  matchesGameFilters,
  parseGameFiltersFromSearchParams,
  serializeGameFilters,
} from './game-filters'

function riftboundItem(overrides: Partial<RiftboundAttributes> & { rarity?: string } = {}) {
  const { rarity = 'common', ...attrOverrides } = overrides
  const attrs: RiftboundAttributes = {
    tcg: 'riftbound',
    type: 'Unit',
    supertype: null,
    domains: ['Fury'],
    energy: 3,
    might: 2,
    power: null,
    ...attrOverrides,
  }
  return {
    id: 'inv-1',
    sellerId: 'seller-1',
    sellerName: 'The Pub Game Store',
    sellerVerified: true,
    tcg: 'riftbound',
    card: {
      tcg: 'riftbound',
      catalogId: 'rb-1',
      oracleId: null,
      name: 'Test Unit',
      setCode: 'ogn',
      setName: 'Origin',
      collectorNumber: '001',
      lang: 'en',
      rarity,
      artist: null,
      finishes: [],
      imageUrl: null,
      gameAttributes: attrs,
    },
    photos: [],
    condition: 'NM',
    language: 'en',
    finish: 'nonfoil',
    priceCents: 1000,
    quantity: 1,
    status: 'active',
  } as unknown as InventoryItem
}

// TASK-051: mock de InventoryItem de MTG, espejo de riftboundItem() de arriba,
// para las pruebas de facetas y de aislamiento entre juegos.
function mtgItem(overrides: Partial<MtgAttributes> & { rarity?: string } = {}) {
  const { rarity = 'common', ...attrOverrides } = overrides
  const attrs: MtgAttributes = {
    tcg: 'mtg',
    colors: ['G'],
    types: ['Creature'],
    typeLine: 'Creature — Bear',
    manaValue: 2,
    ...attrOverrides,
  }
  return {
    id: 'inv-2',
    sellerId: 'seller-1',
    sellerName: 'The Pub Game Store',
    sellerVerified: true,
    tcg: 'mtg',
    card: {
      tcg: 'mtg',
      catalogId: 'mtg-1',
      oracleId: 'oracle-1',
      name: 'Test Bear',
      setCode: 'mh3',
      setName: 'Modern Horizons 3',
      collectorNumber: '100',
      lang: 'en',
      rarity,
      artist: null,
      finishes: [],
      imageUrl: null,
      gameAttributes: attrs,
    },
    photos: [],
    condition: 'NM',
    language: 'en',
    finish: 'nonfoil',
    priceCents: 1000,
    quantity: 1,
    status: 'active',
  } as unknown as InventoryItem
}

describe('parseGameFiltersFromSearchParams', () => {
  it('returns nothing when the tcg has no registered facets (or no tcg at all)', () => {
    // TASK-051: `domain` es exclusivo de Riftbound, así que sigue sin matchear
    // para mtg (que ya tiene registro propio, pero no ese param).
    expect(parseGameFiltersFromSearchParams('mtg', { domain: 'Fury' })).toEqual({})
    expect(parseGameFiltersFromSearchParams(undefined, { domain: 'Fury' })).toEqual({})
  })

  it('canonicalizes vocabulary values case-insensitively for riftbound', () => {
    expect(parseGameFiltersFromSearchParams('riftbound', { domain: 'fury,ORDER' })).toEqual({
      domain: ['Fury', 'Order'],
    })
  })

  it('accepts repeated-key values the same as comma-separated ones', () => {
    expect(parseGameFiltersFromSearchParams('riftbound', { domain: ['Fury', 'Order'] })).toEqual({
      domain: ['Fury', 'Order'],
    })
  })

  it('drops values outside the canonical vocabulary instead of propagating them to the API', () => {
    expect(parseGameFiltersFromSearchParams('riftbound', { domain: 'Fury,NotADomain' })).toEqual({
      domain: ['Fury'],
    })
    expect(parseGameFiltersFromSearchParams('riftbound', { domain: 'NotADomain' })).toEqual({})
  })

  it('parses energy/might as integers within 0-12 and drops the rest', () => {
    expect(parseGameFiltersFromSearchParams('riftbound', { energy: '0,3,12,13,-1,abc' })).toEqual({
      energy: ['0', '3', '12'],
    })
  })

  it('treats set as a single free-form value with no vocabulary check', () => {
    expect(parseGameFiltersFromSearchParams('riftbound', { set: ['ogn', 'ogs'] })).toEqual({
      set: ['ogn'],
    })
  })

  it('ignores an absent or empty param', () => {
    expect(parseGameFiltersFromSearchParams('riftbound', { domain: '' })).toEqual({})
    expect(parseGameFiltersFromSearchParams('riftbound', {})).toEqual({})
  })
})

describe('matchesGameFilters', () => {
  it('is OR within a param and AND across params', () => {
    const item = riftboundItem({ domains: ['Fury', 'Order'], type: 'Unit' })
    expect(matchesGameFilters(item, { domain: ['Order'], type: ['Unit'] })).toBe(true)
    expect(matchesGameFilters(item, { domain: ['Calm'], type: ['Unit'] })).toBe(false)
    expect(matchesGameFilters(item, { domain: ['Order', 'Calm'] })).toBe(true)
  })

  it('matches energy/might as strings', () => {
    const item = riftboundItem({ energy: 3, might: 2 })
    expect(matchesGameFilters(item, { energy: ['3'] })).toBe(true)
    expect(matchesGameFilters(item, { energy: ['4'] })).toBe(false)
  })

  it('never matches a facet the item does not carry (e.g. no supertype)', () => {
    const item = riftboundItem({ supertype: null })
    expect(matchesGameFilters(item, { supertype: ['Champion'] })).toBe(false)
  })

  it('is a no-op for an empty filter set', () => {
    expect(matchesGameFilters(riftboundItem(), {})).toBe(true)
  })
})

describe('serializeGameFilters', () => {
  it('produces a stable key regardless of param/value insertion order', () => {
    const a = serializeGameFilters({ type: ['Unit'], domain: ['Order', 'Fury'] })
    const b = serializeGameFilters({ domain: ['Fury', 'Order'], type: ['Unit'] })
    expect(a).toBe(b)
  })
})

describe('facetsFor', () => {
  it('exposes no facets for a game without its own registry entry', () => {
    expect(facetsFor(undefined)).toEqual([])
  })

  it('exposes the full riftbound facet set (FROZEN order — do not reorder)', () => {
    expect(facetsFor('riftbound').map((f) => f.param)).toEqual([
      'domain',
      'type',
      'supertype',
      'rarity',
      'energy',
      'might',
      'set',
    ])
  })

  // TASK-051: mtg se agrega como clave nueva del registro, nunca intercalado
  // con el arreglo de riftbound de arriba.
  it('exposes the full mtg facet set', () => {
    expect(facetsFor('mtg').map((f) => f.param)).toEqual(['color', 'type', 'rarity', 'set'])
  })
})

describe('parseGameFiltersFromSearchParams (mtg)', () => {
  it('canonicalizes color/type/rarity case-insensitively', () => {
    expect(
      parseGameFiltersFromSearchParams('mtg', { color: 'g,W', type: 'creature', rarity: 'MYTHIC' }),
    ).toEqual({
      color: ['G', 'W'],
      type: ['Creature'],
      rarity: ['mythic'],
    })
  })

  it('drops mtg color values outside the WUBRG+C vocabulary', () => {
    expect(parseGameFiltersFromSearchParams('mtg', { color: 'G,X' })).toEqual({ color: ['G'] })
  })

  it('treats set as a single free-form value, same as riftbound', () => {
    expect(parseGameFiltersFromSearchParams('mtg', { set: ['mh3', 'mh2'] })).toEqual({
      set: ['mh3'],
    })
  })
})

describe('serializeGameFilters (mtg round-trip)', () => {
  it('round-trips mtg filters into a stable key', () => {
    const parsed = parseGameFiltersFromSearchParams('mtg', { color: 'g,W', type: 'Creature' })
    const key = serializeGameFilters(parsed)
    expect(key).toBe(serializeGameFilters({ color: ['W', 'G'], type: ['Creature'] }))
  })
})

describe('cross-game facet isolation (TASK-051 regression)', () => {
  it('an mtg item never matches through riftbound-only facet params', () => {
    // `domain`/`supertype`/`energy`/`might` no existen en el registro de mtg:
    // facetByParam(item.tcg, param) debe devolver undefined y el filtro se
    // ignora (no falsos positivos, no falsos negativos por accidente).
    const item = mtgItem()
    expect(matchesGameFilters(item, { domain: ['Fury'] })).toBe(true)
    expect(matchesGameFilters(item, { supertype: ['Champion'] })).toBe(true)
  })

  it('a riftbound item never matches through mtg-only facet params', () => {
    const item = riftboundItem()
    expect(matchesGameFilters(item, { color: ['G'] })).toBe(true)
  })

  it('shared param names (type/rarity/set) apply the item own game vocabulary, never the other game', () => {
    const mtgCreature = mtgItem({ types: ['Creature'] })
    const riftUnit = riftboundItem({ type: 'Unit' })

    // 'type' selecciona 'Creature' (valor mtg): el item riftbound (type='Unit')
    // nunca debe matchear, aunque 'Unit' no sea vocabulario de mtg.
    expect(matchesGameFilters(mtgCreature, { type: ['Creature'] })).toBe(true)
    expect(matchesGameFilters(riftUnit, { type: ['Creature'] })).toBe(false)

    // Y viceversa: 'type'='Unit' (valor riftbound) nunca matchea el item mtg.
    expect(matchesGameFilters(riftUnit, { type: ['Unit'] })).toBe(true)
    expect(matchesGameFilters(mtgCreature, { type: ['Unit'] })).toBe(false)

    // rarity comparte columna (`card.rarity`) entre ambos juegos, pero
    // facetByParam sigue resolviendo por facetsFor(item.tcg) — el valor en sí
    // matchea igual porque ambos leen la misma columna compartida.
    const mtgMythic = mtgItem({ rarity: 'mythic' })
    const riftEpic = riftboundItem({ rarity: 'epic' })
    expect(matchesGameFilters(mtgMythic, { rarity: ['mythic'] })).toBe(true)
    expect(matchesGameFilters(riftEpic, { rarity: ['mythic'] })).toBe(false)

    // set también es compartido por nombre; cada item se compara contra su
    // propio setCode.
    expect(matchesGameFilters(mtgCreature, { set: ['mh3'] })).toBe(true)
    expect(matchesGameFilters(riftUnit, { set: ['mh3'] })).toBe(false)
  })
})
