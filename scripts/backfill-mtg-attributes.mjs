#!/usr/bin/env node
/**
 * Backfill de `card_attributes` para inventario de MTG (TASK-050).
 *
 * Todo single de MTG cargado antes de TASK-049 quedó con `card_attributes =
 * NULL`: el pipeline de alta no derivaba colores/tipos/maná todavía. Este
 * script cierra la brecha resolviendo cada fila contra Scryfall y escribiendo
 * el mismo `MtgAttributes` que el pipeline actual produciría.
 *
 * IDEMPOTENTE por construcción: `GET /admin/inventory/mtg-missing-attributes`
 * solo devuelve filas todavía sin atributos válidos, así que una corrida
 * posterior a un run exitoso reporta 0 filas y no hace nada. Re-correr tras un
 * fallo parcial retoma exactamente donde quedó, sin duplicar trabajo.
 *
 * Reglas de derivación — IDÉNTICAS a `buildMtgAttributes` en
 * apps/api/src/lib/scryfall.ts (TASK-049). Se duplican aquí porque ese archivo
 * vive en el Worker (no es importable desde un script de Node standalone,
 * mismo patrón que scripts/import-riftbound.mjs). Si esas reglas cambian,
 * este script debe actualizarse a mano para no divergir:
 *   - colors: `colors` top-level si no está vacío; si no, unión de
 *     `card_faces[].colors`; si sigue vacío, `['C']`.
 *   - types: tokens de la línea de tipo de la cara frontal (antes del '—'),
 *     intersectados con MTG_CARD_TYPES.
 *   - typeLine: línea de tipo completa de la cara frontal, o null.
 *   - manaValue: `cmc` tal cual, o null si Scryfall no lo reporta.
 *
 * Uso local:
 *   node scripts/backfill-mtg-attributes.mjs
 * Uso en prod:
 *   API_URL=https://api.thepubmarket.mx ADMIN_KEY=<secreto> \
 *     node scripts/backfill-mtg-attributes.mjs
 * Variables:
 *   API_URL   (default http://localhost:8787)
 *   ADMIN_KEY (debe coincidir con ADMIN_API_KEY del Worker)
 */

// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const API_URL = process.env.API_URL ?? 'http://localhost:8787'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'dev-admin-key-change-me'

const SCRYFALL_BASE = 'https://api.scryfall.com'
const USER_AGENT = 'ThePubMarket/0.1 (+https://thepubmarket.mx; contacto@thepubmarket.mx)'

/** Tope de Scryfall para `POST /cards/collection` (identifiers por request). */
const SCRYFALL_BATCH_SIZE = 75
/** ~10 req/s es el límite documentado de Scryfall; nos quedamos bien debajo. */
const SCRYFALL_THROTTLE_MS = 150
/** Filas por página del GET de faltantes — cómodo bajo el límite de 500 del endpoint. */
const PAGE_LIMIT = 200
const MTG_CARD_TYPES = [
  'Artifact',
  'Battle',
  'Creature',
  'Enchantment',
  'Instant',
  'Land',
  'Planeswalker',
  'Sorcery',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Misma derivación que `buildMtgAttributes` en apps/api/src/lib/scryfall.ts — ver cabecera. */
function buildMtgAttributes(raw) {
  const topColors = raw.colors ?? []
  const colors =
    topColors.length > 0
      ? topColors
      : (() => {
          const union = new Set()
          for (const face of raw.card_faces ?? []) {
            for (const c of face.colors ?? []) union.add(c)
          }
          return [...union]
        })()

  const typeLine = raw.type_line ?? raw.card_faces?.[0]?.type_line ?? null
  const types = typeLine
    ? (typeLine.split('—')[0]?.trim().split(/\s+/).filter(Boolean) ?? []).filter((t) =>
        MTG_CARD_TYPES.includes(t),
      )
    : []

  return {
    tcg: 'mtg',
    colors: colors.length > 0 ? colors : ['C'],
    types,
    typeLine,
    manaValue: raw.cmc ?? null,
  }
}

/** GET /admin/inventory/mtg-missing-attributes?limit= */
async function fetchMissingPage() {
  const url = new URL('/admin/inventory/mtg-missing-attributes', API_URL)
  url.searchParams.set('limit', String(PAGE_LIMIT))
  const res = await fetch(url, { headers: { 'x-admin-key': ADMIN_KEY } })
  if (!res.ok) {
    throw new Error(`GET mtg-missing-attributes HTTP ${res.status}: ${await res.text()}`)
  }
  const { items } = await res.json()
  return items
}

/** POST /cards/collection — resuelve hasta 75 ids de Scryfall por llamada. */
async function resolveScryfallBatch(scryfallIds) {
  const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    body: JSON.stringify({ identifiers: scryfallIds.map((id) => ({ id })) }),
  })
  if (!res.ok) {
    throw new Error(`Scryfall /cards/collection HTTP ${res.status}: ${await res.text()}`)
  }
  return res.json() // { data: ScryfallCard[], not_found: {id}[] }
}

/** POST /admin/inventory/attributes — aplica un batch de card_attributes resueltos. */
async function postAttributesBatch(items) {
  const res = await fetch(`${API_URL}/admin/inventory/attributes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify(items),
  })
  if (!res.ok) {
    throw new Error(`POST inventory/attributes HTTP ${res.status}: ${await res.text()}`)
  }
  return res.json() // { updated, notFound }
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  console.log(`Backfill de MTG card_attributes → ${API_URL}\n`)

  let totalUpdated = 0
  let totalPages = 0
  const unresolved = [] // { id, scryfallId, reason }
  // Ids de inventario que ya fallaron una vez (sin identificador, o Scryfall
  // no reconoce el id, o el POST no encontró la fila). El GET las sigue
  // devolviendo para siempre porque `card_attributes` nunca se llena — sin
  // esta lista de exclusión el loop principal no terminaría.
  const skipIds = new Set()

  for (;;) {
    const page = await fetchMissingPage()
    if (page.length === 0) break

    const pending = page.filter((row) => !skipIds.has(row.id))
    if (pending.length === 0) {
      // Todo lo que queda "faltante" ya se intentó y falló: no hay forma de
      // progresar más — se reporta al final y se corta el loop.
      break
    }
    totalPages++

    const withId = pending.filter((row) => row.scryfallId)
    for (const row of pending) {
      if (!row.scryfallId) {
        skipIds.add(row.id)
        unresolved.push({ id: row.id, scryfallId: null, reason: 'sin identificador de Scryfall' })
      }
    }

    for (const idBatch of chunk(withId, SCRYFALL_BATCH_SIZE)) {
      const scryfallIds = idBatch.map((row) => row.scryfallId)
      const { data, not_found: notFound } = await resolveScryfallBatch(scryfallIds)
      await sleep(SCRYFALL_THROTTLE_MS)

      const byId = new Map(data.map((card) => [card.id, card]))
      const attributeItems = []
      for (const row of idBatch) {
        const card = byId.get(row.scryfallId)
        if (!card) {
          skipIds.add(row.id)
          unresolved.push({
            id: row.id,
            scryfallId: row.scryfallId,
            reason: 'Scryfall no reconoce el id',
          })
          continue
        }
        attributeItems.push({ id: row.id, gameAttributes: buildMtgAttributes(card) })
      }
      for (const nf of notFound ?? []) {
        console.warn(`  aviso: Scryfall reportó not_found para ${JSON.stringify(nf)}`)
      }

      if (attributeItems.length > 0) {
        const { updated, notFound: notUpdated } = await postAttributesBatch(attributeItems)
        totalUpdated += updated
        for (const id of notUpdated ?? []) {
          skipIds.add(id)
          unresolved.push({ id, scryfallId: null, reason: 'no se encontró la fila al actualizar' })
        }
        console.log(
          `✓ página ${totalPages}: ${updated}/${attributeItems.length} filas actualizadas`,
        )
      }
    }
  }

  console.log(`\nDone: ${totalUpdated} filas actualizadas en ${totalPages} página(s).`)
  if (unresolved.length > 0) {
    console.error(`\n${unresolved.length} fila(s) NO resueltas:`)
    for (const u of unresolved) {
      console.error(`  - inventory.id=${u.id} scryfallId=${u.scryfallId ?? 'null'} (${u.reason})`)
    }
    process.exitCode = 1
  } else {
    console.log('0 missing — nada pendiente.')
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}`)
  console.error('¿Está corriendo la API en', API_URL, '? (pnpm --filter @thepubmarket/api dev)')
  process.exit(1)
})
