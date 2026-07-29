import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyTurnstile } from './turnstile'

const SECRET = 'test-secret'
const TOKEN = 'widget-token'

/** Stubs global fetch with a canned siteverify response. */
function stubSiteverify(body: unknown, init: ResponseInit = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('verifyTurnstile', () => {
  it('accepts a token siteverify approves', async () => {
    stubSiteverify({ success: true })
    expect(await verifyTurnstile(SECRET, TOKEN)).toEqual({ ok: true })
  })

  it('sends secret, response and remoteip form-encoded', async () => {
    const fetchMock = stubSiteverify({ success: true })
    await verifyTurnstile(SECRET, TOKEN, '203.0.113.9')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/turnstile/v0/siteverify')
    const sent = new URLSearchParams(String(init.body))
    expect(sent.get('secret')).toBe(SECRET)
    expect(sent.get('response')).toBe(TOKEN)
    expect(sent.get('remoteip')).toBe('203.0.113.9')
  })

  it("omits remoteip when the IP is the 'unknown' fallback", async () => {
    const fetchMock = stubSiteverify({ success: true })
    await verifyTurnstile(SECRET, TOKEN, 'unknown')

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URLSearchParams(String(init.body)).has('remoteip')).toBe(false)
  })

  it('rejects a missing token without calling siteverify', async () => {
    const fetchMock = stubSiteverify({ success: true })
    expect(await verifyTurnstile(SECRET, undefined)).toEqual({
      ok: false,
      reason: 'missing-input-response',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the siteverify error codes on rejection', async () => {
    stubSiteverify({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    expect(await verifyTurnstile(SECRET, TOKEN)).toEqual({
      ok: false,
      reason: 'timeout-or-duplicate',
    })
  })

  it('fails closed when siteverify answers with an HTTP error', async () => {
    stubSiteverify({}, { status: 500 })
    expect(await verifyTurnstile(SECRET, TOKEN)).toEqual({
      ok: false,
      reason: 'siteverify-http-500',
    })
  })

  it('fails closed when siteverify is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await verifyTurnstile(SECRET, TOKEN)).toEqual({
      ok: false,
      reason: 'siteverify-unreachable',
    })
  })

  it('skips verification (loudly) when no secret is configured', async () => {
    const fetchMock = stubSiteverify({ success: false })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await verifyTurnstile(undefined, undefined)).toEqual({ ok: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })
})
