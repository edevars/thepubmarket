#!/usr/bin/env node
/**
 * Carga de inventario real (Fase 1, admin interno) contra la API local.
 *
 * Por cada entrada de scripts/inventory-seed.json:
 *   1. resuelve la impresión exacta en Scryfall vía GET /admin/scryfall/search
 *      (nombre exacto + set), eligiendo la impresión cuyo setCode coincide;
 *   2. publica el single vía POST /admin/inventory (header x-admin-key).
 *
 * Respeta el rate limit de Scryfall espaciando las peticiones (~150ms). El path
 * de lectura ya se cubre con el cache KV del Worker.
 *
 * NO es idempotente: cada corrida INSERTA filas nuevas. Para reiniciar, recrea
 * el D1 local (db:migrate:local sobre una BD limpia).
 *
 * Uso:
 *   node scripts/load-inventory.mjs [ruta-seed.json]
 * Variables:
 *   API_URL    (default http://localhost:8787)
 *   ADMIN_KEY  (default dev-admin-key-change-me — debe coincidir con ADMIN_API_KEY del Worker)
 */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const API_URL = process.env.API_URL ?? 'http://localhost:8787'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'dev-admin-key-change-me'
const THROTTLE_MS = 150

const here = dirname(fileURLToPath(import.meta.url))
const seedPath = resolve(here, process.argv[2] ?? 'inventory-seed.json')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function searchPrinting(name, set) {
  const q = set ? `!"${name}" set:${set}` : `!"${name}"`
  const res = await fetch(`${API_URL}/admin/scryfall/search?q=${encodeURIComponent(q)}`, {
    headers: { 'x-admin-key': ADMIN_KEY },
  })
  if (!res.ok) {
    throw new Error(`search HTTP ${res.status}: ${await res.text()}`)
  }
  const { results } = await res.json()
  if (!Array.isArray(results) || results.length === 0) return null
  if (!set) return results[0]
  return results.find((r) => (r.setCode ?? '').toLowerCase() === set.toLowerCase()) ?? results[0]
}

async function createListing(scryfallId, entry) {
  const res = await fetch(`${API_URL}/admin/inventory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({
      scryfallId,
      condition: entry.condition,
      finish: entry.finish,
      language: entry.language,
      priceCents: entry.priceCents,
      quantity: entry.quantity,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`create HTTP ${res.status}: ${JSON.stringify(body)}`)
  return body
}

async function main() {
  const entries = JSON.parse(await readFile(seedPath, 'utf8'))
  console.log(`Cargando ${entries.length} singles → ${API_URL} (seed: ${seedPath})\n`)

  let created = 0
  let skipped = 0
  let failed = 0

  for (const entry of entries) {
    const label = `${entry.name} [${entry.set ?? '—'}] ${entry.condition}/${entry.finish}/${entry.language}`
    try {
      const printing = await searchPrinting(entry.name, entry.set)
      if (!printing) {
        console.warn(`⤬ sin impresión: ${label}`)
        skipped++
        continue
      }
      const item = await createListing(printing.scryfallId, entry)
      console.log(`✓ ${label} → ${item.id}`)
      created++
    } catch (err) {
      console.error(`✗ ${label}: ${err.message}`)
      failed++
    }
    await sleep(THROTTLE_MS)
  }

  console.log(`\nResumen: ${created} creados, ${skipped} omitidos, ${failed} fallidos.`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(`\nError fatal: ${err.message}`)
  console.error('¿Está corriendo la API en', API_URL, '? (pnpm --filter @thepubmarket/api dev)')
  process.exit(1)
})
