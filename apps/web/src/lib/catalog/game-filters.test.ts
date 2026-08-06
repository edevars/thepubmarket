import type { InventoryItem, RiftboundAttributes } from '@thepubmarket/shared'
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

describe('parseGameFiltersFromSearchParams', () => {
  it('returns nothing when the tcg has no registered facets (e.g. mtg, or no tcg at all)', () => {
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
    expect(facetsFor('mtg')).toEqual([])
    expect(facetsFor(undefined)).toEqual([])
  })

  it('exposes the full riftbound facet set', () => {
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
})
