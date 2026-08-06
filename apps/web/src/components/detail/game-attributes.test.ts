import type { RiftboundAttributes } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import { type GameAttributeLabels, gameAttributeRows } from './game-attributes'

const LABELS: GameAttributeLabels = {
  type: 'Tipo',
  domains: 'Dominios',
  energy: 'Energía',
  might: 'Poderío',
  power: 'Poder',
}

const FULL: RiftboundAttributes = {
  tcg: 'riftbound',
  type: 'Unit',
  supertype: 'Champion',
  domains: ['Fury', 'Order'],
  energy: 3,
  might: 2,
  power: 1,
}

describe('gameAttributeRows', () => {
  it('renders every Riftbound attribute a card carries', () => {
    expect(gameAttributeRows(FULL, LABELS)).toEqual([
      ['Tipo', 'Champion · Unit'],
      ['Dominios', 'Fury · Order'],
      ['Energía', '3'],
      ['Poderío', '2'],
      ['Poder', '1'],
    ])
  })

  it('renders nothing for a card without game attributes (MTG and legacy rows)', () => {
    expect(gameAttributeRows(null, LABELS)).toEqual([])
    expect(gameAttributeRows(undefined, LABELS)).toEqual([])
  })

  it('omits absent attributes instead of showing empty rows', () => {
    const sparse: RiftboundAttributes = {
      tcg: 'riftbound',
      type: 'Spell',
      supertype: null,
      domains: [],
      energy: null,
      might: null,
      power: null,
    }
    expect(gameAttributeRows(sparse, LABELS)).toEqual([['Tipo', 'Spell']])
  })

  it('keeps a zero cost, which is a real value and not "missing"', () => {
    const zeroCost: RiftboundAttributes = { ...FULL, energy: 0, might: 0, power: 0 }
    expect(gameAttributeRows(zeroCost, LABELS)).toEqual(
      expect.arrayContaining([
        ['Energía', '0'],
        ['Poderío', '0'],
        ['Poder', '0'],
      ]),
    )
  })

  it('drops the type row entirely when neither type nor supertype is known', () => {
    const untyped: RiftboundAttributes = { ...FULL, type: null, supertype: null }
    expect(gameAttributeRows(untyped, LABELS).map(([label]) => label)).not.toContain('Tipo')
  })
})
