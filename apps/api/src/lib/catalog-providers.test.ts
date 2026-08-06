import type { Tcg } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import { catalogProviderFor, supportedTcgs } from './catalog-providers'

describe('catalogProviderFor', () => {
  it('routes MTG and Riftbound to different catalogs', () => {
    const mtg = catalogProviderFor('mtg')
    const riftbound = catalogProviderFor('riftbound')

    expect(mtg).toBeDefined()
    expect(riftbound).toBeDefined()
    expect(mtg).not.toBe(riftbound)
  })

  it('exposes both lookup and search on every provider', () => {
    for (const tcg of supportedTcgs()) {
      const provider = catalogProviderFor(tcg)
      expect(typeof provider?.getCardById).toBe('function')
      expect(typeof provider?.searchCards).toBe('function')
    }
  })

  it('returns nothing for a game whose catalog is not integrated yet', () => {
    for (const tcg of ['pokemon', 'yugioh', 'onepiece', 'lorcana'] as Tcg[]) {
      expect(catalogProviderFor(tcg)).toBeUndefined()
    }
  })

  it('lists exactly the games that can be searched and published', () => {
    expect(supportedTcgs().sort()).toEqual(['mtg', 'riftbound'])
  })
})
