import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { accentFor, FACET_PRESENTATION, GAME_ACCENT, presentationFor } from './facet-presentation'
import { facetsFor } from './game-filters'

const HEX_RE = /^#[0-9a-f]{6}$/i

// TASK-052: multiValue facets sin identidad visual propia por diseño — el
// valor existe en GAME_FACETS pero no hay pip/tile especial para él y la UI
// cae a texto plano. Ajustado a la forma real de GAME_FACETS.riftbound/.mtg
// (game-filters.ts): mtg no tiene `supertype` (n/a, ni se evalúa); riftbound
// sí lo tiene mult-valor pero sin icono. `type` es multiValue en ambos
// juegos y tampoco tiene presentación (no hay symbols de tipo de carta).
const INTENTIONAL_GAPS: Record<string, Record<string, string[]>> = {
  mtg: {
    type: [
      'Artifact',
      'Battle',
      'Creature',
      'Enchantment',
      'Instant',
      'Land',
      'Planeswalker',
      'Sorcery',
    ],
  },
  riftbound: {
    type: ['Battlefield', 'Gear', 'Legend', 'Rune', 'Spell', 'Unit'],
    supertype: ['Basic', 'Champion', 'Signature', 'Token'],
    // rarity 'showcase' es el gap documentado dentro de una faceta que SÍ
    // tiene presentación para el resto de sus valores.
    rarity: ['showcase'],
  },
}

describe('facet-presentation module shape', () => {
  it('has no React import (plain lib module, fully unit-testable)', () => {
    const path = fileURLToPath(new URL('./facet-presentation.ts', import.meta.url))
    const source = readFileSync(path, 'utf-8')
    expect(source).not.toMatch(/from ['"]react['"]/)
    expect(source).not.toMatch(/^import React/m)
  })
})

describe('coverage: every multiValue facet value has an entry or a documented gap', () => {
  for (const tcg of ['mtg', 'riftbound'] as const) {
    it(`covers all multiValue facet values for ${tcg}`, () => {
      const multiValueFacets = facetsFor(tcg).filter((f) => f.kind === 'multiValue')
      expect(multiValueFacets.length).toBeGreaterThan(0)

      for (const facet of multiValueFacets) {
        const presentation = FACET_PRESENTATION[tcg]?.[facet.param]
        const gaps = INTENTIONAL_GAPS[tcg]?.[facet.param] ?? []

        for (const value of facet.values ?? []) {
          const hasEntry = presentation?.values[value] !== undefined
          const isDocumentedGap = gaps.includes(value)
          expect(
            hasEntry || isDocumentedGap,
            `${tcg}.${facet.param}=${value} has neither a presentation entry nor a documented gap`,
          ).toBe(true)
        }
      }
    })
  }
})

describe('hex validation', () => {
  it('every hex in FACET_PRESENTATION is a valid 6-digit color', () => {
    for (const [tcg, facets] of Object.entries(FACET_PRESENTATION)) {
      for (const [param, facet] of Object.entries(facets ?? {})) {
        for (const [value, presentation] of Object.entries(facet.values)) {
          if (presentation.hex !== undefined) {
            expect(presentation.hex, `${tcg}.${param}.${value}`).toMatch(HEX_RE)
          }
        }
      }
    }
  })

  it('every hex in GAME_ACCENT is a valid 6-digit color', () => {
    for (const [tcg, hex] of Object.entries(GAME_ACCENT)) {
      expect(hex, tcg).toMatch(HEX_RE)
    }
  })
})

describe('accentFor', () => {
  it('returns the registered accent for mtg/riftbound', () => {
    expect(accentFor('mtg')).toBe('#d9a92f')
    expect(accentFor('riftbound')).toBe('#e0653a')
  })

  it('returns undefined for games without a registered accent', () => {
    expect(accentFor('pokemon')).toBeUndefined()
    expect(accentFor('yugioh')).toBeUndefined()
    expect(accentFor('onepiece')).toBeUndefined()
    expect(accentFor('lorcana')).toBeUndefined()
  })

  it('never throws for garbage input', () => {
    expect(() => accentFor(undefined)).not.toThrow()
    expect(accentFor(undefined)).toBeUndefined()
    expect(accentFor('not-a-real-tcg')).toBeUndefined()
  })
})

describe('presentationFor', () => {
  it('resolves a known value', () => {
    expect(presentationFor('mtg', 'color', 'W')).toEqual({
      icon: '/symbols/mtg/W.svg',
      hex: '#e9e7d7',
    })
    expect(presentationFor('riftbound', 'domain', 'Fury')).toEqual({
      icon: '/symbols/riftbound/domain/fury.svg',
      hex: '#c13b3b',
    })
  })

  it('returns undefined for the documented showcase gap', () => {
    expect(presentationFor('riftbound', 'rarity', 'showcase')).toBeUndefined()
  })

  it('never throws for garbage input and degrades to undefined', () => {
    expect(() => presentationFor('not-a-real-tcg', 'color', 'W')).not.toThrow()
    expect(presentationFor('not-a-real-tcg', 'color', 'W')).toBeUndefined()
    expect(presentationFor('mtg', 'not-a-real-param', 'W')).toBeUndefined()
    expect(presentationFor('mtg', 'color', 'not-a-real-value')).toBeUndefined()
    expect(presentationFor(undefined, undefined, undefined)).toBeUndefined()
    expect(presentationFor('mtg', undefined, 'W')).toBeUndefined()
    expect(presentationFor('mtg', 'color', undefined)).toBeUndefined()
  })
})
