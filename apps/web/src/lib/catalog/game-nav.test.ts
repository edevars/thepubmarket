import type { CatalogGameCount } from '@thepubmarket/shared'
import { TCGS } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import { getGameNavItems } from './game-nav'

describe('getGameNavItems', () => {
  it('returns one entry per canonical TCG, in TCGS order', () => {
    const items = getGameNavItems([])
    expect(items.map((i) => i.tcg)).toEqual([...TCGS])
  })

  it('links to the per-game catalog view', () => {
    const items = getGameNavItems([])
    for (const item of items) {
      expect(item.href).toBe(`/catalog?game=${item.tcg}`)
    }
  })

  it('marks a game unavailable when it has no active inventory', () => {
    const items = getGameNavItems([])
    expect(items.every((i) => i.available === false)).toBe(true)
  })

  it('marks a game available when its count is above zero', () => {
    const counts: CatalogGameCount[] = [
      { tcg: 'mtg', count: 12 },
      { tcg: 'riftbound', count: 0 },
    ]
    const items = getGameNavItems(counts)
    expect(items.find((i) => i.tcg === 'mtg')?.available).toBe(true)
    expect(items.find((i) => i.tcg === 'riftbound')?.available).toBe(false)
    expect(items.find((i) => i.tcg === 'pokemon')?.available).toBe(false)
  })

  it('uses the proper-noun name from TCG_META, not a translated label', () => {
    const items = getGameNavItems([{ tcg: 'mtg', count: 1 }])
    expect(items.find((i) => i.tcg === 'mtg')?.label).toBe('Magic')
    expect(items.find((i) => i.tcg === 'onepiece')?.label).toBe('One Piece')
  })
})
