#!/usr/bin/env node
/**
 * Riftbound catalog importer (TASK-036). Reads the full card dataset from the
 * dotgg network API (the JSON backend behind riftbound.gg/cards) and pushes it
 * in batches to `POST /admin/catalog/cards`, where the Worker upserts D1 rows
 * and mirrors each card image from static.dotgg.gg into R2.
 *
 * IDEMPOTENT — unlike load-inventory.mjs, re-running is the whole recovery
 * story: rows converge via upsert, images already in R2 are skipped (head()),
 * and cards whose image failed last time (image_r2_key NULL) get retried.
 * Run it again after a new set release or errata; nothing duplicates.
 *
 * Usage:
 *   node scripts/import-riftbound.mjs [--dry-run]
 * Env:
 *   API_URL     (default http://localhost:8787)
 *   ADMIN_KEY   (default dev-admin-key-change-me — must match the Worker's ADMIN_API_KEY)
 *   BATCH_SIZE  (default 10 — sized for the free-plan 50-subrequest limit; keep <= 25)
 */

const DOTGG_API = 'https://api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed'
const IMAGE_BASE = 'https://static.dotgg.gg/riftbound/cards'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const API_URL = process.env.API_URL ?? 'http://localhost:8787'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'dev-admin-key-change-me'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const BATCH_SIZE = Math.min(Number(process.env.BATCH_SIZE ?? 10), 25)
const THROTTLE_MS = 250
const MAX_BATCH_RETRIES = 2
const DRY_RUN = process.argv.includes('--dry-run')

const USER_AGENT = 'ThePubMarket/0.1 (+https://thepubmarket.mx; contacto@thepubmarket.mx)'

/**
 * Fields the mapper reads. If dotgg renames or drops one, abort loudly instead
 * of importing garbage — the columnar format gives no other integrity signal.
 */
const REQUIRED_FIELDS = [
  'id',
  'name',
  'image',
  'effect',
  'flavor',
  'color',
  'cost',
  'type',
  'supertype',
  'might',
  'set_name',
  'rarity',
  'marketIds',
  'price',
  'foilPrice',
  'delta7dPrice',
  'delta7dPriceFoil',
  'cmurl',
  'cmid',
  'cmPrice',
  'cmFoilPrice',
  'cmDelta7dPrice',
  'cmDelta7dPriceFoil',
  'hasNormal',
  'hasFoil',
  'image_back',
  'hasback',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Cleans dotgg rules/flavor HTML into plain text: <br/> becomes a newline,
 * remaining tags are stripped, basic entities decoded. Icon tokens like
 * `:rb_might:` are kept verbatim on purpose — they are structured data a
 * frontend can render as icons; stripping them would be irreversible.
 */
function cleanText(html) {
  if (!html) return null
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#039;', "'")
    .replaceAll('&nbsp;', ' ')
    .trim()
  return text.length > 0 ? text : null
}

const toInt = (v) => {
  const n = Number.parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

const toPrice = (v) => {
  const n = Number.parseFloat(v)
  return Number.isNaN(n) ? null : n
}

/** Maps one dotgg card (already zipped into an object) to the ingest payload. */
function mapCard(raw, priceFetchedAt) {
  const id = raw.id
  const dash = id.indexOf('-')
  const tcgplayer = {
    price: toPrice(raw.price),
    foilPrice: toPrice(raw.foilPrice),
    delta7d: toPrice(raw.delta7dPrice),
    delta7dFoil: toPrice(raw.delta7dPriceFoil),
  }
  const cardmarket = {
    url: raw.cmurl || null,
    id: raw.cmid || null,
    price: toPrice(raw.cmPrice),
    foilPrice: toPrice(raw.cmFoilPrice),
    delta7d: toPrice(raw.cmDelta7dPrice),
    delta7dFoil: toPrice(raw.cmDelta7dPriceFoil),
  }

  const finishes = []
  if (raw.hasNormal === '1') finishes.push('nonfoil')
  if (raw.hasFoil === '1') finishes.push('foil')

  return {
    // Key-safe id: four oversized promos carry a slash ("OGN-279/298") that
    // would break the R2 key and the image route; they become "OGN-279-298".
    // The original id survives in collectorNumber and sourceImageUrl.
    catalogId: id.replaceAll('/', '-'),
    name: raw.name,
    // "UNL-131" → set UNL, collector number 131 (kept as text: promos may
    // carry letters or slashes). dotgg has no separate set-code field per card.
    setCode: dash > 0 ? id.slice(0, dash) : id,
    setName: raw.set_name ?? '',
    collectorNumber: dash > 0 ? id.slice(dash + 1) : id,
    lang: 'en',
    // Lowercase to match the Scryfall snapshot convention used repo-wide.
    rarity: (raw.rarity ?? '').toLowerCase(),
    artist: null, // dotgg does not expose the artist
    finishes,
    rulesText: cleanText(raw.effect),
    flavorText: cleanText(raw.flavor),
    gameAttributes: {
      tcg: 'riftbound',
      type: raw.type || null,
      supertype: raw.supertype || null,
      domains: Array.isArray(raw.color) ? raw.color : [],
      energy: toInt(raw.cost),
      might: toInt(raw.might),
      power: null, // dotgg does not expose rune/power cost
    },
    // Market reference prices (TCGplayer USD / Cardmarket EUR) as reported by
    // the source. Reference only — sellers price their own singles in MXN.
    priceData: { marketIds: raw.marketIds || null, tcgplayer, cardmarket },
    priceFetchedAt,
    // Prefer the URL dotgg reports (it knows about slashed ids and promos);
    // construct from the id only if the field ever arrives empty.
    sourceImageUrl: raw.image || `${IMAGE_BASE}/${id}.webp`,
    sourceImageBackUrl: raw.hasback === '1' && raw.image_back ? raw.image_back : null,
  }
}

async function fetchDataset() {
  const res = await fetch(DOTGG_API, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`dotgg HTTP ${res.status}`)
  const { names, data } = await res.json()
  if (!Array.isArray(names) || !Array.isArray(data)) {
    throw new Error('dotgg response shape changed: expected {names, data}')
  }

  const missing = REQUIRED_FIELDS.filter((f) => !names.includes(f))
  if (missing.length > 0) {
    throw new Error(`dotgg dropped/renamed fields, aborting: ${missing.join(', ')}`)
  }

  // Columnar → objects: names is the header row, each data row is positional.
  return data.map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])))
}

async function postBatch(cards, attempt = 0) {
  const res = await fetch(`${API_URL}/admin/catalog/cards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({ tcg: 'riftbound', cards }),
  }).catch((err) => {
    if (attempt >= MAX_BATCH_RETRIES) throw err
    return null
  })

  if (res?.ok) return res.json()

  // 4xx = payload/config problem; retrying identical input cannot help.
  if (res && res.status < 500) {
    throw new Error(`ingest HTTP ${res.status}: ${await res.text()}`)
  }
  if (attempt >= MAX_BATCH_RETRIES) {
    throw new Error(`ingest HTTP ${res ? res.status : 'network error'} after retries`)
  }
  await sleep(1000 * (attempt + 1))
  return postBatch(cards, attempt + 1)
}

async function main() {
  console.log(`Fetching Riftbound dataset from dotgg…`)
  const raws = await fetchDataset()
  const priceFetchedAt = Math.floor(Date.now() / 1000)
  const cards = raws.map((raw) => mapCard(raw, priceFetchedAt))
  console.log(
    `${cards.length} cards → ${API_URL} (batch ${BATCH_SIZE}${DRY_RUN ? ', DRY RUN' : ''})\n`,
  )

  if (DRY_RUN) {
    console.log(JSON.stringify(cards.slice(0, 3), null, 2))
    console.log(`\nDry run: mapped ${cards.length} cards, nothing sent.`)
    return
  }

  const totals = { upserted: 0, imagesUploaded: 0, imagesExisting: 0, imagesFailed: 0 }
  let failedBatches = 0
  const batchCount = Math.ceil(cards.length / BATCH_SIZE)

  for (let i = 0; i < cards.length; i += BATCH_SIZE) {
    const batch = cards.slice(i, i + BATCH_SIZE)
    const label = `batch ${i / BATCH_SIZE + 1}/${batchCount} (${batch[0].catalogId}…)`
    try {
      const { summary, results } = await postBatch(batch)
      totals.upserted += summary.upserted
      totals.imagesUploaded += summary.imagesUploaded
      totals.imagesExisting += summary.imagesExisting
      totals.imagesFailed += summary.imagesFailed
      const failures = results.filter((r) => r.image === 'failed' || r.imageBack === 'failed')
      console.log(
        `✓ ${label}: ${summary.upserted} rows, +${summary.imagesUploaded} img, ${summary.imagesExisting} cached${failures.length ? `, FAILED: ${failures.map((f) => f.catalogId).join(' ')}` : ''}`,
      )
    } catch (err) {
      console.error(`✗ ${label}: ${err.message}`)
      failedBatches++
    }
    await sleep(THROTTLE_MS)
  }

  console.log(
    `\nDone: ${totals.upserted} rows upserted, ${totals.imagesUploaded} images uploaded, ` +
      `${totals.imagesExisting} already in R2, ${totals.imagesFailed} failed, ${failedBatches} failed batches.`,
  )
  if (totals.imagesFailed > 0 || failedBatches > 0) {
    console.log('Re-run this script to retry failed rows/images (idempotent).')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`)
  console.error('Is the API running at', API_URL, '? (pnpm --filter @thepubmarket/api dev)')
  process.exit(1)
})
