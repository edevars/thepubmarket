import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Config mínima de vitest para apps/web: solo cubre módulos "puros"
 * (helpers de lib/, middleware) que no dependen de la máquina de componentes
 * de Next.js. `jose` corre sobre Web Crypto, disponible en Node normal.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
