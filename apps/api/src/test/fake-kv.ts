/**
 * In-memory stand-in for a KV namespace, enough for the session and
 * rate-limit modules: get/put/delete/list with prefix + cursor paging and
 * `expirationTtl` honored.
 *
 * Time comes from `Date.now()`, so a suite that needs TTLs to elapse controls
 * it with vitest's fake timers rather than a bespoke clock here.
 *
 * Deliberately *not* eventually consistent — the real KV is, and the code
 * under test is written to tolerate that (see `deleteAllUserSessions`). These
 * tests assert the logic, not the propagation behavior.
 */

interface Entry {
  value: string
  expiresAt: number | null
}

export interface FakeKV extends KVNamespace {
  /** Live key count (expired entries excluded), for assertions. */
  size(): number
}

export function createFakeKV(pageSize = 1000): FakeKV {
  const store = new Map<string, Entry>()

  const alive = (key: string): Entry | undefined => {
    const entry = store.get(key)
    if (!entry) return undefined
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key)
      return undefined
    }
    return entry
  }

  const kv = {
    // El segundo argumento del KV real ('json' | 'text' | …) se honra: el
    // código que cachea objetos usa `get(key, 'json')` y sin esto recibiría el
    // string crudo, que pasa los tests por accidente o los rompe sin razón.
    async get(key: string, type?: string) {
      const raw = alive(key)?.value ?? null
      if (raw === null) return null
      if (type !== 'json') return raw
      try {
        return JSON.parse(raw)
      } catch {
        // El KV real devuelve null ante un JSON inválido en vez de lanzar.
        return null
      }
    },

    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expiresAt: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null,
      })
    },

    async delete(key: string) {
      store.delete(key)
    },

    async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
      const prefix = options?.prefix ?? ''
      const matching = [...store.keys()].filter((k) => k.startsWith(prefix) && alive(k)).sort()
      // Cursor is the last key returned, not an offset — same as the real KV,
      // where paging survives keys being deleted between pages.
      const after = options?.cursor
      const remaining = after ? matching.filter((k) => k > after) : matching
      const page = remaining.slice(0, options?.limit ?? pageSize)
      const complete = page.length === remaining.length
      return {
        keys: page.map((name) => ({ name })),
        list_complete: complete,
        ...(complete ? {} : { cursor: page[page.length - 1] }),
      }
    },

    size() {
      for (const key of [...store.keys()]) alive(key)
      return store.size
    },
  }

  return kv as unknown as FakeKV
}
