import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogContext } from './catalog-providers'
import { getCardById, normalizeCard } from './scryfall'

describe('normalizeCard', () => {
  it('does not set rules/flavor text: Scryfall stays backward-compatible (TASK-038)', () => {
    const snapshot = normalizeCard({
      id: '11111111-2222-4333-8444-555555555555',
      oracle_id: 'oracle-1',
      name: 'Lightning Bolt',
      set: 'lea',
      set_name: 'Limited Edition Alpha',
      collector_number: '161',
      lang: 'en',
      rarity: 'common',
      artist: 'Christopher Rush',
      finishes: ['nonfoil', 'foil'],
      image_uris: { normal: 'https://cards.scryfall.io/normal/bolt.jpg' },
    })

    expect(snapshot.rulesText).toBeUndefined()
    expect(snapshot.flavorText).toBeUndefined()
    // El resto del contrato sigue igual: rareza/set/coleccionista disponibles.
    // gameAttributes ya NO es null (TASK-049): sin colors/type_line en el
    // fixture, se derivan los defaults documentados (colorless, sin tipos).
    expect(snapshot).toMatchObject({
      rarity: 'common',
      setCode: 'lea',
      setName: 'Limited Edition Alpha',
      collectorNumber: '161',
      gameAttributes: { tcg: 'mtg', colors: ['C'], types: [], typeLine: null, manaValue: null },
    })
  })

  describe('MtgAttributes (TASK-049)', () => {
    it('carta colorless (sin colors): colors = [C]', () => {
      const snapshot = normalizeCard({
        id: 'id-1',
        name: 'Solemn Simulacrum',
        set: 'mm2',
        set_name: 'Modern Masters 2015',
        collector_number: '227',
        lang: 'en',
        rarity: 'rare',
        colors: [],
        type_line: 'Artifact Creature — Golem',
        cmc: 4,
      })
      expect(snapshot.gameAttributes).toEqual({
        tcg: 'mtg',
        colors: ['C'],
        types: ['Artifact', 'Creature'],
        typeLine: 'Artifact Creature — Golem',
        manaValue: 4,
      })
    })

    it('carta multi-cara: colors es la unión de las caras', () => {
      const snapshot = normalizeCard({
        id: 'id-2',
        name: 'Delver of Secrets // Insectile Aberration',
        set: 'isd',
        set_name: 'Innistrad',
        collector_number: '51',
        lang: 'en',
        rarity: 'common',
        cmc: 1,
        card_faces: [
          { colors: ['U'], type_line: 'Creature — Human Wizard' },
          { colors: ['U'], type_line: 'Creature — Human Insect' },
        ],
      })
      expect(snapshot.gameAttributes).toEqual({
        tcg: 'mtg',
        colors: ['U'],
        types: ['Creature'],
        typeLine: 'Creature — Human Wizard',
        manaValue: 1,
      })
    })

    it("'Artifact Creature' produce ambos tipos", () => {
      const snapshot = normalizeCard({
        id: 'id-3',
        name: 'Ornithopter',
        set: 'lea',
        set_name: 'Limited Edition Alpha',
        collector_number: '300',
        lang: 'en',
        rarity: 'common',
        colors: [],
        type_line: 'Artifact Creature — Thopter',
        cmc: 0,
      })
      expect(snapshot.gameAttributes).toMatchObject({
        types: ['Artifact', 'Creature'],
      })
    })

    it('carta multicolor conserva todos los colores top-level', () => {
      const snapshot = normalizeCard({
        id: 'id-4',
        name: 'Lightning Helix',
        set: 'ravnica',
        set_name: 'Ravnica: City of Guilds',
        collector_number: '150',
        lang: 'en',
        rarity: 'uncommon',
        colors: ['R', 'W'],
        type_line: 'Instant',
        cmc: 2,
      })
      expect(snapshot.gameAttributes).toEqual({
        tcg: 'mtg',
        colors: ['R', 'W'],
        types: ['Instant'],
        typeLine: 'Instant',
        manaValue: 2,
      })
    })
  })
})

/** KV falso en memoria: alcanza para `get`/`put` con el shape que usa scryfall.ts. */
function fakeKv(seed: Record<string, unknown> = {}): KVNamespace {
  const store = new Map<string, string>(
    Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]),
  )
  return {
    get: async (key: string) => {
      const raw = store.get(key)
      return raw === undefined ? null : JSON.parse(raw)
    },
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
  } as unknown as KVNamespace
}

const RAW_BOLT = {
  id: 'fresh-id-from-scryfall',
  oracle_id: 'oracle-1',
  name: 'Lightning Bolt',
  set: 'lea',
  set_name: 'Limited Edition Alpha',
  collector_number: '161',
  lang: 'en',
  rarity: 'common',
  artist: 'Christopher Rush',
  finishes: ['nonfoil', 'foil'],
  image_uris: { normal: 'https://cards.scryfall.io/normal/bolt.jpg' },
}

describe('getCardById (TASK-046: cache shape validation)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats a legacy-shaped KV entry (scryfallId, sin tcg/catalogId) como cache miss y refetchea', async () => {
    // Forma vieja de CardSnapshot, previa al rename scryfallId -> catalogId
    // y a la adición de `tcg`. No debe servirse jamás.
    const legacySnapshot = {
      scryfallId: 'fresh-id-from-scryfall',
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
    const kv = fakeKv({ 'scryfall:card:v2:fresh-id-from-scryfall': legacySnapshot })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(RAW_BOLT), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const ctx = { kv, db: {} as CatalogContext['db'], origin: 'http://localhost' }
    const card = await getCardById('fresh-id-from-scryfall', ctx)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(card.catalogId).toBe('fresh-id-from-scryfall')
    expect(card.tcg).toBe('mtg')
  })

  it('sirve un snapshot cacheado con la forma actual sin pegarle a Scryfall', async () => {
    const validSnapshot = normalizeCard(RAW_BOLT)
    const kv = fakeKv({ 'scryfall:card:v2:fresh-id-from-scryfall': validSnapshot })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const ctx = { kv, db: {} as CatalogContext['db'], origin: 'http://localhost' }
    const card = await getCardById('fresh-id-from-scryfall', ctx)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(card).toEqual(validSnapshot)
  })
})
