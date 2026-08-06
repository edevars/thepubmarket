import { afterEach, describe, expect, it, vi } from 'vitest'
import { CARD_CACHE_TTL_SECONDS, CatalogError, SEARCH_CACHE_TTL_SECONDS } from './catalog'
import { getCardById, normalizeCard, searchCards } from './riftcodex'

/** Carta real de RiftCodex, recortada a los campos que consumimos. */
const JINX_SIGNATURE = {
  id: '69c4407c9288b1e85d94de8a',
  name: 'Jinx - Loose Cannon (Signature)',
  collector_number: 301,
  attributes: { energy: null, might: null, power: null },
  classification: { type: 'Legend', supertype: null, rarity: 'Showcase', domain: ['Fury'] },
  set: { set_id: 'OGN', label: 'Origins' },
  media: {
    image_url: 'https://cmsassets.rgpub.io/card.png',
    artist: 'Jonathan Santoro',
    accessibility_text: 'Riftbound Legend',
  },
  metadata: { alternate_art: false, overnumbered: false, signature: true },
}

const BEWITCHING_SPIRIT = {
  id: '69c4407d9288b1e85d94de95',
  name: 'Bewitching Spirit',
  collector_number: 121,
  attributes: { energy: 3, might: 2, power: null },
  classification: { type: 'Unit', supertype: null, rarity: 'Common', domain: ['Chaos'] },
  set: { set_id: 'UNL', label: 'Unleashed' },
  media: { image_url: 'https://cmsassets.rgpub.io/spirit.png', artist: 'Alix Branwyn' },
  metadata: { alternate_art: false, overnumbered: false, signature: false },
}

/** KV falso en memoria: registra los puts para poder afirmar sobre el TTL. */
function fakeKv() {
  const store = new Map<string, string>()
  const puts: Array<{ key: string; ttl?: number }> = []
  const kv = {
    get: async (key: string) => {
      const raw = store.get(key)
      return raw ? JSON.parse(raw) : null
    },
    put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      store.set(key, value)
      puts.push({ key, ttl: opts?.expirationTtl })
    },
  } as unknown as KVNamespace
  return { kv, puts, store }
}

function stubFetch(body: unknown, init: ResponseInit = {}) {
  // El parámetro está declarado para poder afirmar sobre la URL llamada.
  const mock = vi.fn(async (url: string | URL) => {
    void url
    return new Response(JSON.stringify(body), init)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('normalizeCard', () => {
  it('maps a Riftbound printing onto the shared snapshot', () => {
    expect(normalizeCard(BEWITCHING_SPIRIT)).toEqual({
      tcg: 'riftbound',
      catalogId: '69c4407d9288b1e85d94de95',
      oracleId: null,
      name: 'Bewitching Spirit',
      setCode: 'UNL',
      setName: 'Unleashed',
      collectorNumber: '121',
      lang: 'en',
      // Minúsculas para igualar la convención de los snapshots de Scryfall.
      rarity: 'common',
      artist: 'Alix Branwyn',
      finishes: [],
      imageUrl: 'https://cmsassets.rgpub.io/spirit.png',
      gameAttributes: {
        tcg: 'riftbound',
        type: 'Unit',
        supertype: null,
        domains: ['Chaos'],
        energy: 3,
        might: 2,
        power: null,
      },
    })
  })

  it('keeps variant printings as distinct entries, disambiguated by name', () => {
    const signature = normalizeCard(JINX_SIGNATURE)
    expect(signature.name).toBe('Jinx - Loose Cannon (Signature)')
    expect(signature.catalogId).toBe('69c4407c9288b1e85d94de8a')
    expect(signature.collectorNumber).toBe('301')
    // Las variantes NO son acabados: `finishes` vacío deja que el vendedor
    // elija cualquiera al publicar.
    expect(signature.finishes).toEqual([])
  })

  it('tolerates a card missing set, media and classification', () => {
    // La API es WIP: un campo ausente degrada el snapshot, no revienta el alta.
    const snapshot = normalizeCard({ id: 'abc', name: 'Mystery Card' })
    expect(snapshot).toMatchObject({
      catalogId: 'abc',
      name: 'Mystery Card',
      setCode: '',
      setName: '',
      collectorNumber: '',
      rarity: '',
      artist: null,
      imageUrl: null,
    })
  })

  it('carries null costs through as null instead of zero', () => {
    // Una Legend sin coste no es una carta de coste 0.
    expect(normalizeCard(JINX_SIGNATURE).gameAttributes).toEqual({
      tcg: 'riftbound',
      type: 'Legend',
      supertype: null,
      domains: ['Fury'],
      energy: null,
      might: null,
      power: null,
    })
  })

  it('leaves game attributes empty-but-present when classification is missing', () => {
    const attrs = normalizeCard({ id: 'abc', name: 'Mystery Card' }).gameAttributes
    expect(attrs).toMatchObject({ tcg: 'riftbound', type: null, domains: [] })
  })
})

describe('getCardById', () => {
  it('fetches a card and caches it with the long TTL', async () => {
    const { kv, puts } = fakeKv()
    const fetchMock = stubFetch(BEWITCHING_SPIRIT)

    const card = await getCardById(BEWITCHING_SPIRIT.id, kv)

    expect(card.name).toBe('Bewitching Spirit')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://api.riftcodex.com/cards/${BEWITCHING_SPIRIT.id}`,
    )
    expect(puts).toEqual([
      { key: `riftcodex:card:${BEWITCHING_SPIRIT.id}`, ttl: CARD_CACHE_TTL_SECONDS },
    ])
  })

  it('serves a cached card without hitting the API', async () => {
    const { kv } = fakeKv()
    stubFetch(BEWITCHING_SPIRIT)
    await getCardById(BEWITCHING_SPIRIT.id, kv)

    const fetchMock = stubFetch(BEWITCHING_SPIRIT)
    const cached = await getCardById(BEWITCHING_SPIRIT.id, kv)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(cached.name).toBe('Bewitching Spirit')
  })

  it('turns an upstream failure into a CatalogError carrying the status', async () => {
    const { kv } = fakeKv()
    // RiftCodex responde 500 (no 404) a un id inexistente.
    stubFetch({ detail: 'boom' }, { status: 500 })

    await expect(getCardById('deadbeefdeadbeefdeadbeef', kv)).rejects.toMatchObject({
      status: 500,
    })
    await expect(getCardById('deadbeefdeadbeefdeadbeef', kv)).rejects.toBeInstanceOf(CatalogError)
  })

  it('turns a network failure or timeout into a 504 CatalogError', async () => {
    const { kv } = fakeKv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted', 'TimeoutError')
      }),
    )

    await expect(getCardById(BEWITCHING_SPIRIT.id, kv)).rejects.toMatchObject({ status: 504 })
  })
})

describe('searchCards', () => {
  it('searches by fuzzy name and normalizes every printing', async () => {
    const { kv, puts } = fakeKv()
    const fetchMock = stubFetch({
      items: [JINX_SIGNATURE, BEWITCHING_SPIRIT],
      total: 2,
      page: 1,
      size: 60,
      pages: 1,
    })

    const results = await searchCards('jinx', kv)

    expect(results.map((r) => r.name)).toEqual([
      'Jinx - Loose Cannon (Signature)',
      'Bewitching Spirit',
    ])
    expect(results.every((r) => r.tcg === 'riftbound')).toBe(true)
    // El full-text (`/cards/search`) devuelve vacío en esta API: usamos fuzzy.
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/cards/name')
    expect(url.searchParams.get('fuzzy')).toBe('jinx')
    expect(puts).toEqual([{ key: 'riftcodex:search:jinx', ttl: SEARCH_CACHE_TTL_SECONDS }])
  })

  it('returns an empty list without calling the API for a blank query', async () => {
    const { kv } = fakeKv()
    const fetchMock = stubFetch({ items: [] })

    expect(await searchCards('   ', kv)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches a no-match search so a repeat lookup skips the API', async () => {
    const { kv, puts } = fakeKv()
    stubFetch({ items: [], total: 0 })
    expect(await searchCards('nonexistent card', kv)).toEqual([])
    expect(puts[0]?.ttl).toBe(SEARCH_CACHE_TTL_SECONDS)

    const fetchMock = stubFetch({ items: [] })
    expect(await searchCards('nonexistent card', kv)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
