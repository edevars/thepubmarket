import { defineConfig } from 'vitest/config'

/**
 * Minimal vitest config for apps/api: covers the "pure" lib/ modules that run
 * on standard Web APIs (SubtleCrypto, crypto.getRandomValues) and need no
 * Workers runtime. KV-backed modules are tested against the in-memory fake in
 * `src/test/fake-kv.ts`. Route handlers and bindings stay out of scope here —
 * those are exercised by the manual/E2E pass documented in docs/ingenieria/.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
