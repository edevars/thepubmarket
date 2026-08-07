import type { Db, InventoryRow } from '@thepubmarket/db'
import type { CardSnapshot } from '@thepubmarket/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogContext } from './catalog-providers'
import { catalogIdOf, createListing, type ListingInput, rowToInventoryItem } from './inventory'
import { getCardById, ScryfallError } from './scryfall'

// El provider local de Riftbound (catalog-db) leería D1; aquí se mockea la
// fábrica completa para que el registro de catalog-providers use este stub.
const { mockedGetRiftboundCard } = vi.hoisted(() => ({ mockedGetRiftboundCard: vi.fn() }))

vi.mock('./scryfall', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scryfall')>()),
  getCardById: vi.fn(),
}))

vi.mock('./catalog-db', () => ({
  localCatalogProvider: () => ({ getCardById: mockedGetRiftboundCard, searchCards: vi.fn() }),
}))

const mockedGetCardById = vi.mocked(getCardById)

const KV = {} as KVNamespace
const ORIGIN = 'http://localhost:8787'
/** Contexto de catálogo con un Db dado (los tests de alta capturan el insert). */
const ctxWith = (db: Db): CatalogContext => ({ db, kv: KV, origin: ORIGIN })

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
  gameAttributes: null,
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

const RIFTBOUND_SNAPSHOT: CardSnapshot = {
  tcg: 'riftbound',
  catalogId: '69c4407c9288b1e85d94de8a',
  oracleId: null,
  name: 'Jinx - Loose Cannon (Signature)',
  setCode: 'OGN',
  setName: 'Origins',
  collectorNumber: '301',
  lang: 'en',
  rarity: 'showcase',
  artist: 'Jonathan Santoro',
  finishes: [],
  imageUrl: 'https://cmsassets.rgpub.io/card.png',
  gameAttributes: {
    tcg: 'riftbound',
    type: 'Legend',
    supertype: null,
    domains: ['Fury', 'Order'],
    energy: 4,
    might: 3,
    power: null,
  },
}

beforeEach(() => {
  mockedGetCardById.mockReset()
  mockedGetRiftboundCard.mockReset()
})

describe('createListing', () => {
  it('publishes an MTG single exactly as before: snapshot + legacy columns', async () => {
    mockedGetCardById.mockResolvedValue(MTG_SNAPSHOT)
    const captured: Record<string, unknown>[] = []

    const result = await createListing(
      ctxWith(fakeDb(captured)),
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER },
      'seller-1',
    )

    expect(result.ok).toBe(true)
    expect(mockedGetCardById).toHaveBeenCalledWith(
      MTG_SNAPSHOT.catalogId,
      expect.objectContaining({ kv: KV, origin: ORIGIN }),
    )
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

  it('publishes a Riftbound single through its own catalog, without MTG columns', async () => {
    mockedGetRiftboundCard.mockResolvedValue(RIFTBOUND_SNAPSHOT)
    const captured: Record<string, unknown>[] = []

    const result = await createListing(
      ctxWith(fakeDb(captured)),
      { tcg: 'riftbound', catalogId: RIFTBOUND_SNAPSHOT.catalogId, ...OFFER, language: 'en' },
      'seller-1',
    )

    expect(result.ok).toBe(true)
    expect(mockedGetCardById).not.toHaveBeenCalled()
    expect(captured[0]).toMatchObject({
      tcg: 'riftbound',
      title: 'Jinx - Loose Cannon (Signature)',
      catalogId: RIFTBOUND_SNAPSHOT.catalogId,
      // Las columnas legacy de MTG quedan vacías fuera de MTG.
      scryfallId: null,
      oracleId: null,
      setCode: 'OGN',
      collectorNumber: '301',
      rarity: 'showcase',
      // Atributos de juego serializados como blob JSON.
      cardAttributes: JSON.stringify(RIFTBOUND_SNAPSHOT.gameAttributes),
    })
  })

  it('stores no game attributes for a game whose catalog does not provide them', async () => {
    mockedGetCardById.mockResolvedValue(MTG_SNAPSHOT)
    const captured: Record<string, unknown>[] = []

    await createListing(
      ctxWith(fakeDb(captured)),
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER },
      'seller-1',
    )

    expect(captured[0]?.cardAttributes).toBeNull()
  })

  it('rejects a finish the printing does not offer, listing the available ones', async () => {
    mockedGetCardById.mockResolvedValue({ ...MTG_SNAPSHOT, finishes: ['nonfoil'] })

    const result = await createListing(
      ctxWith(fakeDb([])),
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
      ctxWith(fakeDb(captured)),
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER, finish: 'foil' },
      'seller-1',
    )

    expect(result.ok).toBe(true)
    expect(captured[0]?.finish).toBe('foil')
  })

  it('rejects a game without an integrated catalog before touching any provider', async () => {
    // Pokémon aún no tiene catálogo; MTG y Riftbound sí.
    const result = await createListing(
      ctxWith(fakeDb([])),
      { tcg: 'pokemon', catalogId: 'pkm-001', ...OFFER },
      'seller-1',
    )

    expect(result).toMatchObject({
      ok: false,
      error: 'tcg_not_supported',
      status: 400,
      extra: { tcg: 'pokemon', supported: ['mtg', 'riftbound'] },
    })
    expect(mockedGetCardById).not.toHaveBeenCalled()
  })

  it('rejects a snapshot without catalogId instead of inserting a row with NULL catalog_id (TASK-046)', async () => {
    // Guarda contra un snapshot mal formado (p.ej. cache de KV con contrato
    // viejo) que llegaría con catalogId vacío/undefined.
    mockedGetCardById.mockResolvedValue({ ...MTG_SNAPSHOT, catalogId: '' })
    const captured: Record<string, unknown>[] = []

    const result = await createListing(
      ctxWith(fakeDb(captured)),
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER },
      'seller-1',
    )

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_catalog_snapshot',
      status: 502,
      extra: { tcg: 'mtg' },
    })
    expect(captured).toHaveLength(0)
  })

  it('maps a provider 404 to card_not_found and other failures to 502', async () => {
    mockedGetCardById.mockRejectedValueOnce(new ScryfallError('missing', 404))
    const notFound = await createListing(
      ctxWith(fakeDb([])),
      { tcg: 'mtg', catalogId: MTG_SNAPSHOT.catalogId, ...OFFER },
      'seller-1',
    )
    expect(notFound).toMatchObject({ ok: false, status: 404 })

    mockedGetCardById.mockRejectedValueOnce(new ScryfallError('boom', 500))
    const upstream = await createListing(
      ctxWith(fakeDb([])),
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

  it('parses stored game attributes back into the snapshot', () => {
    const row = {
      ...baseRow,
      tcg: 'riftbound',
      cardAttributes: JSON.stringify(RIFTBOUND_SNAPSHOT.gameAttributes),
    } as InventoryRow
    expect(rowToInventoryItem(row, seller).card.gameAttributes).toEqual(
      RIFTBOUND_SNAPSHOT.gameAttributes,
    )
  })

  it('degrades to no attributes rather than throwing on a corrupt or unknown blob', () => {
    // Un blob roto no debe tumbar el render de una publicación válida.
    for (const bad of ['{not json', 'null', '"a string"', '{"missing":"discriminant"}']) {
      const row = { ...baseRow, cardAttributes: bad } as InventoryRow
      expect(rowToInventoryItem(row, seller).card.gameAttributes).toBeNull()
    }
  })

  it('leaves rules/flavor text unset (TASK-038): they only live in catalog_cards, not in the snapshot', () => {
    // `inventory` nunca guardó rules_text/flavor_text; el detalle público los
    // junta aparte desde `catalog_cards` (ver routes/catalog.ts). El snapshot
    // que sale de aquí debe quedarse sin ellos, no inventar null.
    const item = rowToInventoryItem(baseRow, seller)
    expect(item.card.rulesText).toBeUndefined()
    expect(item.card.flavorText).toBeUndefined()
  })

  it('exposes rarity, set code/name and collector number for both MTG and Riftbound rows', () => {
    const mtgItem = rowToInventoryItem(baseRow, seller)
    expect(mtgItem.card).toMatchObject({
      rarity: 'common',
      setCode: 'lea',
      setName: 'Limited Edition Alpha',
      collectorNumber: '161',
    })

    const riftboundRow = {
      ...baseRow,
      tcg: 'riftbound',
      rarity: 'showcase',
      setCode: 'OGN',
      setName: 'Origins',
      collectorNumber: '301',
      cardAttributes: JSON.stringify(RIFTBOUND_SNAPSHOT.gameAttributes),
    } as InventoryRow
    const riftboundItem = rowToInventoryItem(riftboundRow, seller)
    expect(riftboundItem.card).toMatchObject({
      rarity: 'showcase',
      setCode: 'OGN',
      setName: 'Origins',
      collectorNumber: '301',
      gameAttributes: RIFTBOUND_SNAPSHOT.gameAttributes,
    })
  })
})

describe('catalogIdOf', () => {
  it('prefers catalog_id when present', () => {
    expect(catalogIdOf({ catalogId: 'cat-1', scryfallId: 'legacy' } as InventoryRow)).toBe('cat-1')
  })

  it('falls back to scryfall_id for rows created before catalog_id existed', () => {
    expect(catalogIdOf({ catalogId: null, scryfallId: 'legacy' } as InventoryRow)).toBe('legacy')
  })

  it('is empty when neither column has a value', () => {
    expect(catalogIdOf({ catalogId: null, scryfallId: null } as InventoryRow)).toBe('')
  })
})
