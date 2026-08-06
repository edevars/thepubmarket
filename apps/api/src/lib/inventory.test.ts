import type { Db, InventoryRow } from '@thepubmarket/db'
import type { CardSnapshot } from '@thepubmarket/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createListing, type ListingInput, rowToInventoryItem } from './inventory'
import { getCardById, ScryfallError } from './scryfall'

vi.mock('./scryfall', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scryfall')>()),
  getCardById: vi.fn(),
}))

const mockedGetCardById = vi.mocked(getCardById)

const KV = {} as KVNamespace

const MTG_SNAPSHOT: CardSnapshot = {
  tcg: 'mtg',
  catalogId: '11111111-2222-4333-8444-555555555555',
  oracleId: 'oracle-1',
  name: 'Lightning Bolt',
  setCode: 'lea',
  setName: 'Limited Edition Alpha',
  collectorNumber: '161',
  lang: 'en',
  rarity: 'common',
  artist: 'Christopher Rush',
  finishes: ['nonfoil', 'foil'],
  imageUrl: 'https://cards.scryfall.io/normal/bolt.jpg',
}

const OFFER: Omit<ListingInput, 'tcg' | 'catalogId'> = {
  condition: 'NM',
  finish: 'nonfoil',
  language: 'en',
  priceCents: 5000,
  quantity: 2,
}

/** Db falso: captura los values del insert y los devuelve como fila creada. */
function fakeDb(captured: Record<string, unknown>[]) {
  return {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        captured.push(v)
        return { returning: async () => [v as unknown as InventoryRow] }
      },
    }),
  } as unknown as Db
}

beforeEach(() => {
  mockedGetCardById.mockReset()
})

describe('createListing', () => {
  it('publishes an MTG single exactly as before: snapshot + legacy columns', async () => {
    mockedGetCardById.mockResolvedValue(MTG_SNAPSHOT)
    const captured: Record<string, unknown>[] = []

    const result = await createListing(
      fakeDb(captured),
      KV,
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER },
      'seller-1',
    )

    expect(result.ok).toBe(true)
    expect(mockedGetCardById).toHaveBeenCalledWith(MTG_SNAPSHOT.catalogId, KV)
    const row = captured[0]
    expect(row).toMatchObject({
      sellerId: 'seller-1',
      tcg: 'mtg',
      title: 'Lightning Bolt',
      catalogId: MTG_SNAPSHOT.catalogId,
      // Compat: en MTG las columnas legacy se siguen escribiendo.
      scryfallId: MTG_SNAPSHOT.catalogId,
      oracleId: 'oracle-1',
      setCode: 'lea',
      setName: 'Limited Edition Alpha',
      collectorNumber: '161',
      cardLang: 'en',
      rarity: 'common',
      finish: 'nonfoil',
      condition: 'NM',
      priceCents: 5000,
      quantity: 2,
      status: 'active',
      imageUrl: MTG_SNAPSHOT.imageUrl,
    })
  })

  it('rejects a finish the printing does not offer, listing the available ones', async () => {
    mockedGetCardById.mockResolvedValue({ ...MTG_SNAPSHOT, finishes: ['nonfoil'] })

    const result = await createListing(
      fakeDb([]),
      KV,
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER, finish: 'foil' },
      'seller-1',
    )

    expect(result).toMatchObject({
      ok: false,
      error: 'finish_not_available',
      status: 400,
      extra: { available: ['nonfoil'] },
    })
  })

  it('accepts any finish when the catalog does not report finishes', async () => {
    mockedGetCardById.mockResolvedValue({ ...MTG_SNAPSHOT, finishes: [] })
    const captured: Record<string, unknown>[] = []

    const result = await createListing(
      fakeDb(captured),
      KV,
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER, finish: 'foil' },
      'seller-1',
    )

    expect(result.ok).toBe(true)
    expect(captured[0]?.finish).toBe('foil')
  })

  it('rejects a game without an integrated catalog before touching any provider', async () => {
    const result = await createListing(
      fakeDb([]),
      KV,
      { tcg: 'riftbound', catalogId: 'rift-001', ...OFFER },
      'seller-1',
    )

    expect(result).toMatchObject({
      ok: false,
      error: 'tcg_not_supported',
      status: 400,
      extra: { tcg: 'riftbound' },
    })
    expect(mockedGetCardById).not.toHaveBeenCalled()
  })

  it('maps a provider 404 to card_not_found and other failures to 502', async () => {
    mockedGetCardById.mockRejectedValueOnce(new ScryfallError('missing', 404))
    const notFound = await createListing(
      fakeDb([]),
      KV,
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER },
      'seller-1',
    )
    expect(notFound).toMatchObject({ ok: false, status: 404 })

    mockedGetCardById.mockRejectedValueOnce(new ScryfallError('boom', 500))
    const upstream = await createListing(
      fakeDb([]),
      KV,
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER },
      'seller-1',
    )
    expect(upstream).toMatchObject({ ok: false, status: 502 })
  })
})

describe('rowToInventoryItem', () => {
  const baseRow = {
    id: 'inv-1',
    sellerId: 'seller-1',
    tcg: 'mtg',
    title: 'Lightning Bolt',
    description: null,
    condition: 'NM',
    priceCents: 5000,
    currency: 'MXN',
    quantity: 2,
    status: 'active',
    catalogId: null,
    scryfallId: 'legacy-scryfall-id',
    oracleId: 'oracle-1',
    setCode: 'lea',
    setName: 'Limited Edition Alpha',
    collectorNumber: '161',
    cardLang: 'en',
    rarity: 'common',
    artist: 'Christopher Rush',
    finish: 'nonfoil',
    imageUrl: null,
  } as unknown as InventoryRow

  const seller = { name: 'The Pub Game Store', verified: true }

  it('falls back to scryfall_id for rows created before catalog_id existed', () => {
    const item = rowToInventoryItem(baseRow, seller)
    expect(item.card.catalogId).toBe('legacy-scryfall-id')
    expect(item.card.tcg).toBe('mtg')
  })

  it('prefers catalog_id when present', () => {
    const item = rowToInventoryItem({ ...baseRow, catalogId: 'cat-1' } as InventoryRow, seller)
    expect(item.card.catalogId).toBe('cat-1')
  })
})
