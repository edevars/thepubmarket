import { describe, expect, it } from 'vitest'
import { parseGameFilters } from './catalog-filters'

/** Construye el `query` que espera `parseGameFilters` a partir de un objeto plano. */
function queryFrom(params: Record<string, string[]>) {
  return (name: string) => params[name]
}

describe('parseGameFilters', () => {
  it('sin params game-specific, devuelve conditions vacío sin importar el tcg', () => {
    expect(parseGameFilters(undefined, queryFrom({}))).toEqual({
      ok: true,
      conditions: [],
      applied: [],
    })
    expect(parseGameFilters('mtg', queryFrom({}))).toEqual({
      ok: true,
      conditions: [],
      applied: [],
    })
    expect(parseGameFilters('riftbound', queryFrom({}))).toEqual({
      ok: true,
      conditions: [],
      applied: [],
    })
  })

  describe('cada filtro individualmente (tcg=riftbound)', () => {
    it('domain: jsonArray', () => {
      const result = parseGameFilters('riftbound', queryFrom({ domain: ['Fury'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.conditions).toHaveLength(1)
      expect(result.applied).toEqual([{ param: 'domain', values: ['Fury'] }])
    })

    it('type: jsonScalar', () => {
      const result = parseGameFilters('riftbound', queryFrom({ type: ['Unit'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'type', values: ['Unit'] }])
    })

    it('supertype: jsonScalar', () => {
      const result = parseGameFilters('riftbound', queryFrom({ supertype: ['Champion'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'supertype', values: ['Champion'] }])
    })

    it('energy: jsonInt', () => {
      const result = parseGameFilters('riftbound', queryFrom({ energy: ['3'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'energy', values: ['3'] }])
    })

    it('might: jsonInt', () => {
      const result = parseGameFilters('riftbound', queryFrom({ might: ['5'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'might', values: ['5'] }])
    })

    it('rarity: column', () => {
      const result = parseGameFilters('riftbound', queryFrom({ rarity: ['rare'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'rarity', values: ['rare'] }])
    })
  })

  describe('multi-valor: repetido y separado por comas', () => {
    it('domain repetido: OR dentro del param', () => {
      const result = parseGameFilters('riftbound', queryFrom({ domain: ['Fury', 'Order'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'domain', values: ['Fury', 'Order'] }])
    })

    it('domain separado por comas produce el mismo resultado', () => {
      const repeated = parseGameFilters('riftbound', queryFrom({ domain: ['Fury', 'Order'] }))
      const commaSeparated = parseGameFilters('riftbound', queryFrom({ domain: ['Fury,Order'] }))
      expect(commaSeparated).toEqual(repeated)
    })

    it('mezcla de repetido y comas en el mismo param', () => {
      const result = parseGameFilters('riftbound', queryFrom({ domain: ['Fury,Order', 'Mind'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'domain', values: ['Fury', 'Order', 'Mind'] }])
    })
  })

  it('normaliza valores case-insensitive a la casing canónica', () => {
    const result = parseGameFilters(
      'riftbound',
      queryFrom({ domain: ['fury', 'ORDER'], type: ['unit'], rarity: ['RARE'] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.applied).toEqual([
      { param: 'domain', values: ['Fury', 'Order'] },
      { param: 'type', values: ['Unit'] },
      { param: 'rarity', values: ['rare'] },
    ])
  })

  it('combina varios filtros a la vez (AND entre params)', () => {
    const result = parseGameFilters(
      'riftbound',
      queryFrom({ domain: ['Fury'], type: ['Unit'], energy: ['2'], rarity: ['common'] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.conditions).toHaveLength(4)
    expect(result.applied.map((a) => a.param).sort()).toEqual([
      'domain',
      'energy',
      'rarity',
      'type',
    ])
  })

  describe('filter_requires_tcg (AC#3: se rechaza, no se ignora)', () => {
    // domain/supertype/energy/might son EXCLUSIVOS de riftbound: sin tcg
    // o con tcg=mtg, siguen 400eando filter_requires_tcg sin cambios.
    for (const param of ['domain', 'supertype', 'energy', 'might']) {
      it(`${param} sin tcg`, () => {
        expect(parseGameFilters(undefined, queryFrom({ [param]: ['x'] }))).toEqual({
          ok: false,
          error: 'filter_requires_tcg',
          param,
          requiresTcg: 'riftbound',
        })
      })

      it(`${param} con tcg=mtg`, () => {
        expect(parseGameFilters('mtg', queryFrom({ [param]: ['x'] }))).toEqual({
          ok: false,
          error: 'filter_requires_tcg',
          param,
          requiresTcg: 'riftbound',
        })
      })
    }

    // type/rarity los registran AMBOS juegos (TASK-049): sin tcg siguen
    // 400eando (ambigüedad documentada — requiresTcg es el primer juego
    // registrante, riftbound, por orden de declaración en GAME_FILTERS), pero
    // con tcg=mtg ya NO son filter_requires_tcg (mtg también los registra) —
    // ver los describes dedicados más abajo para su comportamiento con mtg.
    for (const param of ['type', 'rarity']) {
      it(`${param} sin tcg`, () => {
        expect(parseGameFilters(undefined, queryFrom({ [param]: ['x'] }))).toEqual({
          ok: false,
          error: 'filter_requires_tcg',
          param,
          requiresTcg: 'riftbound',
        })
      })
    }
  })

  describe('MTG (TASK-049): filtros por juego', () => {
    it('color: jsonArray', () => {
      const result = parseGameFilters('mtg', queryFrom({ color: ['R'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.conditions).toHaveLength(1)
      expect(result.applied).toEqual([{ param: 'color', values: ['R'] }])
    })

    it('color: case-insensitive canonicaliza a mayúscula', () => {
      const result = parseGameFilters('mtg', queryFrom({ color: ['w'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'color', values: ['W'] }])
    })

    it('color: multi-valor, repetido y comas', () => {
      const result = parseGameFilters('mtg', queryFrom({ color: ['R,G'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'color', values: ['R', 'G'] }])
    })

    it('type: jsonArray (una carta puede tener varios tipos)', () => {
      const result = parseGameFilters('mtg', queryFrom({ type: ['Creature'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'type', values: ['Creature'] }])
    })

    it('rarity: column', () => {
      const result = parseGameFilters('mtg', queryFrom({ rarity: ['mythic'] }))
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.applied).toEqual([{ param: 'rarity', values: ['mythic'] }])
    })

    it('combina color + type + rarity (AND entre params)', () => {
      const result = parseGameFilters(
        'mtg',
        queryFrom({ color: ['U'], type: ['Instant'], rarity: ['common'] }),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('unreachable')
      expect(result.conditions).toHaveLength(3)
      expect(result.applied.map((a) => a.param).sort()).toEqual(['color', 'rarity', 'type'])
    })
  })

  describe('vocabularios cruzados entre mtg y riftbound (TASK-049)', () => {
    it('type=Creature&tcg=riftbound -> invalid_filter con el vocabulario de riftbound', () => {
      const result = parseGameFilters('riftbound', queryFrom({ type: ['Creature'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'type',
        value: 'Creature',
        supported: ['Battlefield', 'Gear', 'Legend', 'Rune', 'Spell', 'Unit'],
      })
    })

    it('type=Creature sin tcg -> filter_requires_tcg', () => {
      const result = parseGameFilters(undefined, queryFrom({ type: ['Creature'] }))
      expect(result).toEqual({
        ok: false,
        error: 'filter_requires_tcg',
        param: 'type',
        requiresTcg: 'riftbound',
      })
    })

    it('rarity=mythic&tcg=riftbound -> invalid_filter (mythic no existe en riftbound)', () => {
      const result = parseGameFilters('riftbound', queryFrom({ rarity: ['mythic'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'rarity',
        value: 'mythic',
        supported: ['common', 'uncommon', 'rare', 'epic', 'showcase'],
      })
    })

    it('rarity=showcase&tcg=mtg -> invalid_filter (showcase no existe en mtg)', () => {
      const result = parseGameFilters('mtg', queryFrom({ rarity: ['showcase'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'rarity',
        value: 'showcase',
        supported: ['common', 'uncommon', 'rare', 'mythic'],
      })
    })
  })

  describe('invalid_filter', () => {
    it('valor de enum no soportado', () => {
      const result = parseGameFilters('riftbound', queryFrom({ domain: ['Water'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'domain',
        value: 'Water',
        supported: ['Body', 'Calm', 'Chaos', 'Colorless', 'Fury', 'Mind', 'Order'],
      })
    })

    it('rarity con valor no soportado', () => {
      const result = parseGameFilters('riftbound', queryFrom({ rarity: ['mythic'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'rarity',
        value: 'mythic',
        supported: ['common', 'uncommon', 'rare', 'epic', 'showcase'],
      })
    })

    it('energy no entero', () => {
      const result = parseGameFilters('riftbound', queryFrom({ energy: ['abc'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'energy',
        value: 'abc',
        supported: ['0-99'],
      })
    })

    it('energy negativo', () => {
      const result = parseGameFilters('riftbound', queryFrom({ energy: ['-1'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'energy',
        value: '-1',
        supported: ['0-99'],
      })
    })

    it('might fuera de rango', () => {
      const result = parseGameFilters('riftbound', queryFrom({ might: ['100'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'might',
        value: '100',
        supported: ['0-99'],
      })
    })

    it('might con decimal', () => {
      const result = parseGameFilters('riftbound', queryFrom({ might: ['2.5'] }))
      expect(result).toEqual({
        ok: false,
        error: 'invalid_filter',
        param: 'might',
        value: '2.5',
        supported: ['0-99'],
      })
    })
  })

  it('valores en blanco/espacios se tratan como ausentes', () => {
    expect(parseGameFilters('riftbound', queryFrom({ domain: ['', '   '] }))).toEqual({
      ok: true,
      conditions: [],
      applied: [],
    })
    expect(parseGameFilters('riftbound', queryFrom({ domain: [] }))).toEqual({
      ok: true,
      conditions: [],
      applied: [],
    })
  })

  it('un param no registrado para ningún juego no produce error ni condición', () => {
    const result = parseGameFilters('riftbound', queryFrom({ notarealfilter: ['x'] }))
    expect(result).toEqual({ ok: true, conditions: [], applied: [] })
  })
})
