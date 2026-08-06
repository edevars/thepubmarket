import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCardImageKey,
  ensureCardImage,
  isValidCardImageFile,
  isValidCatalogId,
} from './card-images'

/** Bytes webp mínimos válidos: contenedor RIFF + fourcc WEBP. */
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])

/** R2 falso en memoria: head responde según `existing`, put solo registra. */
function fakeBucket(existing: string[] = []) {
  const bucket = {
    head: vi.fn(async (key: string) => (existing.includes(key) ? { key } : null)),
    put: vi.fn(async (key: string) => ({ key })),
  } as unknown as R2Bucket
  return { bucket }
}

function stubFetch(body: BodyInit | null, init: ResponseInit = {}) {
  const mock = vi.fn(async () => new Response(body, init))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('buildCardImageKey', () => {
  it('builds deterministic keys under the fixed prefix', () => {
    expect(buildCardImageKey('riftbound', 'UNL-131', 'front')).toBe(
      'card-images/riftbound/UNL-131.webp',
    )
    expect(buildCardImageKey('riftbound', 'UNL-131', 'back')).toBe(
      'card-images/riftbound/UNL-131-back.webp',
    )
  })
})

describe('isValidCatalogId', () => {
  it('accepts real dotgg-style ids', () => {
    expect(isValidCatalogId('UNL-131')).toBe(true)
    expect(isValidCatalogId('OGN-298a')).toBe(true)
  })

  it('rejects anything that could escape the key prefix', () => {
    expect(isValidCatalogId('')).toBe(false)
    expect(isValidCatalogId('../secrets')).toBe(false)
    expect(isValidCatalogId('a/b')).toBe(false)
    expect(isValidCatalogId('a.webp')).toBe(false)
    expect(isValidCatalogId('-leading-dash')).toBe(false)
    expect(isValidCatalogId('x'.repeat(80))).toBe(false)
  })
})

describe('isValidCardImageFile', () => {
  it('accepts the two filename shapes the importer writes', () => {
    expect(isValidCardImageFile('UNL-131.webp')).toBe(true)
    expect(isValidCardImageFile('UNL-131-back.webp')).toBe(true)
  })

  it('rejects traversal, other extensions and empty names', () => {
    expect(isValidCardImageFile('')).toBe(false)
    expect(isValidCardImageFile('UNL-131.png')).toBe(false)
    expect(isValidCardImageFile('../UNL-131.webp')).toBe(false)
    expect(isValidCardImageFile('a/b.webp')).toBe(false)
    expect(isValidCardImageFile('.webp')).toBe(false)
  })
})

describe('ensureCardImage', () => {
  const KEY = 'card-images/riftbound/UNL-131.webp'
  const SOURCE = 'https://static.dotgg.gg/riftbound/cards/UNL-131.webp'

  it('returns exists without fetching when the object is already in R2', async () => {
    const { bucket } = fakeBucket([KEY])
    const fetchMock = stubFetch(null)

    expect(await ensureCardImage(bucket, KEY, SOURCE)).toBe('exists')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches, validates and uploads a missing image', async () => {
    const { bucket } = fakeBucket()
    stubFetch(WEBP_BYTES)

    expect(await ensureCardImage(bucket, KEY, SOURCE)).toBe('uploaded')
    expect(bucket.put).toHaveBeenCalledWith(KEY, expect.any(ArrayBuffer), {
      httpMetadata: { contentType: 'image/webp' },
    })
  })

  it('refuses to fetch from a non-allowlisted host', async () => {
    const { bucket } = fakeBucket()
    const fetchMock = stubFetch(WEBP_BYTES)

    expect(await ensureCardImage(bucket, KEY, 'https://evil.example.com/x.webp')).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('fails on a non-OK source response without uploading', async () => {
    const { bucket } = fakeBucket()
    stubFetch('not found', { status: 404 })

    expect(await ensureCardImage(bucket, KEY, SOURCE)).toBe('failed')
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('fails when the body is not a webp (magic bytes)', async () => {
    const { bucket } = fakeBucket()
    // Una página de error del CDN con 200: los magic bytes la delatan.
    stubFetch('<html>error</html>')

    expect(await ensureCardImage(bucket, KEY, SOURCE)).toBe('failed')
    expect(bucket.put).not.toHaveBeenCalled()
  })

  it('turns a network error into failed instead of throwing', async () => {
    const { bucket } = fakeBucket()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    expect(await ensureCardImage(bucket, KEY, SOURCE)).toBe('failed')
  })
})
