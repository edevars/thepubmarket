/**
 * Cobertura del dataset mock (`NEXT_PUBLIC_USE_MOCKS=true`): garantiza que el
 * modo mock sirve Riftbound como juego de primera clase, con los atributos que
 * los filtros propios del juego (TASK-039/040) necesitan para funcionar.
 */
import { describe, expect, it } from 'vitest'
import { applyFilters } from './data'
import { MOCK_LISTINGS } from './mock-data'

const active = MOCK_LISTINGS.filter((i) => i.status === 'active')
const riftbound = active.filter((i) => i.tcg === 'riftbound')

describe('mock catalog dataset', () => {
  it('serves active Riftbound listings', () => {
    expect(riftbound.length).toBeGreaterThan(0)
  })

  it('carries Riftbound game attributes on every Riftbound listing', () => {
    for (const item of riftbound) {
      const attrs = item.card.gameAttributes
      expect(attrs?.tcg).toBe('riftbound')
      expect(attrs?.tcg === 'riftbound' && attrs.type).toBeTruthy()
    }
  })

  it('leaves gameAttributes null and oracleId set only for MTG', () => {
    for (const item of active.filter((i) => i.tcg === 'mtg')) {
      expect(item.card.gameAttributes).toBeNull()
      expect(item.card.oracleId).not.toBeNull()
    }
    for (const item of riftbound) {
      expect(item.card.oracleId).toBeNull()
    }
  })

  it('is filterable by tcg and by Riftbound-specific facets', () => {
    expect(applyFilters(active, { tcg: 'riftbound' })).toHaveLength(riftbound.length)

    const domains = new Set(
      riftbound.flatMap((i) =>
        i.card.gameAttributes?.tcg === 'riftbound' ? i.card.gameAttributes.domains : [],
      ),
    )
    expect(domains.size).toBeGreaterThan(1)

    const [domain] = [...domains]
    const filtered = applyFilters(active, {
      tcg: 'riftbound',
      game: { domain: [domain as string] },
    })
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.length).toBeLessThan(riftbound.length)
  })
})
