/**
 * Consulta de códigos postales contra el corpus SEPOMEX (TASK-061.02).
 *
 * El comprador escribe 5 dígitos en el checkout y de aquí salen estado,
 * municipio y la lista de colonias reales de ese CP. Ver
 * docs/ingenieria/sepomex.md para de dónde salen los datos.
 *
 * Las dependencias se inyectan (`loadSettlements`, `loadCorpusVersion`, `kv`)
 * en vez de recibir un `Db`: mantiene el módulo del lado "puro" que sí cubre
 * vitest en este paquete, y deja el SQL en la ruta, que es donde vive el
 * binding.
 */
import type { SepomexSettlementRow } from '@thepubmarket/db'
import type { PostalCodeLookupResponse, PostalCodeSettlement } from '@thepubmarket/shared'

/**
 * Vigencia del vintage en KV. El corpus se refresca a mano cada varios meses,
 * así que 5 minutos de retraso en notar un cambio no le cuesta nada a nadie —
 * y a cambio evita una consulta a D1 por request solo para saber la versión.
 */
const VERSION_TTL_SECONDS = 300

/**
 * Vigencia del payload por CP. Larga a propósito: la llave incluye la versión
 * del corpus, así que un refresh cambia el prefijo y las entradas viejas dejan
 * de consultarse el mismo día — el TTL solo existe para que se recojan solas.
 */
const LOOKUP_TTL_SECONDS = 60 * 60 * 24 * 30

/**
 * Versión del CONTRATO de la respuesta, distinta del vintage del catálogo.
 *
 * La llave del cache lleva las dos porque cambian por motivos distintos: el
 * vintage cuando se reimporta el catálogo, esta cuando cambia la forma de
 * `PostalCodeLookupResponse`. Sin ella, un deploy que agregue o corrija un
 * campo seguiría sirviendo el payload viejo durante días, con los mismos datos
 * de siempre — se detecta tarde y en producción. **Súbela al tocar la forma.**
 */
const RESPONSE_SCHEMA_VERSION = 1

const versionKey = 'sepomex:ver'
const lookupKey = (corpusVersion: string, postalCode: string) =>
  `sepomex:s${RESPONSE_SCHEMA_VERSION}:${corpusVersion}:${postalCode}`

/** Centinela para "ya pregunté y no hay corpus", y así no repreguntar a D1. */
const NO_CORPUS = '-'

export interface PostalCodeDeps {
  /** Filas del CP, tal cual salen de `sepomex_settlements`. */
  loadSettlements(postalCode: string): Promise<SepomexSettlementRow[]>
  /** Vintage cargado, o null si `sepomex_corpus_meta` está vacía. */
  loadCorpusVersion(): Promise<string | null>
  kv: KVNamespace
}

export interface PostalCodeLookup {
  response: PostalCodeLookupResponse
  /** Solo para tests y métricas: si el payload salió de KV sin tocar D1. */
  cached: boolean
}

/** Respuesta de un CP que no está en el catálogo. No es un error: pasa. */
function notFound(postalCode: string, corpusVersion: string | null): PostalCodeLookupResponse {
  return {
    postalCode,
    found: false,
    state: null,
    stateCode: null,
    municipality: null,
    municipalityCode: null,
    city: null,
    settlements: [],
    corpusVersion,
  }
}

/**
 * Arma la respuesta a partir de las filas del CP. Pura.
 *
 * Estado y municipio se toman de la primera fila: ningún CP cruza dos, y está
 * verificado sobre el catálogo completo.
 *
 * La ciudad se calcula ignorando las filas que no la traen. En 324 CPs
 * conviven asentamientos con ciudad y sin ella (típico de un CP que abarca
 * mancha urbana y rancherías); tomar el vacío como un valor más dejaría sin
 * autocompletar la ciudad a un comprador cuya colonia sí la tiene. Ningún CP
 * del catálogo tiene HOY dos ciudades distintas, pero si SEPOMEX publicara
 * una, la respuesta omite la ciudad a nivel CP en vez de inventar una: el
 * cliente siempre tiene la de cada asentamiento.
 */
export function buildLookupResponse(
  postalCode: string,
  rows: SepomexSettlementRow[],
  corpusVersion: string | null,
): PostalCodeLookupResponse {
  const first = rows[0]
  if (!first) return notFound(postalCode, corpusVersion)

  const cities = new Set(rows.flatMap((row) => (row.city === null ? [] : [row.city])))
  const [onlyCity] = cities
  const sharedCity = cities.size === 1 ? (onlyCity ?? null) : null

  const settlements: PostalCodeSettlement[] = rows.map((row) => ({
    id: row.settlementId,
    name: row.settlement,
    type: row.settlementType,
    city: row.city,
    zone: row.zone,
  }))
  // Alfabético por nombre: el orden del catálogo es el consecutivo interno de
  // SEPOMEX, que para un selector de colonias no significa nada. `localeCompare`
  // con 'es' pone "Ñ" y los acentos donde el comprador los busca.
  settlements.sort((a, b) => a.name.localeCompare(b.name, 'es'))

  return {
    postalCode,
    found: true,
    state: first.state,
    stateCode: first.stateCode,
    municipality: first.municipality,
    municipalityCode: first.municipalityCode,
    city: sharedCity,
    settlements,
    corpusVersion,
  }
}

/**
 * Vintage cargado, memorizado en KV.
 *
 * La ausencia de corpus también se cachea (`NO_CORPUS`): un ambiente donde
 * todavía no se importó el catálogo no debe pagar una consulta a D1 en cada
 * request para volver a enterarse de lo mismo.
 */
async function resolveCorpusVersion(deps: PostalCodeDeps): Promise<string | null> {
  const cached = await deps.kv.get(versionKey)
  if (cached !== null) return cached === NO_CORPUS ? null : cached

  const version = await deps.loadCorpusVersion()
  await deps.kv.put(versionKey, version ?? NO_CORPUS, { expirationTtl: VERSION_TTL_SECONDS })
  return version
}

/**
 * Consulta un CP, con cache en KV llaveado por la versión del corpus.
 *
 * Ese llaveado es lo que hace la invalidación gratis: al importar un catálogo
 * nuevo cambia el prefijo y nadie vuelve a leer las entradas viejas, que se
 * recogen solas por TTL. Sin él habría que recordar purgar el cache en cada
 * refresh, y eso se olvida exactamente una vez.
 *
 * `postalCode` debe venir ya validado (`isValidPostalCode`); aquí no se
 * revalida para no duplicar la regla.
 */
export async function lookupPostalCode(
  deps: PostalCodeDeps,
  postalCode: string,
): Promise<PostalCodeLookup> {
  const corpusVersion = await resolveCorpusVersion(deps)
  // Sin corpus no hay nada que consultar ni que cachear por versión.
  if (corpusVersion === null) {
    return { response: notFound(postalCode, null), cached: false }
  }

  const key = lookupKey(corpusVersion, postalCode)
  const hit = await deps.kv.get<PostalCodeLookupResponse>(key, 'json')
  if (hit) return { response: hit, cached: true }

  const response = buildLookupResponse(
    postalCode,
    await deps.loadSettlements(postalCode),
    corpusVersion,
  )
  // Los CP inexistentes también se cachean: un typo repetido es tan común como
  // un acierto, y sin esto cada uno cuesta una consulta a D1.
  await deps.kv.put(key, JSON.stringify(response), { expirationTtl: LOOKUP_TTL_SECONDS })
  return { response, cached: false }
}
