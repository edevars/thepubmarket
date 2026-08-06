#!/usr/bin/env node
/**
 * Siembra de inventario de PRUEBA a gran escala para el seller ancla.
 *
 * Publica N singles distintos (default 1000: mitad MTG, mitad Riftbound) con
 * cantidad fija y precios variados, vía POST /admin/inventory. A diferencia de
 * load-inventory.mjs (seed curado, entrada por nombre), aquí las cartas salen
 * directo de los catálogos:
 *   - MTG:       búsqueda paginada en Scryfall ordenada por popularidad EDHREC;
 *                el catalogId es el id de impresión que la API ya sabe resolver.
 *   - Riftbound: dump local de `catalog_cards` (ver --riftbound-dump), muestreado
 *                con paso fijo para repartir entre sets.
 *
 * Los precios se derivan del precio de mercado real de cada carta (USD → MXN)
 * con jitter determinista, así el catálogo de prueba tiene una distribución
 * creíble en vez de números redondos. Nunca son precios de venta reales.
 *
 * Determinista: mismo --seed ⇒ mismas cartas, precios, condiciones y acabados.
 * NO idempotente: cada corrida INSERTA filas nuevas.
 *
 * Uso:
 *   node scripts/seed-demo-inventory.mjs [--total 1000] [--qty 5] [--seed 42]
 *                                        [--dry-run] [--riftbound-dump ruta.json]
 * Variables:
 *   API_URL    (default http://localhost:8787)
 *   ADMIN_KEY  (debe coincidir con ADMIN_API_KEY del Worker)
 */

import { readFile } from 'node:fs/promises'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const API_URL = process.env.API_URL ?? 'http://localhost:8787'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'dev-admin-key-change-me'

/** Tipo de cambio de referencia para convertir precios de mercado USD → MXN. */
const USD_MXN = 19
/**
 * Banda de "bulk" en pesos. Muchos staples valen centavos de dólar; recortarlos
 * a un piso fijo dejaría la mitad del catálogo con el mismo precio exacto, que
 * es justo lo que un catálogo de prueba no debe tener.
 */
const BULK_MIN_MXN = 10
const BULK_MAX_MXN = 55
/** Concurrencia por juego. MTG va bajo: cada alta dispara un fetch a Scryfall. */
const CONCURRENCY = { mtg: 3, riftbound: 8 }

function parseArgs(argv) {
  const out = { total: 1000, qty: 5, seed: 42, dryRun: false, dump: '/tmp/riftbound-catalog.json' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--total') out.total = Number(argv[++i])
    else if (a === '--qty') out.qty = Number(argv[++i])
    else if (a === '--seed') out.seed = Number(argv[++i])
    else if (a === '--riftbound-dump') out.dump = argv[++i]
  }
  return out
}

/** PRNG determinista (mulberry32): la corrida es reproducible con el mismo seed. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pickWeighted = (rand, table) => {
  const roll = rand()
  let acc = 0
  for (const [value, weight] of table) {
    acc += weight
    if (roll < acc) return value
  }
  return table[table.length - 1][0]
}

const CONDITION_MIX = [
  ['NM', 0.6],
  ['LP', 0.24],
  ['MP', 0.11],
  ['HP', 0.05],
]
const LANGUAGE_MIX = [
  ['en', 0.72],
  ['es', 0.23],
  ['ja', 0.05],
]

/** Merma por condición: una LP no vale lo mismo que una NM. */
const CONDITION_FACTOR = { NM: 1, LP: 0.85, MP: 0.7, HP: 0.55, DMG: 0.4 }

/**
 * Precio de lista en centavos MXN a partir del precio de mercado en USD.
 * Jitter ±14% para que el catálogo no se vea generado por fórmula, redondeo
 * a pesos enteros (así se ven los precios en una tienda real).
 */
function priceCentsFrom(usd, condition, rand) {
  const jitter = 0.86 + rand() * 0.28
  const mxn = usd * USD_MXN * jitter * (CONDITION_FACTOR[condition] ?? 1)
  // Bajo la banda de bulk el precio de mercado deja de ser informativo: se
  // reparte dentro de la banda en vez de aplastarse contra un piso.
  const priced = mxn < BULK_MAX_MXN ? BULK_MIN_MXN + rand() * (BULK_MAX_MXN - BULK_MIN_MXN) : mxn
  return Math.round(priced) * 100
}

// ---------------------------------------------------------------- MTG (Scryfall)

/**
 * Trae `count` cartas distintas de Scryfall (una impresión por carta), en orden
 * de popularidad EDHREC: staples reconocibles con precios de mercado reales.
 */
async function fetchMtgCards(count) {
  const q = 'game:paper -is:digital -t:basic'
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=edhrec&dir=asc`
  const cards = []
  while (url && cards.length < count) {
    const res = await fetch(url, { headers: { 'user-agent': 'thepubmarket-seed/1.0' } })
    if (!res.ok) throw new Error(`scryfall HTTP ${res.status}: ${await res.text()}`)
    const page = await res.json()
    cards.push(...page.data)
    url = page.has_more ? page.next_page : null
    await new Promise((r) => setTimeout(r, 120))
  }
  return cards.slice(0, count)
}

function mtgOffer(card, rand, qty) {
  // `etched` existe en Scryfall pero no en el enum de acabados de la plataforma.
  const finishes = (card.finishes ?? []).filter((f) => f === 'nonfoil' || f === 'foil')
  if (finishes.length === 0) return null
  // Se prefiere nonfoil cuando hay ambos; ~22% de las publicaciones van en foil.
  const finish = finishes.length === 1 ? finishes[0] : rand() < 0.22 ? 'foil' : 'nonfoil'

  const prices = card.prices ?? {}
  const usd = Number(
    finish === 'foil'
      ? (prices.usd_foil ?? prices.usd_etched ?? prices.usd)
      : (prices.usd ?? prices.usd_foil),
  )
  if (!Number.isFinite(usd) || usd <= 0) return null

  const condition = pickWeighted(rand, CONDITION_MIX)
  return {
    tcg: 'mtg',
    catalogId: card.id,
    label: `${card.name} [${card.set}]`,
    condition,
    finish,
    language: pickWeighted(rand, LANGUAGE_MIX),
    priceCents: priceCentsFrom(usd, condition, rand),
    quantity: qty,
  }
}

// -------------------------------------------------------------- Riftbound (D1)

/** Precio de respaldo por rareza cuando la fuente no trae precio de mercado. */
const RIFTBOUND_FALLBACK_USD = {
  common: 0.3,
  uncommon: 0.8,
  rare: 3,
  epic: 9,
  legendary: 18,
  overnumbered: 25,
  showcase: 30,
}

function riftboundOffer(row, rand, qty) {
  let finishes = []
  try {
    finishes = JSON.parse(row.finishes ?? '[]').filter((f) => f === 'nonfoil' || f === 'foil')
  } catch {
    finishes = []
  }
  if (finishes.length === 0) finishes = ['nonfoil']
  const finish = finishes.length === 1 ? finishes[0] : rand() < 0.25 ? 'foil' : 'nonfoil'

  let market = {}
  try {
    market = JSON.parse(row.price_data ?? '{}')
  } catch {
    market = {}
  }
  const tcgp = market.tcgplayer ?? {}
  const cm = market.cardmarket ?? {}
  const candidates =
    finish === 'foil'
      ? [tcgp.foilPrice, cm.foilPrice, tcgp.price, cm.price]
      : [tcgp.price, cm.price, tcgp.foilPrice, cm.foilPrice]
  const usd =
    candidates.map(Number).find((v) => Number.isFinite(v) && v > 0) ??
    RIFTBOUND_FALLBACK_USD[(row.rarity ?? '').toLowerCase()] ??
    1

  const condition = pickWeighted(rand, CONDITION_MIX)
  return {
    tcg: 'riftbound',
    catalogId: row.catalog_id,
    label: `${row.name} [${row.set_code}]`,
    condition,
    finish,
    language: pickWeighted(rand, LANGUAGE_MIX),
    priceCents: priceCentsFrom(usd, condition, rand),
    quantity: qty,
  }
}

/** Muestreo con paso fijo: reparte la selección entre todos los sets del dump. */
function sampleEvenly(rows, count) {
  if (rows.length <= count) return rows
  const step = rows.length / count
  return Array.from({ length: count }, (_, i) => rows[Math.floor(i * step)])
}

// ------------------------------------------------------------------- Publicación

async function postListing(offer) {
  const res = await fetch(`${API_URL}/admin/inventory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({
      tcg: offer.tcg,
      catalogId: offer.catalogId,
      condition: offer.condition,
      finish: offer.finish,
      language: offer.language,
      priceCents: offer.priceCents,
      quantity: offer.quantity,
    }),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

/** Publica con reintentos: 429 y 5xx son transitorios (Scryfall aguas arriba). */
async function publish(offer, stats) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let result
    try {
      result = await postListing(offer)
    } catch (err) {
      result = { status: 0, body: { error: err.message } }
    }
    if (result.status === 201) {
      stats.created++
      return
    }
    const retryable = result.status === 0 || result.status === 429 || result.status >= 500
    if (!retryable || attempt === 3) {
      stats.failed++
      stats.errors.push(`${offer.label}: ${result.status} ${JSON.stringify(result.body)}`)
      return
    }
    await new Promise((r) => setTimeout(r, 400 * attempt))
  }
}

/** Corre `worker` sobre items con concurrencia acotada. */
async function runPool(items, limit, worker) {
  let cursor = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  })
  await Promise.all(lanes)
}

// -------------------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const perGame = Math.floor(opts.total / 2)
  const rand = rng(opts.seed)

  console.log(`Destino: ${API_URL}`)
  console.log(
    `Objetivo: ${opts.total} singles (${perGame} MTG + ${opts.total - perGame} Riftbound), qty ${opts.qty}, seed ${opts.seed}\n`,
  )

  // --- MTG
  console.log('Trayendo cartas de Scryfall…')
  // Margen extra: algunas se descartan por no tener precio o acabado válido.
  const mtgCards = await fetchMtgCards(perGame + 175)
  const mtgOffers = []
  for (const card of mtgCards) {
    if (mtgOffers.length >= perGame) break
    const offer = mtgOffer(card, rand, opts.qty)
    if (offer) mtgOffers.push(offer)
  }
  console.log(`  ${mtgOffers.length} ofertas MTG listas (de ${mtgCards.length} impresiones).`)

  // --- Riftbound
  const dump = JSON.parse(await readFile(opts.dump, 'utf8'))
  const rows = Array.isArray(dump) ? (dump[0]?.results ?? dump) : (dump.results ?? [])
  const riftOffers = sampleEvenly(rows, opts.total - perGame).map((row) =>
    riftboundOffer(row, rand, opts.qty),
  )
  console.log(`  ${riftOffers.length} ofertas Riftbound listas (de ${rows.length} en catálogo).\n`)

  const all = [...mtgOffers, ...riftOffers]
  const prices = all.map((o) => o.priceCents).sort((a, b) => a - b)
  const fmt = (c) => `$${(c / 100).toLocaleString('es-MX')}`
  console.log(
    `Precios: min ${fmt(prices[0])} · p50 ${fmt(prices[Math.floor(prices.length / 2)])} · p90 ${fmt(prices[Math.floor(prices.length * 0.9)])} · max ${fmt(prices[prices.length - 1])}`,
  )
  console.log(`Distintos: ${new Set(all.map((o) => `${o.tcg}:${o.catalogId}`)).size}\n`)

  if (opts.dryRun) {
    console.log('--dry-run: nada publicado. Muestra:')
    for (const o of [...all.slice(0, 3), ...all.slice(-3)]) {
      console.log(
        `  [${o.tcg}] ${o.label} ${o.condition}/${o.finish}/${o.language} ${fmt(o.priceCents)} ×${o.quantity}`,
      )
    }
    return
  }

  const stats = { created: 0, failed: 0, errors: [] }
  const started = Date.now()
  const tick = setInterval(() => {
    const done = stats.created + stats.failed
    process.stdout.write(`\r  ${done}/${all.length} publicados (${stats.failed} fallidos)…   `)
  }, 1000)

  for (const [tcg, offers] of [
    ['mtg', mtgOffers],
    ['riftbound', riftOffers],
  ]) {
    await runPool(offers, CONCURRENCY[tcg], (offer) => publish(offer, stats))
  }
  clearInterval(tick)

  const secs = Math.round((Date.now() - started) / 1000)
  console.log(`\n\nResumen: ${stats.created} creados, ${stats.failed} fallidos en ${secs}s.`)
  if (stats.errors.length > 0) {
    console.log('\nPrimeros errores:')
    for (const e of stats.errors.slice(0, 15)) console.log(`  ✗ ${e}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`\nError fatal: ${err.message}`)
  process.exit(1)
})
