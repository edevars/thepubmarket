import { describe, expect, it } from 'vitest'
import { normalizeCard } from './scryfall'

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
    expect(snapshot).toMatchObject({
      rarity: 'common',
      setCode: 'lea',
      setName: 'Limited Edition Alpha',
      collectorNumber: '161',
      gameAttributes: null,
    })
  })
})
