import type { InventoryItem, Tcg } from '@thepubmarket/shared'
import { TCGS } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import { filterInventory, presentGames } from './inventory-filters'

function item(overrides: Partial<InventoryItem> & { tcg: Tcg; name?: string }): InventoryItem {
  const { tcg, name = 'Test Card', ...rest } = overrides
  return {
    id: rest.id ?? `${tcg}-${name}`,
    sellerId: 'seller-1',
    sellerName: 'The Pub Game Store',
    sellerVerified: true,
    tcg,
    card: {
      tcg,
      catalogId: 'cat-1',
      oracleId: null,
      name,
      setCode: 'ogn',
      setName: 'Origin',
      collectorNumber: '001',
      lang: 'en',
      rarity: 'common',
      artist: null,
      finishes: [],
      imageUrl: null,
      gameAttributes: null,
    },
    photos: [],
    condition: 'NM',
    language: 'en',
    finish: 'nonfoil',
    priceCents: 1000,
    quantity: 1,
    status: 'active',
    ...rest,
  } as InventoryItem
}

describe('presentGames', () => {
  it('omits riftbound when the seller has no riftbound stock (deliberate, not a bug)', () => {
    const items = [item({ tcg: 'mtg' }), item({ tcg: 'mtg', name: 'Other' })]
    expect(presentGames(items, TCGS)).toEqual(['mtg'])
  })

  it('includes riftbound as soon as the seller has any riftbound listing', () => {
    const items = [item({ tcg: 'mtg' }), item({ tcg: 'riftbound' })]
    expect(presentGames(items, TCGS)).toEqual(['mtg', 'riftbound'])
  })

  it('follows the order given, not insertion order in the inventory', () => {
    const items = [item({ tcg: 'riftbound' }), item({ tcg: 'mtg' })]
    expect(presentGames(items, TCGS)).toEqual(['mtg', 'riftbound'])
  })

  it('returns an empty list for an empty inventory', () => {
    expect(presentGames([], TCGS)).toEqual([])
  })
})

describe('filterInventory', () => {
  const items = [
    item({ id: '1', tcg: 'mtg', name: 'Lightning Bolt', condition: 'NM' }),
    item({ id: '2', tcg: 'riftbound', name: 'Braum', condition: 'LP' }),
    item({ id: '3', tcg: 'riftbound', name: 'Jinx', condition: 'NM' }),
  ]

  it('filters to riftbound only when that game chip is active', () => {
    const result = filterInventory(items, { q: '', games: ['riftbound'], conds: [] })
    expect(result.map((i) => i.id)).toEqual(['2', '3'])
  })

  it('combines game and condition filters with AND', () => {
    const result = filterInventory(items, { q: '', games: ['riftbound'], conds: ['NM'] })
    expect(result.map((i) => i.id)).toEqual(['3'])
  })

  it('matches the name search case-insensitively', () => {
    const result = filterInventory(items, { q: 'braum', games: [], conds: [] })
    expect(result.map((i) => i.id)).toEqual(['2'])
  })

  it('is a no-op with no filters active', () => {
    expect(filterInventory(items, { q: '', games: [], conds: [] })).toHaveLength(3)
  })
})
