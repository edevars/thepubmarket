#!/usr/bin/env node
/**
 * Importer del Catálogo Nacional de Códigos Postales (SEPOMEX) a D1 (TASK-061.01).
 *
 * Descarga el export oficial de Correos de México, lo parsea con el contrato
 * compartido (`@thepubmarket/shared`) y lo carga completo en
 * `sepomex_settlements`, dejando la procedencia en `sepomex_corpus_meta`.
 *
 * IDEMPOTENTE — correrlo dos veces deja exactamente lo mismo. Cada corrida
 * estampa `corpus_version` en todas las filas, hace INSERT OR REPLACE y al
 * final barre las filas de otras versiones: así los asentamientos que SEPOMEX
 * quitó desaparecen, y una corrida que falle a la mitad nunca deja la tabla
 * vacía (solo mezclada, y la siguiente converge).
 *
 * NO usa el patrón de import-riftbound.mjs (endpoint admin + batches HTTP) a
 * propósito: aquí no hay imágenes que espejar ni lógica por fila, y el tope de
 * ~100 parámetros por statement de D1 obligaría a ~26 mil round-trips. Esto es
 * reference data inerte; `wrangler d1 execute --file` con valores literales es
 * un comando y nada que mantener.
 *
 * Uso:
 *   node scripts/import-sepomex.mjs --local            # descarga y carga en la D1 local
 *   node scripts/import-sepomex.mjs --remote           # ... en producción
 *   node scripts/import-sepomex.mjs --file=CPdescarga.txt --local
 *   node scripts/import-sepomex.mjs --sql-only         # solo genera el .sql
 *
 * Flags:
 *   --local | --remote   destino en D1 (sin ninguno de los dos: --sql-only)
 *   --file=<ruta>        usa un TXT ya descargado (sáltate la descarga)
 *   --version=YYYY-MM-DD fuerza el vintage (por defecto: la fecha que publica
 *                        la página; con --file, el hash del archivo)
 *   --out=<ruta>         dónde escribir el .sql (default apps/api/.tmp/)
 *   --limit=<n>          solo las primeras n filas (para probar rápido)
 *   --sql-only           genera el .sql y no toca D1
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
// Node ≥22 borra los tipos al importar .ts, así que el script y el Worker
// comparten LITERALMENTE el mismo parser y el mismo normalizador. Duplicarlos
// aquí sería el bug silencioso del epic: filas indexadas con una normalización
// y consultadas con otra.
import { parseSepomexCatalog } from '../packages/shared/src/sepomex.ts'

const EXPORT_URL =
  'https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx'
const USER_AGENT = 'ThePubMarket/0.1 (+https://thepubmarket.com; contacto@thepubmarket.com)'
const DB_NAME = 'thepubmarket-db'

/**
 * Filas por INSERT. SQLITE_MAX_COMPOUND_SELECT vale 500 por defecto y cada
 * tupla de un VALUES cuenta como término; 200 deja margen sin volver el
 * archivo absurdamente largo (~800 statements para el catálogo completo).
 */
const ROWS_PER_STATEMENT = 200

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_DIR = path.join(REPO_ROOT, 'apps', 'api')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

const TARGET_LOCAL = flag('local')
const TARGET_REMOTE = flag('remote')
const SQL_ONLY = flag('sql-only') || (!TARGET_LOCAL && !TARGET_REMOTE)
const SOURCE_FILE = option('file')
const FORCED_VERSION = option('version')
const ROW_LIMIT = option('limit') ? Number.parseInt(option('limit'), 10) : null

if (TARGET_LOCAL && TARGET_REMOTE) {
  fail('--local y --remote son excluyentes: elige a qué base cargar.')
}

function fail(message) {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

const log = (message) => console.log(message)

// ---------------------------------------------------------------------------
// Descarga
// ---------------------------------------------------------------------------

/**
 * La página de descarga es un WebForm de ASP.NET: no hay URL directa al
 * archivo. Hay que pedir la página, devolverle sus tokens (__VIEWSTATE,
 * __EVENTVALIDATION) y postear el formulario con "todos los estados" + TXT,
 * simulando el clic en el botón-imagen (`btnDescarga.x/y`). Si Correos
 * rediseña la página esto se rompe de forma ruidosa, que es lo correcto: la
 * alternativa es un espejo de terceros con datos de fecha desconocida.
 */
async function fetchExportPage() {
  const res = await fetch(EXPORT_URL, { headers: { 'user-agent': USER_AGENT } })
  if (!res.ok) fail(`La página de descarga respondió ${res.status}.`)
  // La página es ISO-8859-1; para leer tokens y fecha basta con decodificarla.
  return new TextDecoder('latin1').decode(new Uint8Array(await res.arrayBuffer()))
}

function readHiddenField(html, name) {
  const match = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))
  if (!match) fail(`No se encontró el campo oculto ${name} en la página de descarga.`)
  return match[1]
}

const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * Saca la fecha de publicación del catálogo del rótulo de la página
 * ("Última Actualización de Información: Agosto 6 de 2026"). Es el único lugar
 * donde la fuente dice qué tan fresco es el archivo, y es exactamente lo que
 * necesitamos guardar: sin esto, "el corpus está cargado" no dice nada.
 */
function readPublishedDate(html) {
  const match = html.match(/lblfec[^>]*>([^<]+)</)
  const label = match ? match[1].replace(/^[^:]*:\s*/, '').trim() : null
  if (!label) return { label: null, iso: null }

  const parts = label.match(/([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{1,2})\s+de\s+(\d{4})/)
  if (!parts) return { label, iso: null }
  const month = SPANISH_MONTHS.indexOf(
    parts[1]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  )
  if (month === -1) return { label, iso: null }
  const iso = `${parts[3]}-${String(month + 1).padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  return { label, iso }
}

async function downloadCatalog(html) {
  const body = new URLSearchParams({
    __VIEWSTATE: readHiddenField(html, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: readHiddenField(html, '__VIEWSTATEGENERATOR'),
    __EVENTVALIDATION: readHiddenField(html, '__EVENTVALIDATION'),
    cboEdo: '00', // todos los estados
    rblTipo: 'txt',
    'btnDescarga.x': '20',
    'btnDescarga.y': '10',
  })
  const res = await fetch(EXPORT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': USER_AGENT },
    body,
  })
  if (!res.ok) fail(`La descarga respondió ${res.status}.`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const disposition = res.headers.get('content-disposition') ?? ''
  if (!disposition.includes('.zip') || buffer.subarray(0, 2).toString('ascii') !== 'PK') {
    fail(
      `Se esperaba un ZIP y llegó otra cosa (content-type ${res.headers.get('content-type')}, ${buffer.length} bytes). ¿Cambió el formulario de Correos?`,
    )
  }
  return buffer
}

/**
 * Extrae la única entrada de un ZIP leyendo el directorio central (no la
 * cabecera local): cuando el productor usa data descriptors, la cabecera local
 * trae los tamaños en cero y el directorio central es la única fuente
 * confiable. Evita una dependencia para 40 líneas.
 */
function extractSingleZipEntry(zip) {
  const EOCD_SIGNATURE = 0x06054b50
  let eocd = -1
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd === -1)
    fail('El archivo descargado no parece un ZIP (falta el End of Central Directory).')

  const entries = zip.readUInt16LE(eocd + 10)
  if (entries !== 1) fail(`El ZIP trae ${entries} entradas y se esperaba exactamente 1.`)

  const centralDir = zip.readUInt32LE(eocd + 16)
  if (zip.readUInt32LE(centralDir) !== 0x02014b50) fail('Directorio central del ZIP ilegible.')

  const method = zip.readUInt16LE(centralDir + 10)
  const compressedSize = zip.readUInt32LE(centralDir + 20)
  const nameLength = zip.readUInt16LE(centralDir + 28)
  const name = zip.subarray(centralDir + 46, centralDir + 46 + nameLength).toString('latin1')
  const localHeader = zip.readUInt32LE(centralDir + 42)

  const dataStart =
    localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28)
  const raw = zip.subarray(dataStart, dataStart + compressedSize)

  if (method === 0) return { name, content: Buffer.from(raw) }
  if (method === 8) return { name, content: inflateRawSync(raw) }
  fail(`Método de compresión ZIP no soportado: ${method}.`)
}

// ---------------------------------------------------------------------------
// Generación de SQL
// ---------------------------------------------------------------------------

/** Literal SQL: comilla simple duplicada, o NULL. Nada más entra a estas filas. */
function sqlText(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replaceAll("'", "''")}'`
}

const COLUMNS = [
  'postal_code',
  'settlement_id',
  'settlement',
  'settlement_type',
  'municipality',
  'state',
  'city',
  'zone',
  'state_code',
  'municipality_code',
  'city_code',
  'settlement_norm',
  'municipality_norm',
  'state_norm',
  'city_norm',
  'corpus_version',
]

function rowValues(s, version) {
  return `(${[
    sqlText(s.postalCode),
    sqlText(s.settlementId),
    sqlText(s.settlement),
    sqlText(s.settlementType),
    sqlText(s.municipality),
    sqlText(s.state),
    sqlText(s.city),
    sqlText(s.zone),
    sqlText(s.stateCode),
    sqlText(s.municipalityCode),
    sqlText(s.cityCode),
    sqlText(s.settlementNorm),
    sqlText(s.municipalityNorm),
    sqlText(s.stateNorm),
    sqlText(s.cityNorm),
    sqlText(version),
  ].join(',')})`
}

function buildSql(settlements, meta) {
  const out = []
  out.push(`-- Catálogo SEPOMEX ${meta.version} — ${settlements.length} asentamientos.`)
  out.push(`-- Generado por scripts/import-sepomex.mjs. NO editar a mano ni commitear.`)
  out.push(`-- sha256 del TXT: ${meta.sha256}`)
  out.push('')

  for (let i = 0; i < settlements.length; i += ROWS_PER_STATEMENT) {
    const chunk = settlements.slice(i, i + ROWS_PER_STATEMENT)
    out.push(
      `INSERT OR REPLACE INTO sepomex_settlements (${COLUMNS.join(',')}) VALUES\n${chunk
        .map((s) => rowValues(s, meta.version))
        .join(',\n')};`,
    )
  }

  // Barrido: lo que quedó de una versión anterior ya no está en el catálogo.
  // Va DESPUÉS de los inserts a propósito — si la corrida muere antes, la
  // tabla queda mezclada pero nunca vacía.
  out.push('')
  out.push(`DELETE FROM sepomex_settlements WHERE corpus_version <> ${sqlText(meta.version)};`)

  out.push('')
  out.push(
    `INSERT INTO sepomex_corpus_meta (id, version, source_url, published_label, row_count, file_sha256, loaded_at)
VALUES (1, ${sqlText(meta.version)}, ${sqlText(meta.sourceUrl)}, ${sqlText(meta.publishedLabel)}, ${settlements.length}, ${sqlText(meta.sha256)}, unixepoch())
ON CONFLICT(id) DO UPDATE SET
  version = excluded.version,
  source_url = excluded.source_url,
  published_label = excluded.published_label,
  row_count = excluded.row_count,
  file_sha256 = excluded.file_sha256,
  loaded_at = excluded.loaded_at;`,
  )
  out.push('')
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let rawTxt
let publishedLabel = null
let publishedIso = null

if (SOURCE_FILE) {
  const filePath = path.resolve(SOURCE_FILE)
  if (!fs.existsSync(filePath)) fail(`No existe el archivo ${filePath}.`)
  rawTxt = fs.readFileSync(filePath)
  log(`▸ Usando archivo local ${filePath} (${(rawTxt.length / 1e6).toFixed(1)} MB)`)
} else {
  log('▸ Pidiendo la página de descarga de Correos de México…')
  const html = await fetchExportPage()
  const published = readPublishedDate(html)
  publishedLabel = published.label
  publishedIso = published.iso
  log(`  última actualización publicada: ${publishedLabel ?? 'desconocida'}`)

  log('▸ Descargando el catálogo nacional (TXT, todos los estados)…')
  const zip = await downloadCatalog(html)
  const entry = extractSingleZipEntry(zip)
  rawTxt = entry.content
  log(`  ${entry.name} — ${(rawTxt.length / 1e6).toFixed(1)} MB`)
}

const sha256 = createHash('sha256').update(rawTxt).digest('hex')
// El archivo es ISO-8859-1: decodificarlo como UTF-8 convierte cada acento en
// U+FFFD y el daño es irreversible (AC #6 del task).
const text = new TextDecoder('latin1').decode(rawTxt)

log('▸ Parseando…')
const { settlements, headerLine } = parseSepomexCatalog(text)
const rows = ROW_LIMIT ? settlements.slice(0, ROW_LIMIT) : settlements
if (ROW_LIMIT) log(`  ⚠ --limit=${ROW_LIMIT}: se cargará SOLO un subconjunto, no el catálogo real.`)

const version = FORCED_VERSION ?? publishedIso ?? `sha-${sha256.slice(0, 12)}`
const postalCodes = new Set(rows.map((s) => s.postalCode))
log(
  `  ${rows.length} asentamientos, ${postalCodes.size} códigos postales (cabecera en línea ${headerLine})`,
)
log(`  versión del corpus: ${version}`)

const outPath = path.resolve(option('out') ?? path.join(API_DIR, '.tmp', `sepomex-${version}.sql`))
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(
  outPath,
  buildSql(rows, {
    version,
    sha256,
    publishedLabel,
    sourceUrl: SOURCE_FILE ? `file://${path.resolve(SOURCE_FILE)}` : EXPORT_URL,
  }),
)
log(`▸ SQL escrito en ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB)`)

if (SQL_ONLY) {
  log('\n✓ Listo (--sql-only): no se tocó ninguna base.')
  process.exit(0)
}

const target = TARGET_REMOTE ? '--remote' : '--local'
log(`▸ Cargando en D1 ${TARGET_REMOTE ? 'REMOTA (producción)' : 'local'}…`)
// stdio capturado, no heredado: wrangler imprime el resultado de CADA uno de
// los ~800 statements y sepulta cualquier error real bajo miles de líneas de
// JSON vacío. Si algo falla, ahí sí se vuelca todo.
const run = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', DB_NAME, target, '--yes', `--file=${outPath}`],
  { cwd: API_DIR, encoding: 'utf8' },
)
if (run.status !== 0) {
  console.error(run.stdout ?? '')
  console.error(run.stderr ?? '')
  fail(`wrangler terminó con código ${run.status}.`)
}

log(`\n✓ Catálogo ${version} cargado: ${rows.length} asentamientos, ${postalCodes.size} CPs.`)
