/**
 * Filtros de catálogo específicos de cada juego (TASK-039).
 *
 * Módulo puro (sin D1, sin Hono): la ruta `GET /catalog` solo llama a
 * `parseGameFilters` y empuja el resultado a su arreglo `filters: SQL[]`
 * existente. Se separa así para que un juego nuevo (colores de MTG, tipos de
 * Pokémon…) registre sus propios filtros en `GAME_FILTERS` sin tocar el
 * handler de la ruta, y para poder probar la semántica de parseo con vitest
 * sin runtime de Workers (ver vitest.config.ts: node env, sin D1).
 *
 * Los datos viven en `inventory.card_attributes` (JSON, shape
 * `RiftboundAttributes` o `MtgAttributes` en @thepubmarket/shared según el
 * juego de la fila) salvo `rarity`, que ya es columna propia.
 */

import { inventory } from '@thepubmarket/db'
import {
  MTG_CARD_TYPES,
  MTG_COLORS,
  MTG_RARITIES,
  RIFTBOUND_CARD_TYPES,
  RIFTBOUND_DOMAINS,
  RIFTBOUND_RARITIES,
  RIFTBOUND_SUPERTYPES,
  type Tcg,
} from '@thepubmarket/shared'
import type { Column } from 'drizzle-orm'
import { inArray, type SQL, sql } from 'drizzle-orm'

/** Un filtro tal como quedó interpretado, para que los tests aserten semántica sin DB. */
export interface AppliedFilter {
  param: string
  /** Valores ya normalizados a la casing canónica (o el entero parseado, como string). */
  values: string[]
}

export type GameFilterResult =
  | { ok: true; conditions: SQL[]; applied: AppliedFilter[] }
  | { ok: false; error: 'filter_requires_tcg'; param: string; requiresTcg: Tcg }
  | {
      ok: false
      error: 'invalid_filter'
      param: string
      value: string
      supported: readonly string[]
    }

/**
 * `card_attributes` puede ser NULL (todas las filas de MTG hoy) o, en teoría,
 * un blob corrupto. `json_each`/`json_extract` sobre JSON inválido lanzan
 * "malformed JSON" al ejecutar la query (500), no al parsear — por eso cada
 * acceso pasa primero por este guard.
 */
const SAFE_ATTRS = sql`iif(json_valid(${inventory.cardAttributes}), ${inventory.cardAttributes}, NULL)`

interface JsonArraySpec {
  kind: 'jsonArray'
  param: string
  path: string
  supported: readonly string[]
}

interface JsonScalarSpec {
  kind: 'jsonScalar'
  param: string
  path: string
  supported: readonly string[]
}

interface JsonIntSpec {
  kind: 'jsonInt'
  param: string
  path: string
  min: number
  max: number
}

interface ColumnSpec {
  kind: 'column'
  param: string
  column: Column
  supported: readonly string[]
}

type FilterSpec = JsonArraySpec | JsonScalarSpec | JsonIntSpec | ColumnSpec

/**
 * Registro de filtros por juego. `GAME_FILTERS[tcg]` ausente/vacío significa
 * "este juego no tiene filtros propios", y cualquier param que llegue igual
 * se rechaza en `parseGameFilters` (no hay params "huérfanos": si el nombre
 * no está registrado para NINGÚN juego, se ignora, pero si está registrado
 * para OTRO juego, se rechaza con filter_requires_tcg — ver el loop
 * principal).
 *
 * `set` (MTG y Riftbound) NO vive aquí: es un param genérico de nivel
 * superior (`inventory.set_code` exacto, sin vocabulario cerrado) que la
 * ruta aplica directo — ver `apps/api/src/routes/catalog.ts`.
 *
 * `type` y `rarity` de MTG (TASK-049) reusan los MISMOS nombres de param que
 * Riftbound, con vocabularios distintos: `ALL_GAME_PARAMS` abajo soporta esta
 * superposición sin que un juego pise al otro.
 */
const GAME_FILTERS: Partial<Record<Tcg, FilterSpec[]>> = {
  riftbound: [
    { kind: 'jsonArray', param: 'domain', path: '$.domains', supported: RIFTBOUND_DOMAINS },
    { kind: 'jsonScalar', param: 'type', path: '$.type', supported: RIFTBOUND_CARD_TYPES },
    {
      kind: 'jsonScalar',
      param: 'supertype',
      path: '$.supertype',
      supported: RIFTBOUND_SUPERTYPES,
    },
    { kind: 'jsonInt', param: 'energy', path: '$.energy', min: 0, max: 99 },
    { kind: 'jsonInt', param: 'might', path: '$.might', min: 0, max: 99 },
    { kind: 'column', param: 'rarity', column: inventory.rarity, supported: RIFTBOUND_RARITIES },
  ],
  mtg: [
    { kind: 'jsonArray', param: 'color', path: '$.colors', supported: MTG_COLORS },
    // jsonArray a propósito, NO jsonScalar: una carta de MTG puede tener
    // varios tipos a la vez ('Artifact Creature' → ['Artifact', 'Creature']),
    // a diferencia del `type` de Riftbound que es un valor único por carta.
    { kind: 'jsonArray', param: 'type', path: '$.types', supported: MTG_CARD_TYPES },
    { kind: 'column', param: 'rarity', column: inventory.rarity, supported: MTG_RARITIES },
  ],
}

/** Registro de un param: juego que lo declaró primero + todos los que lo declaran. */
interface ParamRegistration {
  /** Primer juego que registró el param (orden de declaración en GAME_FILTERS). */
  firstTcg: Tcg
  allTcgs: Tcg[]
}

/**
 * Todos los nombres de param registrados en GAME_FILTERS, con la lista de
 * juegos que los registran (TASK-049: `type` y `rarity` los registran tanto
 * mtg como riftbound, cada uno con su propio vocabulario/spec).
 *
 * `Map<string, ParamRegistration>` en vez de `Map<string, Tcg>`: con un solo
 * Tcg por param, `type`/`rarity` de mtg pisaban silenciosamente el
 * `requiresTcg` de riftbound (el último en ganar en el `flatMap` original), y
 * un param válido para el tcg activo podía 400ear solo porque OTRO juego
 * también lo registra — ver el invariante documentado en `parseGameFilters`.
 * `firstTcg` se calcula aquí (no con `allTcgs[0]` en el punto de uso) para
 * que el tipo no dependa de un arreglo no-vacío en runtime.
 */
const ALL_GAME_PARAMS = new Map<string, ParamRegistration>()
for (const [tcg, specs] of Object.entries(GAME_FILTERS) as [Tcg, FilterSpec[]][]) {
  for (const spec of specs) {
    const existing = ALL_GAME_PARAMS.get(spec.param)
    if (existing) existing.allTcgs.push(tcg)
    else ALL_GAME_PARAMS.set(spec.param, { firstTcg: tcg, allTcgs: [tcg] })
  }
}

/**
 * Junta valores repetidos (`domain=Fury&domain=Order`) y separados por coma
 * (`domain=Fury,Order`) en una sola lista, recorta espacios y descarta vacíos.
 * Un param presente pero solo con valores vacíos cuenta como ausente.
 */
function collectValues(raw: string[]): string[] {
  return raw
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

/** Empareja `value` (case-insensitive) contra la casing canónica registrada, o null si no hay match. */
function matchCanonical(value: string, supported: readonly string[]): string | null {
  const lower = value.toLowerCase()
  return supported.find((s) => s.toLowerCase() === lower) ?? null
}

function buildJsonArrayCondition(spec: JsonArraySpec, canonicalValues: string[]): SQL {
  // json_each sobre el array de dominios: EXISTS con IN es justo lo que hace
  // que una carta multi-dominio matchee con CUALQUIERA de los seleccionados.
  return sql`EXISTS (
    SELECT 1 FROM json_each(json_extract(${SAFE_ATTRS}, ${spec.path}))
    WHERE value IN (${sql.join(
      canonicalValues.map((v) => sql`${v}`),
      sql`, `,
    )})
  )`
}

function buildJsonScalarCondition(spec: JsonScalarSpec, canonicalValues: string[]): SQL {
  // Filas sin ese campo (json_extract null) nunca matchean un filtro de
  // valor — es el comportamiento correcto para el caso "carta sin tipo".
  return sql`json_extract(${SAFE_ATTRS}, ${spec.path}) IN (${sql.join(
    canonicalValues.map((v) => sql`${v}`),
    sql`, `,
  )})`
}

function buildJsonIntCondition(spec: JsonIntSpec, ints: number[]): SQL {
  return sql`json_extract(${SAFE_ATTRS}, ${spec.path}) IN (${sql.join(
    ints.map((v) => sql`${v}`),
    sql`, `,
  )})`
}

/**
 * Interpreta los filtros game-specific de la query string. Reglas (AC#3):
 *
 * - Un param registrado (domain/energy/might/type/supertype/rarity/color)
 *   presente sin `tcg`, o con un `tcg` que no lo registra, es un 400
 *   `filter_requires_tcg` — se RECHAZA, nunca se ignora en silencio.
 * - Con el `tcg` correcto, un valor que no matchea el vocabulario (case-
 *   insensitive) es un 400 `invalid_filter` con `supported`.
 * - Sin ningún param game-specific presente, devuelve `conditions: []` sin
 *   importar el `tcg` — no hay filtro que aplicar.
 * - Invariante (TASK-049): un param válido para el `tcg` activo NUNCA 400ea
 *   solo porque otro juego también lo registra (p.ej. `type`/`rarity` los
 *   registran mtg y riftbound); el spec efectivo siempre sale de
 *   `GAME_FILTERS[tcg]`, nunca de qué otro juego comparte el nombre.
 *
 * `requiresTcg` en el 400 `filter_requires_tcg` usa el PRIMER juego que
 * registra el param (orden de declaración en `GAME_FILTERS`) cuando el param
 * lo registra más de uno: es ambiguo a propósito — no hay forma de saber cuál
 * de los juegos "quiso decir" el cliente sin `tcg`, así que se documenta la
 * ambigüedad en vez de resolverla con una heurística frágil.
 *
 * `query` recibe el nombre del param y devuelve sus valores repetidos (usar
 * `c.req.queries(name)` de Hono en la ruta).
 */
export function parseGameFilters(
  tcg: Tcg | undefined,
  query: (name: string) => string[] | undefined,
): GameFilterResult {
  const specsForTcg = tcg ? (GAME_FILTERS[tcg] ?? []) : []
  const specByParam = new Map(specsForTcg.map((spec) => [spec.param, spec]))

  const conditions: SQL[] = []
  const applied: AppliedFilter[] = []

  for (const [param, registration] of ALL_GAME_PARAMS) {
    const values = collectValues(query(param) ?? [])
    if (values.length === 0) continue

    const spec = specByParam.get(param)
    if (!spec) {
      // El param existe en el registro (para OTRO juego, o para ninguno con
      // el tcg activo) pero no para el tcg activo: rechazar, no ignorar
      // (AC#3). `requiresTcg` es el primer juego registrante — ver doc arriba.
      return { ok: false, error: 'filter_requires_tcg', param, requiresTcg: registration.firstTcg }
    }

    if (spec.kind === 'jsonInt') {
      const ints: number[] = []
      for (const raw of values) {
        // Solo dígitos: `Number` aceptaría '0x10', '1e2' o '3.0' como enteros
        // válidos, y un param de faceta no debería tener notaciones alternas.
        const n = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
        if (!Number.isInteger(n) || n < spec.min || n > spec.max) {
          return {
            ok: false,
            error: 'invalid_filter',
            param,
            value: raw,
            supported: [`${spec.min}-${spec.max}`],
          }
        }
        ints.push(n)
      }
      conditions.push(buildJsonIntCondition(spec, ints))
      applied.push({ param, values: ints.map(String) })
      continue
    }

    const canonicalValues: string[] = []
    for (const raw of values) {
      const canonical = matchCanonical(raw, spec.supported)
      if (!canonical) {
        return { ok: false, error: 'invalid_filter', param, value: raw, supported: spec.supported }
      }
      canonicalValues.push(canonical)
    }

    if (spec.kind === 'jsonArray') {
      conditions.push(buildJsonArrayCondition(spec, canonicalValues))
    } else if (spec.kind === 'jsonScalar') {
      conditions.push(buildJsonScalarCondition(spec, canonicalValues))
    } else {
      conditions.push(inArray(spec.column, canonicalValues))
    }
    applied.push({ param, values: canonicalValues })
  }

  return { ok: true, conditions, applied }
}
