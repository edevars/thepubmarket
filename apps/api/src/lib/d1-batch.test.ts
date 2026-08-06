import { describe, expect, it } from 'vitest'
import { chunkIds, MAX_BOUND_IDS, selectByIds } from './d1-batch'

describe('MAX_BOUND_IDS', () => {
  it('stays under D1 hard cap of 100 bound parameters', () => {
    expect(MAX_BOUND_IDS).toBeLessThan(100)
  })
})

describe('chunkIds', () => {
  it('returns no chunks for an empty list', () => {
    expect(chunkIds([])).toEqual([])
  })

  it('keeps a list that fits in a single chunk', () => {
    expect(chunkIds(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']])
  })

  it('splits on the boundary without dropping or duplicating ids', () => {
    const ids = Array.from({ length: MAX_BOUND_IDS * 2 + 1 }, (_, i) => i)
    const chunks = chunkIds(ids)

    expect(chunks).toHaveLength(3)
    expect(chunks.every((c) => c.length <= MAX_BOUND_IDS)).toBe(true)
    expect(chunks.flat()).toEqual(ids)
  })
})

describe('selectByIds', () => {
  it('never touches the db for an empty list', async () => {
    let calls = 0
    const rows = await selectByIds([], async (chunk) => {
      calls++
      return chunk
    })

    expect(rows).toEqual([])
    expect(calls).toBe(0)
  })

  it('runs a single query when the ids fit under the cap', async () => {
    const sizes: number[] = []
    const ids = Array.from({ length: MAX_BOUND_IDS }, (_, i) => `id-${i}`)

    await selectByIds(ids, async (chunk) => {
      sizes.push(chunk.length)
      return chunk
    })

    expect(sizes).toEqual([MAX_BOUND_IDS])
  })

  it('splits past the cap and concatenates every row', async () => {
    const sizes: number[] = []
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)

    const rows = await selectByIds(ids, async (chunk) => {
      sizes.push(chunk.length)
      return chunk.map((id) => ({ id }))
    })

    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_BOUND_IDS)
    expect(rows.map((r) => r.id)).toEqual(ids)
  })
})
