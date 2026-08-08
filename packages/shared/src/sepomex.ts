/**
 * Catálogo Nacional de Códigos Postales (SEPOMEX) — formato de la fuente.
 *
 * Vive en el paquete compartido, no en el script de importación, porque el
 * normalizador de `normalizeAddressPart` lo necesitan DOS runtimes: el importer
 * (que precalcula las columnas `*_norm` de D1) y el Worker (que compara la
 * dirección que escribe el comprador contra esas columnas). Si cada uno tuviera
 * su copia, un cambio en uno rompería el match del otro en silencio: las filas
 * quedarían indexadas con una normalización y consultadas con otra.
 *
 * El parser NO hace I/O: recibe el texto ya decodificado. Descargar, descomprimir
 * y decodificar latin1 es trabajo de `scripts/import-sepomex.mjs`.
 */

/**
 * Campos del export TXT, en orden y con el mismo casing irregular que publica
 * Correos de México (`D_mnpio`, `d_CP`, `c_CP`).
 *
 * El parser aborta si la cabecera no coincide exactamente. Es deliberado: el
 * formato es posicional y sin tipos, así que un campo renombrado o reordenado
 * río arriba no produce un error de parseo — produce 159 mil direcciones con
 * el municipio en la columna del estado. La cabecera es la única señal de
 * integridad que da la fuente; se trata como contrato.
 */
export const SEPOMEX_HEADER_FIELDS = [
  'd_codigo',
  'd_asenta',
  'd_tipo_asenta',
  'D_mnpio',
  'd_estado',
  'd_ciudad',
  'd_CP',
  'c_estado',
  'c_oficina',
  'c_CP',
  'c_tipo_asenta',
  'c_mnpio',
  'id_asenta_cpcons',
  'd_zona',
  'c_cve_ciudad',
] as const

/** Separador de campos del export. */
const FIELD_SEPARATOR = '|'

/**
 * Un asentamiento del catálogo, ya mapeado a los nombres del esquema de D1.
 *
 * Se descartan tres campos de la fuente: `c_CP` (vacío en las 159 mil filas),
 * `c_oficina` y `d_CP` (identifican la oficina postal que atiende el CP, no la
 * dirección del comprador — nada en el epic los usa).
 */
export interface SepomexSettlement {
  /** CP del asentamiento, 5 dígitos. */
  postalCode: string
  /** Consecutivo del asentamiento DENTRO del CP. Único junto con postalCode. */
  settlementId: string
  /** Nombre del asentamiento tal cual lo publica SEPOMEX, con acentos. */
  settlement: string
  /** Colonia, Pueblo, Fraccionamiento, Zona industrial… (24 valores). */
  settlementType: string
  municipality: string
  state: string
  /**
   * Vacío en ~2 de cada 3 filas (fuera de zonas metropolitanas SEPOMEX no
   * asigna ciudad) y NO es función del CP: 324 CPs tienen asentamientos en
   * más de una ciudad. Por eso vive en la fila, no en una tabla por CP.
   */
  city: string | null
  /** Urbano | Semiurbano | Rural. */
  zone: string
  /** Clave numérica de estado de SEPOMEX ('09' = Ciudad de México). */
  stateCode: string
  /** Clave numérica de municipio, única dentro del estado. */
  municipalityCode: string
  cityCode: string | null
  /** Claves plegadas para matching; ver normalizeAddressPart. */
  settlementNorm: string
  municipalityNorm: string
  stateNorm: string
  cityNorm: string | null
}

/** Resultado del parseo, con lo necesario para verificar la corrida. */
export interface SepomexParseResult {
  settlements: SepomexSettlement[]
  /** Línea (1-based) donde apareció la cabecera; antes va el aviso de uso. */
  headerLine: number
}

/**
 * Forma comparable de un componente de dirección: sin acentos, sin
 * mayúsculas, sin espacios de más.
 *
 * Es lo que permite que "Álvaro Obregón", "ALVARO OBREGON" y "  alvaro
 * obregon " sean la misma llave. La ñ también se pliega a n ("Cañada" →
 * "canada"): la llave existe SOLO para emparejar, y el comprador rara vez
 * teclea la ñ. Lo que se muestra y lo que lee el mensajero sale siempre de la
 * columna sin normalizar, así que nada se degrada en pantalla.
 *
 * No intenta saber que CDMX y Ciudad de México son el mismo lugar — eso son
 * alias, no normalización, y se resuelve con las claves numéricas
 * (`stateCode`, `municipalityCode`), no con heurísticas de texto.
 */
export function normalizeAddressPart(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** True si el string es un CP mexicano válido (exactamente 5 dígitos). */
export function isValidPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value)
}

/**
 * Parsea el contenido de `CPdescarga.txt` ya decodificado a UTF-8.
 *
 * Tolera lo que la fuente sí hace: un aviso de uso antes de la cabecera, CRLF,
 * líneas vacías al final, y campos vacíos (`d_ciudad` lo está en 104 mil filas).
 * Aborta con la línea exacta ante cualquier otra cosa — cabecera distinta,
 * conteo de campos diferente, CP que no es de 5 dígitos, o una llave
 * (CP, consecutivo) repetida. Importar reference data a medias es peor que no
 * importarla: nadie se entera hasta que un comprador ve su colonia mal.
 */
export function parseSepomexCatalog(text: string): SepomexParseResult {
  const lines = text.split(/\r?\n/)
  const expectedHeader = SEPOMEX_HEADER_FIELDS.join(FIELD_SEPARATOR)

  const headerIndex = lines.findIndex((line) => line.startsWith(`${SEPOMEX_HEADER_FIELDS[0]}|`))
  if (headerIndex === -1) {
    throw new Error(
      `SEPOMEX: no se encontró la cabecera (ninguna línea empieza con "${SEPOMEX_HEADER_FIELDS[0]}|"). ¿Cambió el formato del export?`,
    )
  }
  const header = lines[headerIndex]?.trim() ?? ''
  if (header !== expectedHeader) {
    throw new Error(
      `SEPOMEX: la cabecera no coincide con el contrato.\n  esperada: ${expectedHeader}\n  recibida: ${header}`,
    )
  }

  const settlements: SepomexSettlement[] = []
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]
    if (raw === undefined) continue
    const line = raw.trim()
    if (line === '') continue

    const lineNumber = i + 1
    const fields = line.split(FIELD_SEPARATOR)
    if (fields.length !== SEPOMEX_HEADER_FIELDS.length) {
      throw new Error(
        `SEPOMEX línea ${lineNumber}: se esperaban ${SEPOMEX_HEADER_FIELDS.length} campos y llegaron ${fields.length}.`,
      )
    }

    const value = (index: number) => fields[index]?.trim() ?? ''
    const optional = (index: number) => {
      const v = value(index)
      return v === '' ? null : v
    }

    const postalCode = value(0)
    if (!isValidPostalCode(postalCode)) {
      throw new Error(`SEPOMEX línea ${lineNumber}: "${postalCode}" no es un CP de 5 dígitos.`)
    }

    const settlementId = value(12)
    if (settlementId === '') {
      throw new Error(
        `SEPOMEX línea ${lineNumber}: id_asenta_cpcons vacío para el CP ${postalCode}.`,
      )
    }

    const key = `${postalCode}-${settlementId}`
    if (seen.has(key)) {
      duplicates.push(`${key} (línea ${lineNumber})`)
      continue
    }
    seen.add(key)

    const city = optional(5)
    settlements.push({
      postalCode,
      settlementId,
      settlement: value(1),
      settlementType: value(2),
      municipality: value(3),
      state: value(4),
      city,
      zone: value(13),
      stateCode: value(7),
      municipalityCode: value(11),
      cityCode: optional(14),
      settlementNorm: normalizeAddressPart(value(1)),
      municipalityNorm: normalizeAddressPart(value(3)),
      stateNorm: normalizeAddressPart(value(4)),
      cityNorm: city === null ? null : normalizeAddressPart(city),
    })
  }

  if (duplicates.length > 0) {
    throw new Error(
      `SEPOMEX: ${duplicates.length} llave(s) (CP, id_asenta_cpcons) repetidas, que el esquema asume únicas. Primeras: ${duplicates.slice(0, 5).join(', ')}`,
    )
  }

  if (settlements.length === 0) {
    throw new Error('SEPOMEX: el archivo no trajo ningún asentamiento después de la cabecera.')
  }

  return { settlements, headerLine: headerIndex + 1 }
}

// =====================================================================
// Contrato del endpoint público de consulta por CP (TASK-061.02).
// =====================================================================

/** Un asentamiento como lo ve el cliente: sin claves internas ni columnas norm. */
export interface PostalCodeSettlement {
  /** Consecutivo dentro del CP; estable entre versiones del catálogo. */
  id: string
  name: string
  /** Colonia, Pueblo, Fraccionamiento… Se muestra junto al nombre. */
  type: string
  /** null cuando SEPOMEX no la asigna (2 de cada 3 asentamientos del país). */
  city: string | null
  /** Urbano | Semiurbano | Rural. */
  zone: string
}

/**
 * Respuesta de `GET /address/postal-codes/:postalCode`.
 *
 * Estado y municipio viven a nivel CP porque ningún CP cruza dos (verificado
 * sobre el catálogo completo). La ciudad se resuelve ignorando los
 * asentamientos que no la traen —324 CPs mezclan mancha urbana con rancherías
 * sin ciudad— y se omite si hubiera dos distintas. El valor por asentamiento
 * siempre está en `settlements[].city`.
 */
export interface PostalCodeLookupResponse {
  postalCode: string
  /** false = CP bien formado pero ausente del catálogo. No es un error. */
  found: boolean
  state: string | null
  stateCode: string | null
  municipality: string | null
  municipalityCode: string | null
  /** Única ciudad no vacía del CP; null si no hay ninguna o si hubiera varias. */
  city: string | null
  settlements: PostalCodeSettlement[]
  /** Vintage del catálogo cargado (ISO). null = corpus aún no importado. */
  corpusVersion: string | null
}
