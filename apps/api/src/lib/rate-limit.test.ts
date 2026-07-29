import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeKV } from '../test/fake-kv'
import { checkRateLimit, clientIp, isRateLimited, recordAttempt } from './rate-limit'

const WINDOW = 600
const LIMIT = 3

describe('checkRateLimit', () => {
  it('allows up to the limit, then refuses', async () => {
    const kv = createFakeKV()
    for (let i = 0; i < LIMIT; i++) {
      expect(await checkRateLimit(kv, 'login:ip', '1.1.1.1', LIMIT, WINDOW)).toBe(true)
    }
    expect(await checkRateLimit(kv, 'login:ip', '1.1.1.1', LIMIT, WINDOW)).toBe(false)
  })

  it('keeps buckets and identities independent', async () => {
    const kv = createFakeKV()
    for (let i = 0; i < LIMIT + 1; i++) {
      await checkRateLimit(kv, 'login:ip', '1.1.1.1', LIMIT, WINDOW)
    }
    expect(await checkRateLimit(kv, 'login:ip', '2.2.2.2', LIMIT, WINDOW)).toBe(true)
    expect(await checkRateLimit(kv, 'forgot:ip', '1.1.1.1', LIMIT, WINDOW)).toBe(true)
  })

  it('treats a corrupted counter as a fresh window instead of throwing', async () => {
    const kv = createFakeKV()
    await kv.put('rl:login:ip:1.1.1.1', 'not json')
    expect(await checkRateLimit(kv, 'login:ip', '1.1.1.1', LIMIT, WINDOW)).toBe(true)
  })
})

describe('window rollover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resets the counter once the window elapses', async () => {
    const kv = createFakeKV()
    for (let i = 0; i < LIMIT + 1; i++) {
      await checkRateLimit(kv, 'login:ip', '1.1.1.1', LIMIT, WINDOW)
    }
    expect(await checkRateLimit(kv, 'login:ip', '1.1.1.1', LIMIT, WINDOW)).toBe(false)

    vi.advanceTimersByTime(WINDOW * 1000)

    expect(await checkRateLimit(kv, 'login:ip', '1.1.1.1', LIMIT, WINDOW)).toBe(true)
  })
})

describe('isRateLimited + recordAttempt', () => {
  it('does not consume budget on a read', async () => {
    const kv = createFakeKV()
    for (let i = 0; i < 10; i++) {
      expect(await isRateLimited(kv, 'login:email', 'a@b.mx', LIMIT, WINDOW)).toBe(false)
    }
  })

  it('trips only after `limit` recorded failures', async () => {
    const kv = createFakeKV()
    for (let i = 0; i < LIMIT; i++) {
      expect(await isRateLimited(kv, 'login:email', 'a@b.mx', LIMIT, WINDOW)).toBe(false)
      await recordAttempt(kv, 'login:email', 'a@b.mx', WINDOW)
    }
    expect(await isRateLimited(kv, 'login:email', 'a@b.mx', LIMIT, WINDOW)).toBe(true)
  })

  it('never locks out an account whose logins all succeed', async () => {
    const kv = createFakeKV()
    // A successful login only reads the bucket — the whole point of the split.
    for (let i = 0; i < 50; i++) {
      expect(await isRateLimited(kv, 'login:email', 'a@b.mx', LIMIT, WINDOW)).toBe(false)
    }
  })
})

describe('clientIp', () => {
  it('uses cf-connecting-ip, falling back to a shared bucket', () => {
    expect(clientIp('203.0.113.9')).toBe('203.0.113.9')
    expect(clientIp(undefined)).toBe('unknown')
    expect(clientIp(null)).toBe('unknown')
  })
})
