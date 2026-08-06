import type { InventoryPhotoRow } from '@thepubmarket/db'
import { describe, expect, it, vi } from 'vitest'
import {
  buildPhotoKey,
  contentTypeFor,
  detectImageKind,
  loadPhotosByInventoryId,
  MAX_PHOTO_BYTES,
  rowToInventoryPhoto,
} from './photos'

// `inArray` is stubbed so the fake db can read back exactly which ids each
// statement bound — that count is the thing under test.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  inArray: (_column: unknown, ids: string[]) => ({ ids }),
}))

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

describe('detectImageKind', () => {
  it('detects a valid JPEG header', () => {
    // FF D8 FF is the SOI + first marker; real files carry more after it.
    expect(detectImageKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe('jpeg')
  })

  it('detects a valid PNG header', () => {
    expect(
      detectImageKind(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d),
      ),
    ).toBe('png')
  })

  it('detects a valid WebP header', () => {
    // RIFF + 4-byte chunk size (arbitrary here) + WEBP fourcc.
    expect(
      detectImageKind(
        bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe('webp')
  })

  it('rejects a truncated file that cuts the signature short', () => {
    // Only the first two bytes of a JPEG signature — never a valid image.
    expect(detectImageKind(bytes(0xff, 0xd8))).toBeNull()
  })

  it('rejects an empty body', () => {
    expect(detectImageKind(bytes())).toBeNull()
  })

  it('rejects a renamed non-image (plain text bytes)', () => {
    const text = new TextEncoder().encode('this is definitely not an image, just renamed')
    expect(detectImageKind(text)).toBeNull()
  })

  it('rejects a RIFF container that is not WebP', () => {
    // Valid RIFF header but a different fourcc (e.g. a WAV file).
    expect(
      detectImageKind(
        bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45),
      ),
    ).toBeNull()
  })
})

describe('contentTypeFor', () => {
  it('maps each kind to its MIME type', () => {
    expect(contentTypeFor('jpeg')).toBe('image/jpeg')
    expect(contentTypeFor('png')).toBe('image/png')
    expect(contentTypeFor('webp')).toBe('image/webp')
  })
})

describe('buildPhotoKey', () => {
  it('builds a server-generated key under the inventory-photos/ prefix', () => {
    const key = buildPhotoKey({
      sellerId: 'seller-1',
      inventoryId: 'inv-1',
      photoId: 'photo-1',
      kind: 'jpeg',
    })
    expect(key).toBe('inventory-photos/seller-1/inv-1/photo-1.jpg')
  })

  it('picks the extension matching the detected kind', () => {
    const base = { sellerId: 's', inventoryId: 'i', photoId: 'p' } as const
    expect(buildPhotoKey({ ...base, kind: 'png' })).toBe('inventory-photos/s/i/p.png')
    expect(buildPhotoKey({ ...base, kind: 'webp' })).toBe('inventory-photos/s/i/p.webp')
  })
})

describe('rowToInventoryPhoto', () => {
  it('maps id, absolute url and sortOrder from the row', () => {
    const row = {
      id: 'photo-1',
      inventoryId: 'inv-1',
      sellerId: 'seller-1',
      r2Key: 'inventory-photos/seller-1/inv-1/photo-1.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      sortOrder: 2,
      createdAt: 0,
      updatedAt: 0,
    } satisfies InventoryPhotoRow

    expect(rowToInventoryPhoto(row, 'https://api.thepubmarket.com')).toEqual({
      id: 'photo-1',
      url: 'https://api.thepubmarket.com/photos/photo-1',
      sortOrder: 2,
    })
  })
})

describe('MAX_PHOTO_BYTES', () => {
  it('is 5 MiB', () => {
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024)
  })
})

/**
 * Fake query builder that records how many ids each statement binds. D1 caps a
 * statement at 100 bound parameters, so the loader must never hand it a bigger
 * `IN (...)` — a 101-item catalog page used to 500 on this (TASK-047).
 */
function fakeDb(rowsById: Record<string, InventoryPhotoRow[]>, boundCounts: number[]) {
  return {
    select: () => ({
      from: () => ({
        where: (condition: { ids: string[] }) => ({
          orderBy: () => ({
            all: async () => {
              boundCounts.push(condition.ids.length)
              return condition.ids.flatMap((id) => rowsById[id] ?? [])
            },
          }),
        }),
      }),
    }),
  }
}

describe('loadPhotosByInventoryId', () => {
  const photo = (inventoryId: string, sortOrder: number): InventoryPhotoRow => ({
    id: `photo-${inventoryId}-${sortOrder}`,
    inventoryId,
    sellerId: 'seller-1',
    r2Key: `inventory-photos/seller-1/${inventoryId}/p${sortOrder}.jpg`,
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    sortOrder,
    createdAt: 0,
    updatedAt: 0,
  })

  it('skips the query entirely for an empty input', async () => {
    const boundCounts: number[] = []
    const result = await loadPhotosByInventoryId(
      fakeDb({}, boundCounts) as never,
      [],
      'https://api.test',
    )
    expect(result.size).toBe(0)
    expect(boundCounts).toEqual([])
  })

  it('splits ids so no statement exceeds D1 bound-parameter limit', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `inv-${i}`)
    const boundCounts: number[] = []
    const rowsById = Object.fromEntries(ids.map((id) => [id, [photo(id, 0)]]))

    const result = await loadPhotosByInventoryId(
      fakeDb(rowsById, boundCounts) as never,
      ids,
      'https://api.test',
    )

    expect(Math.max(...boundCounts)).toBeLessThanOrEqual(100)
    expect(boundCounts.reduce((a, b) => a + b, 0)).toBe(250)
    // Every listing still comes back, chunk boundaries included.
    expect(result.size).toBe(250)
    expect(result.get('inv-0')).toHaveLength(1)
    expect(result.get('inv-249')).toHaveLength(1)
  })

  it('groups multiple photos under their listing', async () => {
    const boundCounts: number[] = []
    const rowsById = { 'inv-1': [photo('inv-1', 0), photo('inv-1', 1)], 'inv-2': [] }

    const result = await loadPhotosByInventoryId(
      fakeDb(rowsById, boundCounts) as never,
      ['inv-1', 'inv-2'],
      'https://api.test',
    )

    expect(result.get('inv-1')?.map((p) => p.sortOrder)).toEqual([0, 1])
    expect(result.get('inv-2')).toBeUndefined()
  })
})
