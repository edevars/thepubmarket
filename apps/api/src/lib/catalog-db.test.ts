import type { CatalogCardRow, Db } from '@thepubmarket/db'
import { describe, expect, it } from 'vitest'
import { getCardText, rowToSnapshot } from './catalog-db'

const ORIGIN = 'http://localhost:8787'

const RIFTBOUND_ROW: CatalogCardRow = {
  tcg: 'riftbound',
  catalogId: 'OGN-301',
  oracleId: null,
  name: 'Jinx - Loose Cannon (Signature)',
  setCode: 'OGN',
  setName: 'Origins',
  collectorNumber: '301',
  lang: 'en',
  rarity: 'showcase',
  artist: 'Jonathan Santoro',
  finishes: [],
  rulesText: 'When Jinx enters combat, deal 2 damage to a struck unit.',
  flavorText: '"Time to get UNSTABLE."',
  gameAttributes: JSON.stringify({
    tcg: 'riftbound',
    type: 'Legend',
    supertype: null,
    domains: ['Fury', 'Order'],
    energy: 4,
    might: 3,
    power: null,
  }),
  priceData: null,
  priceFetchedAt: null,
  sourceImageUrl: 'https://static.dotgg.gg/riftbound/card.png',
  sourceImageBackUrl: null,
  imageR2Key: null,
  imageBackR2Key: null,
  createdAt: 0,
  updatedAt: 0,
} as unknown as CatalogCardRow

describe('rowToSnapshot', () => {
  it('carries rules and flavor text from catalog_cards into the snapshot (Riftbound)', () => {
    const snapshot = rowToSnapshot(RIFTBOUND_ROW, ORIGIN)

    expect(snapshot.rulesText).toBe(RIFTBOUND_ROW.rulesText)
    expect(snapshot.flavorText).toBe(RIFTBOUND_ROW.flavorText)
    expect(snapshot.rarity).toBe('showcase')
    expect(snapshot.setCode).toBe('OGN')
    expect(snapshot.setName).toBe('Origins')
    expect(snapshot.collectorNumber).toBe('301')
    expect(snapshot.gameAttributes).toEqual({
      tcg: 'riftbound',
      type: 'Legend',
      supertype: null,
      domains: ['Fury', 'Order'],
      energy: 4,
      might: 3,
      power: null,
    })
  })

  it('passes through null rules/flavor text when the importer never captured them', () => {
    const row = { ...RIFTBOUND_ROW, rulesText: null, flavorText: null }
    const snapshot = rowToSnapshot(row, ORIGIN)

    expect(snapshot.rulesText).toBeNull()
    expect(snapshot.flavorText).toBeNull()
  })
})

/** Fake Db: soporta el único chain que usa `getCardText` (select→from→where→get). */
function fakeDbReturning(row: { rulesText: string | null; flavorText: string | null } | undefined) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => row,
        }),
      }),
    }),
  } as unknown as Db
}

describe('getCardText', () => {
  it('returns rules/flavor text for a Riftbound printing in the local catalog', async () => {
    const db = fakeDbReturning({
      rulesText: RIFTBOUND_ROW.rulesText,
      flavorText: RIFTBOUND_ROW.flavorText,
    })

    const text = await getCardText(db, 'riftbound', 'OGN-301')
    expect(text).toEqual({
      rulesText: RIFTBOUND_ROW.rulesText,
      flavorText: RIFTBOUND_ROW.flavorText,
    })
  })

  it('returns null for MTG, whose catalog is Scryfall, not catalog_cards', async () => {
    const db = fakeDbReturning(undefined)
    const text = await getCardText(db, 'mtg', 'some-scryfall-id')
    expect(text).toBeNull()
  })

  it('short-circuits on an empty catalogId without querying the db', async () => {
    let queried = false
    const db = {
      select: () => {
        queried = true
        return { from: () => ({ where: () => ({ get: async () => undefined }) }) }
      },
    } as unknown as Db

    const text = await getCardText(db, 'riftbound', '')
    expect(text).toBeNull()
    expect(queried).toBe(false)
  })
})
