import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeKV } from '../test/fake-kv'
import type { SessionUser } from '../types'
import {
  bearerToken,
  consumeResetToken,
  createResetToken,
  createSession,
  deleteAllUserSessions,
  deleteSession,
  getSession,
} from './auth'

const USER: SessionUser = {
  id: 'user_1',
  email: 'buyer@example.com',
  role: 'buyer',
  displayName: 'Buyer One',
}
const OTHER: SessionUser = { ...USER, id: 'user_2', email: 'other@example.com' }

const DAY = 24 * 60 * 60 * 1000

describe('sessions', () => {
  it('round-trips a session and issues a distinct token each time', async () => {
    const kv = createFakeKV()
    const a = await createSession(kv, USER)
    const b = await createSession(kv, USER)

    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await getSession(kv, a)).toEqual(USER)
    expect(await getSession(kv, b)).toEqual(USER)
  })

  it('returns null for an unknown or corrupted token', async () => {
    const kv = createFakeKV()
    expect(await getSession(kv, 'nope')).toBeNull()
    await kv.put('sess:broken', '{not json')
    expect(await getSession(kv, 'broken')).toBeNull()
  })

  it('logout invalidates the session and leaves no reverse-index entry behind', async () => {
    const kv = createFakeKV()
    const token = await createSession(kv, USER)
    expect(kv.size()).toBe(2) // session + reverse index

    await deleteSession(kv, token)

    expect(await getSession(kv, token)).toBeNull()
    expect(kv.size()).toBe(0)
  })

  it('logout with an already-invalid token is a no-op', async () => {
    const kv = createFakeKV()
    await expect(deleteSession(kv, 'nope')).resolves.toBeUndefined()
  })
})

describe('deleteAllUserSessions', () => {
  it('revokes every session of one user and touches nobody else', async () => {
    const kv = createFakeKV()
    const mine = [await createSession(kv, USER), await createSession(kv, USER)]
    const theirs = await createSession(kv, OTHER)

    expect(await deleteAllUserSessions(kv, USER.id)).toBe(2)

    for (const token of mine) expect(await getSession(kv, token)).toBeNull()
    expect(await getSession(kv, theirs)).toEqual(OTHER)
    expect(kv.size()).toBe(2) // only OTHER's session + its index survive
  })

  it('pages through the reverse index past a single list() page', async () => {
    const kv = createFakeKV(2) // force cursor paging
    for (let i = 0; i < 5; i++) await createSession(kv, USER)

    expect(await deleteAllUserSessions(kv, USER.id)).toBe(5)
    expect(kv.size()).toBe(0)
  })

  it('returns 0 for a user with no sessions', async () => {
    const kv = createFakeKV()
    expect(await deleteAllUserSessions(kv, 'ghost')).toBe(0)
  })
})

describe('session expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is absolute, not sliding: reads do not extend the 7-day TTL', async () => {
    const kv = createFakeKV()
    const token = await createSession(kv, USER)

    vi.advanceTimersByTime(6 * DAY)
    expect(await getSession(kv, token)).toEqual(USER) // still alive, and just read

    vi.advanceTimersByTime(2 * DAY) // day 8 — past the TTL despite the read
    expect(await getSession(kv, token)).toBeNull()
  })
})

describe('password-reset tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is single-use: the second consume returns null', async () => {
    const kv = createFakeKV()
    const token = await createResetToken(kv, USER.email)

    expect(await consumeResetToken(kv, token)).toBe(USER.email)
    expect(await consumeResetToken(kv, token)).toBeNull()
  })

  it('expires 15 minutes after issue', async () => {
    const kv = createFakeKV()
    const token = await createResetToken(kv, USER.email)

    vi.advanceTimersByTime(14 * 60 * 1000)
    expect(await kv.get(`pwr:${token}`)).not.toBeNull()

    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(await consumeResetToken(kv, token)).toBeNull()
  })

  it('returns null for an unknown token', async () => {
    const kv = createFakeKV()
    expect(await consumeResetToken(kv, 'nope')).toBeNull()
  })
})

describe('bearerToken', () => {
  it('extracts the token, case-insensitively on the scheme', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123')
    expect(bearerToken('bearer abc123')).toBe('abc123')
  })

  it('returns null when the header is missing or not a bearer', () => {
    expect(bearerToken(undefined)).toBeNull()
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken('')).toBeNull()
    expect(bearerToken('Basic abc123')).toBeNull()
    expect(bearerToken('Bearer')).toBeNull()
  })
})
