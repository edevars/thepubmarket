import type { Condition, Tcg } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import { type BuildFilterModelInput, buildFilterModel, pipsWidth } from './filter-model'
import { facetsFor } from './game-filters'

const NO_CONDITION_COUNTS: Record<Condition, number> = { NM: 0, LP: 0, MP: 0, HP: 0, DMG: 0 }

type Overrides = Partial<Omit<BuildFilterModelInput, 'local'>> & {
  local?: Partial<BuildFilterModelInput['local']>
}

function input(overrides: Overrides = {}): BuildFilterModelInput {
  const { local, ...rest } = overrides
  return {
    activeGame: rest.activeGame,
    gameFacets: facetsFor(rest.activeGame),
    gameSelections: {},
    conditionCounts: { ...NO_CONDITION_COUNTS },
    languageCounts: {},
    foilCount: 0,
    gameFacetCounts: {},
    freeTextOptions: {},
    ...rest,
    // Después del spread a propósito: `local` es parcial en los tests y se
    // mezcla con los defaults en vez de reemplazarlos.
    local: { conditions: [], languages: [], foilOnly: false, minPesos: '', maxPesos: '', ...local },
  }
}

function byId(model: ReturnType<typeof buildFilterModel>, id: string) {
  const descriptor = model.all.find((d) => d.id === id)
  if (!descriptor) throw new Error(`no descriptor for ${id}`)
  return descriptor
}

describe('disabled rule (the single source of truth)', () => {
  it('disables a value with zero count that is not selected', () => {
    const model = buildFilterModel(input({ conditionCounts: { ...NO_CONDITION_COUNTS, NM: 3 } }))
    const cond = byId(model, 'cond')
    expect(cond.values.find((v) => v.value === 'NM')).toMatchObject({ disabled: false, count: 3 })
    expect(cond.values.find((v) => v.value === 'LP')).toMatchObject({ disabled: true, count: 0 })
  })

  it('never disables a selected value, even at zero count', () => {
    const model = buildFilterModel(input({ local: { conditions: ['DMG'] } }))
    const dmg = byId(model, 'cond').values.find((v) => v.value === 'DMG')
    expect(dmg).toMatchObject({ count: 0, selected: true, disabled: false })
  })

  it('applies the same rule to game facet tiles, pips and int tiles', () => {
    const model = buildFilterModel(
      input({
        activeGame: 'riftbound',
        gameSelections: { domain: ['Chaos'], energy: ['9'] },
        gameFacetCounts: { domain: { Fury: 2 }, type: { Unit: 5 }, energy: { 1: 4 } },
      }),
    )
    const domain = byId(model, 'domain') // pips
    expect(domain.values.find((v) => v.value === 'Fury')?.disabled).toBe(false)
    expect(domain.values.find((v) => v.value === 'Chaos')).toMatchObject({
      count: 0,
      selected: true,
      disabled: false,
    })
    expect(domain.values.find((v) => v.value === 'Calm')?.disabled).toBe(true)

    const type = byId(model, 'type') // tiles
    expect(type.values.find((v) => v.value === 'Unit')?.disabled).toBe(false)
    expect(type.values.find((v) => v.value === 'Spell')?.disabled).toBe(true)

    const energy = byId(model, 'energy') // ints
    expect(energy.values.find((v) => v.value === '1')?.disabled).toBe(false)
    expect(energy.values.find((v) => v.value === '9')).toMatchObject({
      count: 0,
      selected: true,
      disabled: false,
    })
    expect(energy.values.find((v) => v.value === '0')?.disabled).toBe(true)
  })

  it('disables the foil switch when nothing foil is in stock and it is off', () => {
    expect(byId(buildFilterModel(input()), 'foil').values[0]?.disabled).toBe(true)
    expect(byId(buildFilterModel(input({ foilCount: 4 })), 'foil').values[0]?.disabled).toBe(false)
    const on = buildFilterModel(input({ local: { foilOnly: true } }))
    expect(byId(on, 'foil').values[0]).toMatchObject({ selected: true, disabled: false })
  })
})

describe('identity zone', () => {
  it('picks the facet declared with layout pips', () => {
    expect(buildFilterModel(input({ activeGame: 'mtg' })).identity?.id).toBe('color')
    expect(buildFilterModel(input({ activeGame: 'riftbound' })).identity?.id).toBe('domain')
  })

  it('renders the identity facet as pips and keeps it out of the card zone', () => {
    const model = buildFilterModel(input({ activeGame: 'mtg' }))
    expect(model.identity).toMatchObject({ kind: 'pips', zone: 'identity' })
    expect(model.inline.map((d) => d.id)).not.toContain('color')
    expect(model.overflow.map((d) => d.id)).not.toContain('color')
  })

  it('is null for games without facets and with no game at all', () => {
    for (const tcg of ['pokemon', 'yugioh', 'onepiece', 'lorcana'] as Tcg[]) {
      const model = buildFilterModel(input({ activeGame: tcg }))
      expect(model.identity, tcg).toBeNull()
      expect(model.overflow, tcg).toEqual([])
      expect(model.inline.map((d) => d.id)).toEqual(['cond', 'lang', 'price', 'foil'])
    }
    expect(buildFilterModel(input()).identity).toBeNull()
  })
})

describe('frozen facet order', () => {
  it('never reorders the output of facetsFor', () => {
    for (const tcg of ['mtg', 'riftbound'] as Tcg[]) {
      const model = buildFilterModel(input({ activeGame: tcg }))
      const gameIds = model.all.filter((d) => d.source === 'game').map((d) => d.id)
      expect(gameIds, tcg).toEqual(facetsFor(tcg).map((f) => f.param))
    }
  })

  it('keeps the offer filters last and in a stable order', () => {
    const model = buildFilterModel(input({ activeGame: 'riftbound' }))
    expect(model.all.slice(-4).map((d) => d.id)).toEqual(['cond', 'lang', 'price', 'foil'])
  })
})

describe('inline / overflow split', () => {
  it('fits every MTG facet inline with no overflow trigger', () => {
    const model = buildFilterModel(input({ activeGame: 'mtg' }))
    expect(model.inline.map((d) => d.id)).toEqual([
      'type',
      'rarity',
      'set',
      'cond',
      'lang',
      'price',
      'foil',
    ])
    expect(model.overflow).toEqual([])
  })

  it('pushes the tail of the Riftbound facets into overflow', () => {
    const model = buildFilterModel(input({ activeGame: 'riftbound' }))
    expect(model.inline.map((d) => d.id)).toEqual([
      'type',
      'supertype',
      'rarity',
      'cond',
      'lang',
      'price',
      'foil',
    ])
    expect(model.overflow.map((d) => d.id)).toEqual(['energy', 'might', 'set'])
  })

  it('always keeps the four offer filters inline', () => {
    for (const tcg of [undefined, 'mtg', 'riftbound', 'pokemon'] as (Tcg | undefined)[]) {
      const inline = buildFilterModel(input({ activeGame: tcg })).inline.map((d) => d.id)
      expect(inline.slice(-4), String(tcg)).toEqual(['cond', 'lang', 'price', 'foil'])
    }
  })

  it('drops facets to overflow when the budget shrinks', () => {
    const wide = buildFilterModel(input({ activeGame: 'mtg' }))
    const narrow = buildFilterModel(input({ activeGame: 'mtg', budgetPx: 800 }))
    expect(wide.overflow).toEqual([])
    expect(narrow.overflow.length).toBeGreaterThan(0)
    // El reparto solo mueve facetas de carta: la oferta nunca se va al overflow.
    expect(narrow.overflow.every((d) => d.source === 'game')).toBe(true)
  })

  it('honours the inline cap even when the budget is generous', () => {
    const model = buildFilterModel(input({ activeGame: 'riftbound', budgetPx: 100_000 }))
    expect(model.inline.filter((d) => d.zone === 'card')).toHaveLength(3)
    expect(model.overflow).toHaveLength(3)
  })

  it('aligns triggers that start past the middle of the rail to the end', () => {
    const model = buildFilterModel(input({ activeGame: 'riftbound' }))
    expect(byId(model, 'type').align).toBe('start')
    expect(byId(model, 'foil').align).toBe('end')
  })
})

describe('width estimates', () => {
  it('does not vary with how many values are selected', () => {
    const empty = buildFilterModel(input({ activeGame: 'riftbound' }))
    const full = buildFilterModel(
      input({
        activeGame: 'riftbound',
        local: { conditions: ['NM', 'LP', 'MP'], foilOnly: true },
        gameSelections: { domain: ['Fury', 'Calm', 'Mind'], type: ['Unit', 'Spell'] },
      }),
    )
    expect(full.all.map((d) => d.estWidth)).toEqual(empty.all.map((d) => d.estWidth))
    // …y por tanto el reparto tampoco se mueve: seleccionar no puede empujar
    // un trigger al overflow con su popover abierto.
    expect(full.inline.map((d) => d.id)).toEqual(empty.inline.map((d) => d.id))
    expect(full.overflow.map((d) => d.id)).toEqual(empty.overflow.map((d) => d.id))
  })

  it('sizes the pip row from the full vocabulary, disabled ones included', () => {
    expect(pipsWidth(6)).toBe(220)
    expect(pipsWidth(7)).toBe(258)
    expect(pipsWidth(0)).toBe(0)
    const mtg = buildFilterModel(input({ activeGame: 'mtg' }))
    expect(mtg.identity?.estWidth).toBe(pipsWidth(6))
  })
})

describe('descriptor shape', () => {
  it('exposes the raw price strings instead of a value vocabulary', () => {
    const model = buildFilterModel(input({ local: { minPesos: '50', maxPesos: '900' } }))
    const price = byId(model, 'price')
    expect(price).toMatchObject({ kind: 'range', values: [], selectedCount: 1 })
    expect(price.range).toEqual({ minPesos: '50', maxPesos: '900' })
    expect(price.triggerLabelKey).toBe('fPriceShort')
  })

  it('counts an empty price range as not selected', () => {
    expect(byId(buildFilterModel(input()), 'price').selectedCount).toBe(0)
  })

  it('builds int facets over their declared inclusive range', () => {
    const energy = byId(buildFilterModel(input({ activeGame: 'riftbound' })), 'energy')
    expect(energy).toMatchObject({ kind: 'ints', intRange: { min: 0, max: 12 } })
    expect(energy.values.map((v) => v.value)).toEqual(
      Array.from({ length: 13 }, (_, i) => String(i)),
    )
  })

  it('carries the derived labels of free-text facets', () => {
    const model = buildFilterModel(
      input({
        activeGame: 'mtg',
        freeTextOptions: { set: [{ value: 'mh2', label: 'Modern Horizons 2 (MH2)' }] },
        gameFacetCounts: { set: { mh2: 7 } },
      }),
    )
    const set = byId(model, 'set')
    expect(set.kind).toBe('select')
    expect(set.values).toEqual([
      {
        value: 'mh2',
        label: 'Modern Horizons 2 (MH2)',
        count: 7,
        selected: false,
        disabled: false,
      },
    ])
  })

  it('marks the source of each filter so the two URL channels never mix', () => {
    const model = buildFilterModel(input({ activeGame: 'mtg' }))
    expect(model.all.filter((d) => d.source === 'local').map((d) => d.id)).toEqual([
      'cond',
      'lang',
      'price',
      'foil',
    ])
    expect(model.all.filter((d) => d.source === 'game').every((d) => d.zone !== 'offer')).toBe(true)
  })
})

describe('selection counts', () => {
  it('totals every selected value and mirrors the overflow badge', () => {
    const model = buildFilterModel(
      input({
        activeGame: 'riftbound',
        local: { conditions: ['NM', 'LP'], foilOnly: true, minPesos: '10' },
        gameSelections: { domain: ['Fury'], might: ['3', '4'] },
      }),
    )
    // 2 condiciones + foil + precio + 1 dominio + 2 might
    expect(model.totalSelectedCount).toBe(7)
    expect(model.overflowSelectedCount).toBe(2)
  })

  it('is zero when nothing is selected', () => {
    const model = buildFilterModel(input({ activeGame: 'mtg' }))
    expect(model.totalSelectedCount).toBe(0)
    expect(model.overflowSelectedCount).toBe(0)
  })
})
