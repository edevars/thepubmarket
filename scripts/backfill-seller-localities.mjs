#!/usr/bin/env node
/**
 * Resuelve la localidad de las tiendas que aún no tienen código postal
 * registrado (TASK-061.05).
 *
 * NO ADIVINA. Las tiendas actuales se sembraron con ciudad y colonia de texto
 * libre y sin CP; The Pub Game Store es un negocio real y ponerle un código
 * postal inventado sería peor que dejarlo pendiente — una dirección incorrecta
 * en el sistema es más difícil de detectar que una ausente. Así que esto BUSCA
 * la colonia de cada tienda en el catálogo y reporta lo que encuentra:
 *
 *   - un solo candidato Y consistente con la ciudad que la tienda ya tiene
 *                           registrada → con `--apply` lo escribe
 *   - varios candidatos     → los lista para que una persona elija
 *   - uno solo pero de otra ciudad → lo lista igual. Un candidato único NO es
 *                           un candidato correcto: "Coyoacán" es alcaldía en la
 *                           CDMX pero colonia en Monterrey, así que buscar esa
 *                           palabra da un único CP… en Nuevo León. Escribirlo
 *                           habría mandado la tienda al otro lado del país.
 *   - ninguno               → lo dice, y la tienda sigue funcionando con la
 *                             comparación de ciudad de texto libre de siempre
 *
 * Escribe vía `PATCH /admin/sellers/:id/address`, la misma ruta que usaría un
 * operador, para que no existan dos caminos que puedan divergir.
 *
 * Uso:
 *   node scripts/backfill-seller-localities.mjs            # solo reporta
 *   node scripts/backfill-seller-localities.mjs --apply    # aplica los únicos
 * Env:
 *   API_URL     (default http://localhost:8787)
 *   ADMIN_KEY   (default dev-admin-key-change-me)
 *   D1_TARGET   'local' (default) | 'remote'
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const API_URL = process.env.API_URL ?? 'http://localhost:8787'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const ADMIN_KEY = process.env.ADMIN_KEY ?? 'dev-admin-key-change-me'
// biome-ignore lint/suspicious/noUndeclaredEnvVars: script CLI standalone, no es tarea de turbo
const D1_TARGET = process.env.D1_TARGET === 'remote' ? '--remote' : '--local'

const APPLY = process.argv.includes('--apply')
const API_DIR = path.join(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  'apps',
  'api',
)

/** Consulta D1 con wrangler y devuelve las filas. Solo lectura. */
function query(sql) {
  const run = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'thepubmarket-db', D1_TARGET, '--json', '--command', sql],
    { cwd: API_DIR, encoding: 'utf8' },
  )
  if (run.status !== 0) {
    console.error(run.stderr ?? '')
    process.exit(1)
  }
  const out = run.stdout ?? ''
  return JSON.parse(out.slice(out.indexOf('[')))[0].results
}

/** Literal SQL: comilla simple duplicada. */
const sqlLiteral = (value) => String(value).replaceAll("'", "''")

const stores = query(
  'SELECT id, name, city, neighborhood, address, postal_code FROM sellers WHERE postal_code IS NULL ORDER BY name',
)

if (stores.length === 0) {
  console.log('✓ Todas las tiendas ya tienen código postal registrado.')
  process.exit(0)
}

console.log(`▸ ${stores.length} tienda(s) sin código postal.\n`)

const pending = []
let applied = 0

for (const store of stores) {
  const label = `${store.name} — ${[store.neighborhood, store.city].filter(Boolean).join(', ')}`
  if (!store.neighborhood) {
    console.log(`? ${label}\n    sin colonia registrada: no hay por dónde buscar.\n`)
    pending.push(store.name)
    continue
  }

  // Se busca por colonia normalizada; la ciudad de texto libre NO se usa como
  // filtro a propósito ("CDMX" no existe en el catálogo, que dice "Ciudad de
  // México" — el bug que esta task arregla).
  const candidates = query(
    `SELECT DISTINCT postal_code, settlement, municipality, state FROM sepomex_settlements
     WHERE settlement_norm = '${sqlLiteral(
       store.neighborhood
         .normalize('NFD')
         .replace(/[\u0300-\u036f]/g, '')
         .replace(/\s+/g, ' ')
         .trim()
         .toLowerCase(),
     )}'
     ORDER BY postal_code`,
  )

  if (candidates.length === 0) {
    console.log(`? ${label}\n    la colonia no está en el catálogo. Queda para revisión.\n`)
    pending.push(store.name)
    continue
  }

  if (candidates.length > 1) {
    console.log(`? ${label}\n    ${candidates.length} códigos postales posibles — elige uno:`)
    for (const c of candidates) {
      console.log(`      ${c.postal_code}  ${c.settlement} · ${c.municipality}, ${c.state}`)
    }
    console.log()
    pending.push(store.name)
    continue
  }

  const only = candidates[0]

  // Un candidato único no es un candidato correcto. Se exige además que
  // concuerde con la ciudad que la tienda ya tenía registrada; si esa ciudad
  // es una abreviatura que el catálogo no usa ("CDMX"), no hay forma de
  // confirmarlo desde aquí y la decisión es de una persona.
  const norm = (v) =>
    String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  const recorded = norm(store.city)
  const consistent =
    recorded !== '' && (recorded === norm(only.state) || recorded === norm(only.municipality))

  if (!consistent) {
    console.log(`? ${label}`)
    console.log(`    candidato único: ${only.postal_code} · ${only.municipality}, ${only.state}`)
    console.log(
      `    NO concuerda con la ciudad registrada ("${store.city ?? '—'}"). Para revisión.\n`,
    )
    pending.push(store.name)
    continue
  }

  console.log(`✓ ${label}\n    ${only.postal_code} · ${only.municipality}, ${only.state}`)

  if (!APPLY) {
    console.log('    (dry run — corre con --apply para escribirlo)\n')
    continue
  }

  const res = await fetch(`${API_URL}/admin/sellers/${store.id}/address`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: JSON.stringify({ postalCode: only.postal_code }),
  })
  if (!res.ok) {
    console.log(`    ✗ la API respondió ${res.status}\n`)
    pending.push(store.name)
    continue
  }
  applied += 1
  console.log('    escrito.\n')
}

console.log('———')
if (APPLY) console.log(`${applied} tienda(s) actualizada(s).`)
if (pending.length > 0) {
  console.log(`${pending.length} para revisión humana: ${pending.join(', ')}`)
  console.log(
    'Ninguna de esas deja de funcionar: siguen emparejando recolección por su ciudad de texto libre.',
  )
  console.log('Para fijarles el CP: PATCH /admin/sellers/:id/address con {"postalCode":"NNNNN"}')
}
