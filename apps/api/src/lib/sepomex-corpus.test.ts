/**
 * Contrato del catálogo SEPOMEX (TASK-061.01).
 *
 * El parser vive en @thepubmarket/shared porque lo comparten el importer (Node)
 * y el Worker; los tests viven aquí porque apps/api es el único proyecto con
 * vitest en el repo.
 *
 * Los casos raros NO son inventados: salen de medir el archivo real de
 * 159,006 filas — 104 mil sin ciudad, 46 nombres con coma, 16 con comillas.
 */
import { normalizeAddressPart, parseSepomexCatalog } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'

const LICENSE =
  'El Catálogo Nacional de Códigos Postales, es elaborado por Correos de México y se proporciona en forma gratuita para uso particular.'
const HEADER =
  'd_codigo|d_asenta|d_tipo_asenta|D_mnpio|d_estado|d_ciudad|d_CP|c_estado|c_oficina|c_CP|c_tipo_asenta|c_mnpio|id_asenta_cpcons|d_zona|c_cve_ciudad'

/** Fila real del catálogo: San Ángel, Álvaro Obregón, CDMX. */
const ROW_CDMX =
  '01000|San Ángel|Colonia|Álvaro Obregón|Ciudad de México|Ciudad de México|01001|09|01001||09|010|0001|Urbano|01'
/** Fila rural real: sin ciudad, que es el caso de 2 de cada 3 filas. */
const ROW_RURAL =
  '99930|El Ñangó|Ranchería|Tlaltenango|Zacatecas||99930|32|99930||14|045|0007|Rural|'

const catalog = (...rows: string[]) => [LICENSE, HEADER, ...rows, ''].join('\r\n')

describe('parseSepomexCatalog', () => {
  it('salta el aviso de uso y arranca en la cabecera', () => {
    const { settlements, headerLine } = parseSepomexCatalog(catalog(ROW_CDMX))
    expect(headerLine).toBe(2)
    expect(settlements).toHaveLength(1)
  })

  it('mapea una fila completa a las columnas del esquema', () => {
    const [row] = parseSepomexCatalog(catalog(ROW_CDMX)).settlements
    expect(row).toMatchObject({
      postalCode: '01000',
      settlementId: '0001',
      settlement: 'San Ángel',
      settlementType: 'Colonia',
      municipality: 'Álvaro Obregón',
      state: 'Ciudad de México',
      city: 'Ciudad de México',
      zone: 'Urbano',
      stateCode: '09',
      municipalityCode: '010',
      cityCode: '01',
    })
  })

  it('conserva acentos y ñ intactos', () => {
    const [row] = parseSepomexCatalog(catalog(ROW_RURAL)).settlements
    expect(row?.settlement).toBe('El Ñangó')
    expect(row?.settlement).not.toContain('�')
  })

  it('convierte ciudad vacía en NULL, no en cadena vacía', () => {
    const [row] = parseSepomexCatalog(catalog(ROW_RURAL)).settlements
    expect(row?.city).toBeNull()
    expect(row?.cityNorm).toBeNull()
    expect(row?.cityCode).toBeNull()
  })

  it('no se rompe con comas, comillas ni apóstrofos en el nombre', () => {
    const rows = [
      '26506|Lunas, Flores y Rosas|Colonia|Nava|Coahuila de Zaragoza||26506|05|26506||09|024|0003|Rural|',
      '32737|CEFERESO No. 9 "Norte"|Colonia|Juárez|Chihuahua|Juárez|32000|08|32000||09|037|0011|Urbano|02',
      "20100|Rancho L'Ocaso|Rancho|Aguascalientes|Aguascalientes||20100|01|20100||18|001|0004|Rural|",
    ]
    const { settlements } = parseSepomexCatalog(catalog(...rows))
    expect(settlements.map((s) => s.settlement)).toEqual([
      'Lunas, Flores y Rosas',
      'CEFERESO No. 9 "Norte"',
      "Rancho L'Ocaso",
    ])
  })

  it('precalcula las columnas normalizadas con el mismo normalizador del runtime', () => {
    const [row] = parseSepomexCatalog(catalog(ROW_CDMX)).settlements
    expect(row?.settlementNorm).toBe('san angel')
    expect(row?.municipalityNorm).toBe('alvaro obregon')
    expect(row?.stateNorm).toBe(normalizeAddressPart('CIUDAD DE MÉXICO'))
  })

  it('tolera CRLF y líneas vacías al final', () => {
    const text = `${LICENSE}\r\n${HEADER}\r\n${ROW_CDMX}\r\n\r\n\r\n`
    expect(parseSepomexCatalog(text).settlements).toHaveLength(1)
  })

  it('aborta si la cabecera cambió — el formato es posicional y sin tipos', () => {
    const text = [LICENSE, HEADER.replace('d_asenta|', 'd_asentamiento|'), ROW_CDMX].join('\n')
    expect(() => parseSepomexCatalog(text)).toThrow(/cabecera no coincide/)
  })

  it('aborta si no hay cabecera', () => {
    expect(() => parseSepomexCatalog(`${LICENSE}\n${ROW_CDMX}`)).toThrow(
      /no se encontró la cabecera/,
    )
  })

  it('aborta ante una fila con menos campos de los esperados', () => {
    const text = catalog('01000|San Ángel|Colonia|Álvaro Obregón|Ciudad de México')
    expect(() => parseSepomexCatalog(text)).toThrow(/línea 3.*15 campos.*5/s)
  })

  it('aborta ante un código postal que no es de 5 dígitos', () => {
    const text = catalog(ROW_CDMX.replace('01000|', '1000|'))
    expect(() => parseSepomexCatalog(text)).toThrow(/no es un CP de 5 dígitos/)
  })

  it('aborta ante una llave (CP, consecutivo) repetida', () => {
    // El esquema la asume única; si SEPOMEX la duplicara, INSERT OR REPLACE
    // colapsaría dos asentamientos en uno sin que nadie se entere.
    expect(() => parseSepomexCatalog(catalog(ROW_CDMX, ROW_CDMX))).toThrow(/repetidas/)
  })

  it('aborta si el archivo no trae asentamientos', () => {
    expect(() => parseSepomexCatalog(`${LICENSE}\n${HEADER}\n`)).toThrow(/ningún asentamiento/)
  })
})

describe('normalizeAddressPart', () => {
  it('pliega acentos y mayúsculas', () => {
    expect(normalizeAddressPart('Álvaro Obregón')).toBe('alvaro obregon')
    expect(normalizeAddressPart('CIUDAD DE MÉXICO')).toBe('ciudad de mexico')
  })

  it('colapsa espacios repetidos y recorta', () => {
    expect(normalizeAddressPart('  San   Ángel  ')).toBe('san angel')
  })

  it('pliega la ñ a n — el comprador rara vez la escribe', () => {
    // Decisión de recall: la llave normalizada solo se usa para EMPAREJAR.
    // Lo que se le muestra al comprador y lo que lee el mensajero siempre sale
    // de la columna sin normalizar, así que "Cañada" nunca se degrada a
    // "Canada" en pantalla. Mismo criterio que el normalizeCity que ya existe
    // en delivery.ts, para que ambos coincidan.
    expect(normalizeAddressPart('Cañada')).toBe('canada')
  })

  it('devuelve cadena vacía para null y undefined', () => {
    expect(normalizeAddressPart(null)).toBe('')
    expect(normalizeAddressPart(undefined)).toBe('')
  })

  it('NO sabe que CDMX y Ciudad de México son el mismo lugar', () => {
    // Documenta el límite a propósito: eso son alias, y se resuelven con las
    // claves numéricas de SEPOMEX, no aquí. Ver TASK-061.05.
    expect(normalizeAddressPart('CDMX')).not.toBe(normalizeAddressPart('Ciudad de México'))
  })
})
