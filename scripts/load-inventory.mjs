#!/usr/bin/env node
/**
 * Carga de inventario real (Fase 1, admin interno) contra la API local.
 *
 * Por cada entrada de scripts/inventory-seed.json:
 *   1. resuelve la impresión en el catálogo de su juego vía
 *      GET /admin/catalog/search?game=, eligiendo la que coincide en setCode;
 *   2. publica el single vía POST /admin/inventory (header x-admin-key).
 *
 * Cada entrada puede traer `game` ('mtg' por default). La sintaxis de búsqueda
 * cambia por catálogo: Scryfall acepta operadores (`!"nombre" set:xxx`),
 * RiftCodex solo nombre difuso.
 *
 * Respeta el rate limit de los catálogos espaciando las peticiones (~150ms).
 * El path de lectura ya se cubre con el cache KV del Worker.
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

async function searchPrinting(game, name, set) {
  // Scryfall entiende operadores; RiftCodex busca por nombre difuso y nada más.
  const q = game === 'mtg' ? (set ? `!"${name}" set:${set}` : `!"${name}"`) : name
  const res = await fetch(
    `${API_URL}/admin/catalog/search?game=${game}&q=${encodeURIComponent(q)}`,
    { headers: { 'x-admin-key': ADMIN_KEY } },
  )
  if (!res.ok) {
    throw new Error(`search HTTP ${res.status}: ${await res.text()}`)
  }
  const { results } = await res.json()
  if (!Array.isArray(results) || results.length === 0) return null

  // Sin set: la primera. Con set: la impresión de ese set. En catálogos sin
  // operadores el nombre difuso trae variantes (alternate art, signature),
  // así que se prefiere la que coincide exactamente en nombre.
  const inSet = set
    ? results.filter((r) => (r.setCode ?? '').toLowerCase() === set.toLowerCase())
    : results
  const pool = inSet.length > 0 ? inSet : results
  const exact = pool.find((r) => r.name?.toLowerCase() === name.toLowerCase())
  return exact ?? pool[0]
}

async function createListing(tcg, catalogId, entry) {
  const res = await fetch(`${API_URL}/admin/inventory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({
      tcg,
      catalogId,
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
    const game = entry.game ?? 'mtg'
    const label = `[${game}] ${entry.name} [${entry.set ?? '—'}] ${entry.condition}/${entry.finish}/${entry.language}`
    try {
      const printing = await searchPrinting(game, entry.name, entry.set)
      if (!printing) {
        console.warn(`⤬ sin impresión: ${label}`)
        skipped++
        continue
      }
      const item = await createListing(game, printing.catalogId, entry)
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
