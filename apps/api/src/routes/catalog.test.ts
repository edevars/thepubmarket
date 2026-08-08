import { describe, expect, it } from 'vitest'
import { parseCatalogIdParam, parseTcgParam } from './catalog'

describe('parseTcgParam', () => {
  it('accepts every supported game', () => {
    for (const tcg of ['mtg', 'riftbound', 'pokemon', 'yugioh', 'onepiece', 'lorcana']) {
      expect(parseTcgParam(tcg)).toEqual({ tcg, invalid: false })
    }
  })

  it('treats an absent or blank param as no filter', () => {
    expect(parseTcgParam(undefined)).toEqual({ invalid: false })
    expect(parseTcgParam('')).toEqual({ invalid: false })
    expect(parseTcgParam('   ')).toEqual({ invalid: false })
  })

  it('trims surrounding whitespace before matching', () => {
    expect(parseTcgParam('  riftbound ')).toEqual({ tcg: 'riftbound', invalid: false })
  })

  it('rejects an unknown game instead of silently returning everything', () => {
    // Un juego inexistente devolvería el catálogo completo si no se marcara,
    // que es peor que un error: parece que el filtro funcionó.
    expect(parseTcgParam('digimon')).toEqual({ invalid: true })
  })

  it('is case sensitive: the codes are stable ids, not display names', () => {
    expect(parseTcgParam('MTG')).toEqual({ invalid: true })
  })
})

describe('parseCatalogIdParam', () => {
  it('accepts the printing ids of every supported catalog', () => {
    // Riftbound usa códigos legibles; MTG, el UUID de Scryfall.
    expect(parseCatalogIdParam('UNL-183')).toBe('UNL-183')
    expect(parseCatalogIdParam('11e12a84-e7be-4afc-a230-c2e644743fa8')).toBe(
      '11e12a84-e7be-4afc-a230-c2e644743fa8',
    )
  })

  it('trims surrounding whitespace before matching', () => {
    expect(parseCatalogIdParam('  UNL-183 ')).toBe('UNL-183')
  })

  it('treats an absent or blank param as no filter', () => {
    expect(parseCatalogIdParam(undefined)).toBeUndefined()
    expect(parseCatalogIdParam('')).toBeUndefined()
    expect(parseCatalogIdParam('   ')).toBeUndefined()
  })
})
