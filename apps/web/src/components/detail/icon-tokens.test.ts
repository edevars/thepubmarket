import { describe, expect, it } from 'vitest'
import { parseIconTokens } from './icon-tokens'

describe('parseIconTokens', () => {
  it('returns a single text segment for text without tokens', () => {
    expect(parseIconTokens('When Jinx enters combat, deal 2 damage.')).toEqual([
      { kind: 'text', value: 'When Jinx enters combat, deal 2 damage.' },
    ])
  })

  it('returns nothing for missing text (null, undefined, empty)', () => {
    expect(parseIconTokens(null)).toEqual([])
    expect(parseIconTokens(undefined)).toEqual([])
    expect(parseIconTokens('')).toEqual([])
  })

  it('resolves a known token to its readable label', () => {
    expect(parseIconTokens('Pay :rb_energy: to play this.')).toEqual([
      { kind: 'text', value: 'Pay ' },
      { kind: 'token', token: 'energy', label: 'Energy' },
      { kind: 'text', value: ' to play this.' },
    ])
  })

  it('resolves every domain token to its canonical name', () => {
    const domains = ['fury', 'calm', 'chaos', 'order', 'mind', 'body', 'colorless']
    for (const domain of domains) {
      expect(parseIconTokens(`:rb_${domain}:`)).toEqual([
        {
          kind: 'token',
          token: domain,
          label: `${domain.charAt(0).toUpperCase()}${domain.slice(1)}`,
        },
      ])
    }
  })

  it('humanizes an unknown token instead of leaking the raw token string', () => {
    expect(parseIconTokens('Gains :rb_deflect: this turn.')).toEqual([
      { kind: 'text', value: 'Gains ' },
      { kind: 'token', token: 'deflect', label: 'Deflect' },
      { kind: 'text', value: ' this turn.' },
    ])
  })

  it('humanizes a multi-word unknown token by splitting on underscores', () => {
    expect(parseIconTokens(':rb_double_strike:')).toEqual([
      { kind: 'token', token: 'double_strike', label: 'Double Strike' },
    ])
  })

  it('handles back-to-back tokens with no text between them', () => {
    expect(parseIconTokens(':rb_might::rb_power:')).toEqual([
      { kind: 'token', token: 'might', label: 'Might' },
      { kind: 'token', token: 'power', label: 'Power' },
    ])
  })

  it('never leaves a raw ":rb_x:" substring in a text segment', () => {
    const segments = parseIconTokens('Deal :rb_energy: damage, then :rb_unknown_effect: it.')
    for (const segment of segments) {
      if (segment.kind === 'text') expect(segment.value).not.toMatch(/:rb_[a-z0-9_]+:/i)
    }
  })
})
