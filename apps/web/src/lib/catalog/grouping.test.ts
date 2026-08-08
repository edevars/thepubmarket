import type { InventoryItem } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import {
  cardKey,
  dedupeByCard,
  groupByCard,
  offersOfSameCard,
  pickRepresentative,
} from './grouping'

interface ListingOverrides {
  id?: string
  catalogId?: string | null
  tcg?: InventoryItem['tcg']
  language?: string
  finish?: InventoryItem['finish']
  condition?: InventoryItem['condition']
  priceCents?: number
  quantity?: number
  name?: string
}

function listing(overrides: ListingOverrides = {}): InventoryItem {
  return {
    id: overrides.id ?? 'inv-1',
    sellerId: 'seller-1',
    sellerName: 'The Pub Game Store',
    sellerVerified: true,
    tcg: overrides.tcg ?? 'riftbound',
    card: {
      tcg: overrides.tcg ?? 'riftbound',
      catalogId: overrides.catalogId === undefined ? 'UNL-183' : (overrides.catalogId ?? ''),
      oracleId: 'oracle-shared',
      name: overrides.name ?? 'Rengar - Pridestalker',
      setCode: 'UNL',
      setName: 'Unleashed',
      collectorNumber: '183',
      lang: overrides.language ?? 'es',
      rarity: 'rare',
      artist: null,
      finishes: [],
      imageUrl: null,
      gameAttributes: null,
    },
    photos: [],
    condition: overrides.condition ?? 'NM',
    language: overrides.language ?? 'es',
    finish: overrides.finish ?? 'foil',
    priceCents: overrides.priceCents ?? 100_00,
    quantity: overrides.quantity ?? 1,
    status: 'active',
  } as InventoryItem
}

describe('cardKey: qué cuenta como la misma carta', () => {
  it('junta dos publicaciones de la misma impresión, idioma y acabado', () => {
    const hp = listing({ id: 'a', condition: 'HP', priceCents: 700_00 })
    const lp = listing({ id: 'b', condition: 'LP', priceCents: 1400_00 })
    expect(cardKey(hp)).toBe(cardKey(lp))
  })

  it('separa foil de no-foil: es otro producto y se cotiza distinto', () => {
    expect(cardKey(listing({ finish: 'foil' }))).not.toBe(cardKey(listing({ finish: 'nonfoil' })))
  })

  it('separa idiomas', () => {
    expect(cardKey(listing({ language: 'es' }))).not.toBe(cardKey(listing({ language: 'en' })))
  })

  it('separa impresiones distintas del mismo nombre', () => {
    const base = listing({ catalogId: 'UNL-183' })
    const alt = listing({ catalogId: 'UNL-227-STAR' })
    expect(cardKey(base)).not.toBe(cardKey(alt))
  })

  it('separa juegos aunque el id de impresión coincidiera', () => {
    expect(cardKey(listing({ tcg: 'mtg', catalogId: 'X-1' }))).not.toBe(
      cardKey(listing({ tcg: 'riftbound', catalogId: 'X-1' })),
    )
  })

  /**
   * Sin id de impresión no hay con qué demostrar que dos filas son la misma
   * carta. Fusionarlas por nombre juntaría impresiones distintas bajo un
   * precio ajeno, así que cada fila se queda sola.
   */
  it('no agrupa filas sin id de impresión, ni siquiera con el mismo nombre', () => {
    const a = listing({ id: 'a', catalogId: null })
    const b = listing({ id: 'b', catalogId: null })
    expect(cardKey(a)).not.toBe(cardKey(b))
    expect(groupByCard([a, b])).toHaveLength(2)
  })
})

describe('pickRepresentative: la oferta que se publica en el catálogo', () => {
  it('elige la más cercana al promedio', () => {
    const offers = [
      listing({ id: 'a', priceCents: 100_00 }),
      listing({ id: 'b', priceCents: 500_00 }),
      listing({ id: 'c', priceCents: 1200_00 }),
    ]
    // Promedio 600.00 → 500.00 queda a 100.00, más cerca que 100.00 y 1200.00.
    expect(pickRepresentative(offers).id).toBe('b')
  })

  it('con dos ofertas (empate siempre) gana la barata', () => {
    const offers = [
      listing({ id: 'caro', priceCents: 1400_00 }),
      listing({ id: 'barato', priceCents: 700_00 }),
    ]
    expect(pickRepresentative(offers).id).toBe('barato')
  })

  it('desempata por id cuando el precio también empata', () => {
    const offers = [
      listing({ id: 'b', priceCents: 700_00 }),
      listing({ id: 'a', priceCents: 700_00 }),
    ]
    expect(pickRepresentative(offers).id).toBe('a')
  })

  it('con una sola oferta devuelve esa', () => {
    expect(pickRepresentative([listing({ id: 'solo' })]).id).toBe('solo')
  })

  it('no depende del orden de entrada', () => {
    const offers = [
      listing({ id: 'a', priceCents: 100_00 }),
      listing({ id: 'b', priceCents: 500_00 }),
      listing({ id: 'c', priceCents: 1200_00 }),
    ]
    expect(pickRepresentative([...offers].reverse()).id).toBe('b')
  })
})

describe('groupByCard', () => {
  it('devuelve una carta por identidad, con sus ofertas de menor a mayor precio', () => {
    const groups = groupByCard([
      listing({ id: 'lp', condition: 'LP', priceCents: 1400_00, quantity: 4 }),
      listing({ id: 'hp', condition: 'HP', priceCents: 700_00, quantity: 1 }),
      listing({ id: 'otra', catalogId: 'UNL-120', priceCents: 411_00 }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]?.offers.map((o) => o.id)).toEqual(['hp', 'lp'])
    expect(groups[0]?.representative.id).toBe('hp')
    expect(groups[0]?.minPriceCents).toBe(700_00)
    expect(groups[0]?.totalQuantity).toBe(5)
  })

  it('conserva el orden de entrada por primera aparición de cada carta', () => {
    const groups = groupByCard([
      listing({ id: 'a', catalogId: 'UNL-001', name: 'Ahri' }),
      listing({ id: 'r1', catalogId: 'UNL-183', priceCents: 1400_00 }),
      listing({ id: 'z', catalogId: 'UNL-900', name: 'Zed' }),
      listing({ id: 'r2', catalogId: 'UNL-183', priceCents: 700_00 }),
    ])
    expect(groups.map((g) => g.key.split('|')[1])).toEqual(['UNL-001', 'UNL-183', 'UNL-900'])
  })

  it('dedupeByCard deja una publicación por carta', () => {
    const out = dedupeByCard([
      listing({ id: 'hp', priceCents: 700_00 }),
      listing({ id: 'lp', priceCents: 1400_00 }),
    ])
    expect(out.map((i) => i.id)).toEqual(['hp'])
  })

  it('no toca un catálogo sin duplicados', () => {
    const items = [
      listing({ id: 'a', catalogId: 'UNL-001' }),
      listing({ id: 'b', catalogId: 'UNL-002' }),
    ]
    expect(dedupeByCard(items).map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('offersOfSameCard', () => {
  const item = listing({ id: 'lp', condition: 'LP', priceCents: 1400_00 })

  it('incluye la oferta que se está viendo junto con sus hermanas', () => {
    const out = offersOfSameCard(item, [
      listing({ id: 'hp', condition: 'HP', priceCents: 700_00 }),
      item,
    ])
    expect(out.map((o) => o.id)).toEqual(['hp', 'lp'])
  })

  /** La regresión de TASK-062: el `oracleId` de MTG es el mismo para TODAS las
   * reimpresiones, así que emparejar por él (o por nombre) metía en la ficha
   * cartas de otros sets, otros idiomas y otros acabados. */
  it('descarta lo que comparte nombre u oracleId pero no es la misma carta', () => {
    const out = offersOfSameCard(item, [
      listing({ id: 'otro-set', catalogId: 'UNL-227-STAR', priceCents: 100_00 }),
      listing({ id: 'otro-idioma', language: 'en', priceCents: 100_00 }),
      listing({ id: 'no-foil', finish: 'nonfoil', priceCents: 100_00 }),
    ])
    expect(out.map((o) => o.id)).toEqual(['lp'])
  })

  it('sin hermanas devuelve solo la propia', () => {
    expect(offersOfSameCard(item, []).map((o) => o.id)).toEqual(['lp'])
  })
})
