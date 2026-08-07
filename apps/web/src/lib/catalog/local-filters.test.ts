import { describe, expect, it } from 'vitest'
import {
  applyLocalFiltersToSearchParams,
  countActiveLocalFilters,
  EMPTY_LOCAL_FILTERS,
  type LocalFilters,
  parseLocalFilters,
  parseLocalFiltersFromSearchParams,
  serializeLocalFilters,
} from './local-filters'

describe('parseLocalFilters', () => {
  it('devuelve los defaults cuando no hay params', () => {
    expect(parseLocalFilters(new URLSearchParams())).toEqual(EMPTY_LOCAL_FILTERS)
  })

  it('lee condiciones separadas por coma y descarta valores inválidos', () => {
    const params = new URLSearchParams('cond=NM,LP,XX,nm')
    // 'nm' minúscula no matchea el vocabulario canónico (case-sensitive, a
    // diferencia de game-filters que sí normaliza casing) — mismo criterio
    // que el resto de este módulo: valor corrupto se ignora, no se corrige.
    expect(parseLocalFilters(params).conditions).toEqual(['NM', 'LP'])
  })

  it('deduplica condiciones repetidas', () => {
    const params = new URLSearchParams('cond=NM,NM,LP')
    expect(parseLocalFilters(params).conditions).toEqual(['NM', 'LP'])
  })

  it('lee idiomas válidos y descarta el resto', () => {
    const params = new URLSearchParams('lang=es,en,fr')
    expect(parseLocalFilters(params).languages).toEqual(['es', 'en'])
  })

  it('foil=1 activa foilOnly, cualquier otro valor no', () => {
    expect(parseLocalFilters(new URLSearchParams('foil=1')).foilOnly).toBe(true)
    expect(parseLocalFilters(new URLSearchParams('foil=true')).foilOnly).toBe(false)
    expect(parseLocalFilters(new URLSearchParams('foil=0')).foilOnly).toBe(false)
  })

  it('min/max solo aceptan enteros positivos', () => {
    expect(parseLocalFilters(new URLSearchParams('min=100&max=500')).minPesos).toBe('100')
    expect(parseLocalFilters(new URLSearchParams('min=100&max=500')).maxPesos).toBe('500')
    expect(parseLocalFilters(new URLSearchParams('min=abc')).minPesos).toBe('')
    expect(parseLocalFilters(new URLSearchParams('min=-5')).minPesos).toBe('')
    expect(parseLocalFilters(new URLSearchParams('min=1.5')).minPesos).toBe('')
  })

  it('sort válido se respeta, inválido cae a relevance', () => {
    expect(parseLocalFilters(new URLSearchParams('sort=price_asc')).sort).toBe('price_asc')
    expect(parseLocalFilters(new URLSearchParams('sort=price_desc')).sort).toBe('price_desc')
    expect(parseLocalFilters(new URLSearchParams('sort=newest')).sort).toBe('newest')
    expect(parseLocalFilters(new URLSearchParams('sort=bogus')).sort).toBe('relevance')
  })

  it('nunca lanza ante params vacíos o corruptos', () => {
    expect(() =>
      parseLocalFilters(new URLSearchParams('cond=&lang=&foil=&min=&max=&sort=')),
    ).not.toThrow()
  })
})

describe('parseLocalFiltersFromSearchParams', () => {
  it('lee de un Record (server component) igual que de URLSearchParams', () => {
    const result = parseLocalFiltersFromSearchParams({
      cond: 'NM,LP',
      lang: 'es',
      foil: '1',
      min: '100',
      max: '500',
      sort: 'newest',
    })
    expect(result).toEqual({
      conditions: ['NM', 'LP'],
      languages: ['es'],
      foilOnly: true,
      minPesos: '100',
      maxPesos: '500',
      sort: 'newest',
    })
  })

  it('toma el primer valor si Next entrega un arreglo', () => {
    const result = parseLocalFiltersFromSearchParams({ cond: ['NM', 'LP'] })
    expect(result.conditions).toEqual(['NM'])
  })

  it('faltando todos los params devuelve los defaults', () => {
    expect(parseLocalFiltersFromSearchParams({})).toEqual(EMPTY_LOCAL_FILTERS)
  })
})

describe('applyLocalFiltersToSearchParams / serializeLocalFilters', () => {
  it('round-trip: parse(serialize(f)) === f para un set de filtros activos', () => {
    const filters: LocalFilters = {
      conditions: ['LP', 'NM'],
      languages: ['en', 'es'],
      foilOnly: true,
      minPesos: '100',
      maxPesos: '500',
      sort: 'price_asc',
    }
    const qs = serializeLocalFilters(filters)
    const roundTripped = parseLocalFilters(new URLSearchParams(qs))
    expect(roundTripped).toEqual(filters)
  })

  it('round-trip con defaults produce un querystring vacío', () => {
    expect(serializeLocalFilters(EMPTY_LOCAL_FILTERS)).toBe('')
  })

  it('sort=relevance (default) no se escribe en la URL', () => {
    const qs = serializeLocalFilters({ ...EMPTY_LOCAL_FILTERS, sort: 'relevance' })
    expect(qs).not.toContain('sort')
  })

  it('limpia claves obsoletas sin tocar otros params ya presentes', () => {
    const params = new URLSearchParams('q=bolt&cond=NM&game=mtg')
    applyLocalFiltersToSearchParams(params, EMPTY_LOCAL_FILTERS)
    expect(params.get('q')).toBe('bolt')
    expect(params.get('game')).toBe('mtg')
    expect(params.has('cond')).toBe(false)
  })

  it('escribe valores nuevos preservando otros params', () => {
    const params = new URLSearchParams('q=bolt')
    applyLocalFiltersToSearchParams(params, {
      ...EMPTY_LOCAL_FILTERS,
      conditions: ['NM'],
      foilOnly: true,
    })
    expect(params.get('q')).toBe('bolt')
    expect(params.get('cond')).toBe('NM')
    expect(params.get('foil')).toBe('1')
  })
})

describe('countActiveLocalFilters', () => {
  it('cuenta 0 sin filtros activos', () => {
    expect(countActiveLocalFilters(EMPTY_LOCAL_FILTERS)).toBe(0)
  })

  it('cuenta condiciones, idiomas, foil y precio (min u max cuentan como 1)', () => {
    expect(
      countActiveLocalFilters({
        conditions: ['NM', 'LP'],
        languages: ['es'],
        foilOnly: true,
        minPesos: '100',
        maxPesos: '',
        sort: 'relevance',
      }),
    ).toBe(5)
  })

  it('sort nunca cuenta como filtro activo', () => {
    expect(countActiveLocalFilters({ ...EMPTY_LOCAL_FILTERS, sort: 'newest' })).toBe(0)
  })
})
