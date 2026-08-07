#!/usr/bin/env node
/**
 * Descarga los símbolos usados por los filtros de catálogo (TASK-048) y los
 * deja como assets estáticos versionados en `apps/web/public/symbols/`.
 * OpenNext sirve `public/` directo desde el Worker (binding ASSETS) — nada
 * de esto depende de un CDN de terceros en producción, solo en el momento
 * de esta descarga.
 *
 * Fuentes:
 *   - Símbolos de maná de MTG: Scryfall (`GET /symbology`, campo `svg_uri`).
 *     Uso amparado por la "Fan Content Policy" de Wizards of the Coast — son
 *     los símbolos oficiales de maná, no arte de carta ni logotipo de marca.
 *   - Runas de dominio y sellos de rareza de Riftbound: mismo mirror de
 *     dotgg.gg que ya usa `scripts/import-riftbound.mjs` para el catálogo
 *     (misma justificación: iconografía de UI, no el arte de las cartas).
 *
 * IDEMPOTENTE — si el archivo destino ya existe, se omite. `--force` vuelve
 * a descargar todo. Reintentar tras un fallo parcial es seguro: solo repite
 * el trabajo faltante.
 *
 * Usage:
 *   node scripts/fetch-filter-symbols.mjs [--force]
 */

import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRYFALL_SYMBOLOGY = 'https://api.scryfall.com/symbology'
const DOTGG_DOMAIN_BASE = 'https://static.dotgg.gg/riftbound/text'
const DOTGG_COLORS_BASE = 'https://static.dotgg.gg/riftbound/colors'
const DOTGG_RARITY_BASE = 'https://static.dotgg.gg/riftbound/rarity'

const THROTTLE_MS = 150
const USER_AGENT = 'ThePubMarket/0.1 (+https://thepubmarket.mx; contacto@thepubmarket.mx)'
const FORCE = process.argv.includes('--force')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SYMBOLS_ROOT = path.join(__dirname, '..', 'apps', 'web', 'public', 'symbols')

const MTG_MANA_SYMBOLS = ['W', 'U', 'B', 'R', 'G', 'C']

/** Dominio Riftbound -> nombre de archivo dotgg (colorless usa el rune "rainbow"). */
const RIFTBOUND_DOMAINS = {
  body: 'body',
  calm: 'calm',
  chaos: 'chaos',
  colorless: 'rainbow',
  fury: 'fury',
  mind: 'mind',
  order: 'order',
}

const RIFTBOUND_RARITIES = ['common', 'uncommon', 'rare', 'epic']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let hardFailures = 0
const warnings = []

function warn(msg) {
  warnings.push(msg)
  console.warn(`⚠ ${msg}`)
}

/** Descarga `url` a `destPath` salvo que ya exista (a menos que --force). */
async function downloadIfMissing(url, destPath) {
  if (!FORCE) {
    const exists = await stat(destPath).then(
      () => true,
      () => false,
    )
    if (exists) {
      console.log(`= ${path.relative(SYMBOLS_ROOT, destPath)} (ya existe, omitido)`)
      return
    }
  }

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al descargar ${url}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(path.dirname(destPath), { recursive: true })
  await writeFile(destPath, buf)
  console.log(`✓ ${path.relative(SYMBOLS_ROOT, destPath)} (${buf.length} bytes)`)
  await sleep(THROTTLE_MS)
}

async function fetchMtgManaSymbols() {
  console.log('\n— MTG: símbolos de maná (Scryfall symbology) —')
  const res = await fetch(SCRYFALL_SYMBOLOGY, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Scryfall symbology HTTP ${res.status}`)
  const { data } = await res.json()
  if (!Array.isArray(data)) throw new Error('Respuesta de Scryfall symbology con forma inesperada')

  for (const code of MTG_MANA_SYMBOLS) {
    const entry = data.find((s) => s.symbol === `{${code}}`)
    if (!entry?.svg_uri) {
      hardFailures++
      warn(`Scryfall no reporta svg_uri para {${code}} — símbolo omitido`)
      continue
    }
    const dest = path.join(SYMBOLS_ROOT, 'mtg', `${code}.svg`)
    try {
      await downloadIfMissing(entry.svg_uri, dest)
    } catch (err) {
      hardFailures++
      warn(`${code}.svg: ${err.message}`)
    }
  }
}

async function fetchRiftboundDomains() {
  console.log('\n— Riftbound: runas de dominio —')
  for (const [domain, runeName] of Object.entries(RIFTBOUND_DOMAINS)) {
    const dest = path.join(SYMBOLS_ROOT, 'riftbound', 'domain', `${domain}.svg`)
    const url = `${DOTGG_DOMAIN_BASE}/rb_rune_${runeName}.svg`
    try {
      await downloadIfMissing(url, dest)
      continue
    } catch (err) {
      warn(
        `${domain}.svg (rb_rune_${runeName}) no disponible (${err.message}), probando fallback .webp`,
      )
    }

    // Fallback: color plano en vez del glifo de runa.
    const fallbackDest = path.join(SYMBOLS_ROOT, 'riftbound', 'domain', `${domain}.webp`)
    const fallbackUrl = `${DOTGG_COLORS_BASE}/${domain}.webp`
    try {
      await downloadIfMissing(fallbackUrl, fallbackDest)
    } catch (err) {
      hardFailures++
      warn(`${domain}: fallback .webp también falló: ${err.message}`)
    }
  }
}

async function fetchRiftboundRarities() {
  console.log('\n— Riftbound: sellos de rareza —')
  for (const rarity of RIFTBOUND_RARITIES) {
    const dest = path.join(SYMBOLS_ROOT, 'riftbound', 'rarity', `${rarity}.svg`)
    const url = `${DOTGG_RARITY_BASE}/${rarity}.svg`
    try {
      await downloadIfMissing(url, dest)
    } catch (err) {
      hardFailures++
      warn(`${rarity}.svg: ${err.message}`)
    }
  }
  // "showcase" es un 404 conocido en dotgg (no existe sello de showcase para
  // Riftbound todavía) — se documenta y se ignora a propósito, no cuenta
  // como fallo duro.
  warn('rarity/showcase.svg: 404 conocido en dotgg, no se descarga (gap documentado)')
}

async function main() {
  console.log(`Destino: ${SYMBOLS_ROOT}${FORCE ? ' (--force: redescargando todo)' : ''}`)
  await mkdir(SYMBOLS_ROOT, { recursive: true })

  await fetchMtgManaSymbols()
  await fetchRiftboundDomains()
  await fetchRiftboundRarities()

  console.log(`\nListo. ${warnings.length} advertencia(s), ${hardFailures} fallo(s) duro(s).`)
  if (hardFailures > 0) {
    console.error('Hubo fallos duros — vuelve a correr el script para reintentar lo faltante.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`)
  process.exit(1)
})
