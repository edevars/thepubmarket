/**
 * Consulta de CP y su cache (TASK-061.02).
 *
 * Las filas de ejemplo son reales del catálogo 2026-08-06: 09630 (varios
 * asentamientos), 01000 (uno solo) y 20174 (mezcla urbana y rural, con una
 * fila sin ciudad — el caso de 324 CPs). El de dos ciudades distintas en un
 * mismo CP es hipotético: hoy no existe ninguno, y el test cubre la rama para
 * que un cambio río arriba no autocomplete una ciudad equivocada.
 */
import type { SepomexSettlementRow } from '@thepubmarket/db'
import { describe, expect, it, vi } from 'vitest'
import { createFakeKV } from '../test/fake-kv'
import { buildLookupResponse, lookupPostalCode, type PostalCodeDeps } from './postal-codes'

const VERSION = '2026-08-06'

function row(overrides: Partial<SepomexSettlementRow>): SepomexSettlementRow {
  return {
    postalCode: '09630',
    settlementId: '0001',
    settlement: 'Sinatel',
    settlementType: 'Colonia',
    municipality: 'Iztapalapa',
    state: 'Ciudad de México',
    city: 'Ciudad de México',
    zone: 'Urbano',
    stateCode: '09',
    municipalityCode: '007',
    cityCode: '01',
    settlementNorm: 'sinatel',
    municipalityNorm: 'iztapalapa',
    stateNorm: 'ciudad de mexico',
    cityNorm: 'ciudad de mexico',
    corpusVersion: VERSION,
    ...overrides,
  }
}

/** Deps con un loader espiable, para poder afirmar que el cache evita la BD. */
function deps(rows: SepomexSettlementRow[], version: string | null = VERSION) {
  const loadSettlements = vi.fn(async () => rows)
  const loadCorpusVersion = vi.fn(async () => version)
  const d: PostalCodeDeps = { kv: createFakeKV(), loadSettlements, loadCorpusVersion }
  return { deps: d, loadSettlements, loadCorpusVersion }
}

describe('buildLookupResponse', () => {
  it('devuelve estado, municipio y todas las colonias del CP', () => {
    const res = buildLookupResponse(
      '09630',
      [
        row({ settlementId: '0001', settlement: 'Sinatel' }),
        row({ settlementId: '0002', settlement: 'Los Ángeles', settlementType: 'Barrio' }),
      ],
      VERSION,
    )

    expect(res.found).toBe(true)
    expect(res.state).toBe('Ciudad de México')
    expect(res.stateCode).toBe('09')
    expect(res.municipality).toBe('Iztapalapa')
    expect(res.settlements).toHaveLength(2)
    expect(res.settlements.map((s) => s.name)).toEqual(['Los Ángeles', 'Sinatel'])
    expect(res.settlements[1]).toMatchObject({ id: '0001', type: 'Colonia', zone: 'Urbano' })
    expect(res.corpusVersion).toBe(VERSION)
  })

  it('ordena las colonias alfabéticamente en español, no por el consecutivo de SEPOMEX', () => {
    const res = buildLookupResponse(
      '09630',
      [
        row({ settlementId: '0001', settlement: 'Zacatecas' }),
        row({ settlementId: '0002', settlement: 'Ñuble' }),
        row({ settlementId: '0003', settlement: 'Álamos' }),
      ],
      VERSION,
    )
    expect(res.settlements.map((s) => s.name)).toEqual(['Álamos', 'Ñuble', 'Zacatecas'])
  })

  it('sirve un CP de un solo asentamiento', () => {
    const res = buildLookupResponse(
      '01000',
      [
        row({
          postalCode: '01000',
          settlement: 'San Ángel',
          municipality: 'Álvaro Obregón',
          municipalityCode: '010',
        }),
      ],
      VERSION,
    )
    expect(res.settlements).toHaveLength(1)
    expect(res.settlements[0]?.name).toBe('San Ángel')
    expect(res.municipality).toBe('Álvaro Obregón')
    expect(res.city).toBe('Ciudad de México')
  })

  it('ignora los asentamientos sin ciudad al resolver la ciudad del CP', () => {
    // El caso de 324 CPs reales: mancha urbana y ranchería en el mismo código.
    // Contar el vacío como un valor más dejaría sin autocompletar la ciudad a
    // un comprador cuya colonia sí la tiene.
    const res = buildLookupResponse(
      '20174',
      [
        row({
          postalCode: '20174',
          settlementId: '0088',
          settlement: 'Lomas de Bellavista',
          city: 'Aguascalientes',
        }),
        row({
          postalCode: '20174',
          settlementId: '1116',
          settlement: 'El Rocío',
          city: null,
          zone: 'Rural',
        }),
      ],
      VERSION,
    )
    expect(res.city).toBe('Aguascalientes')
    expect(res.settlements.map((s) => [s.name, s.city])).toEqual([
      ['El Rocío', null],
      ['Lomas de Bellavista', 'Aguascalientes'],
    ])
  })

  it('omite la ciudad del CP si hubiera dos distintas, en vez de inventar una', () => {
    // Hoy no pasa en el catálogo; la rama existe para que un cambio río arriba
    // no autocomplete una ciudad equivocada.
    const res = buildLookupResponse(
      '62790',
      [
        row({
          postalCode: '62790',
          settlementId: '0001',
          settlement: 'Atlacholoaya',
          city: 'Xochitepec',
        }),
        row({
          postalCode: '62790',
          settlementId: '0002',
          settlement: 'Benito Juárez',
          city: 'Alpuyeca',
        }),
      ],
      VERSION,
    )
    expect(res.city).toBeNull()
    expect(res.settlements.map((s) => s.city)).toEqual(['Xochitepec', 'Alpuyeca'])
  })

  it('propaga una ciudad vacía como null sin perder el asentamiento', () => {
    const res = buildLookupResponse(
      '20174',
      [row({ postalCode: '20174', settlement: 'El Rocío', city: null, zone: 'Rural' })],
      VERSION,
    )
    expect(res.found).toBe(true)
    expect(res.city).toBeNull()
    expect(res.settlements[0]).toMatchObject({ name: 'El Rocío', city: null, zone: 'Rural' })
  })

  it('un CP sin filas es "no encontrado", no un error', () => {
    const res = buildLookupResponse('99999', [], VERSION)
    expect(res.found).toBe(false)
    expect(res.settlements).toEqual([])
    expect(res.state).toBeNull()
    expect(res.corpusVersion).toBe(VERSION)
  })
})

describe('lookupPostalCode', () => {
  it('consulta la base la primera vez y sirve de cache la segunda', async () => {
    const { deps: d, loadSettlements } = deps([row({})])

    const first = await lookupPostalCode(d, '09630')
    expect(first.cached).toBe(false)
    expect(loadSettlements).toHaveBeenCalledTimes(1)

    const second = await lookupPostalCode(d, '09630')
    expect(second.cached).toBe(true)
    expect(second.response).toEqual(first.response)
    // La afirmación que importa del AC: un hit no toca D1.
    expect(loadSettlements).toHaveBeenCalledTimes(1)
  })

  it('cachea también los CP inexistentes — un typo repetido es tan común como un acierto', async () => {
    const { deps: d, loadSettlements } = deps([])

    expect((await lookupPostalCode(d, '99999')).response.found).toBe(false)
    expect((await lookupPostalCode(d, '99999')).cached).toBe(true)
    expect(loadSettlements).toHaveBeenCalledTimes(1)
  })

  it('lee la versión del corpus una sola vez mientras siga vigente en KV', async () => {
    const { deps: d, loadCorpusVersion } = deps([row({})])

    await lookupPostalCode(d, '09630')
    await lookupPostalCode(d, '01000')
    expect(loadCorpusVersion).toHaveBeenCalledTimes(1)
  })

  it('un corpus nuevo invalida el cache sin purgarlo: la llave lleva la versión', async () => {
    const kv = createFakeKV()
    const viejo: PostalCodeDeps = {
      kv,
      loadSettlements: async () => [row({ settlement: 'Nombre viejo' })],
      loadCorpusVersion: async () => '2026-01-01',
    }
    await lookupPostalCode(viejo, '09630')

    // Se importa un catálogo nuevo. Se vence la memoria del vintage (TTL de 5
    // min) igual que en producción; nadie purga nada a mano.
    await kv.delete('sepomex:ver')
    const nuevo: PostalCodeDeps = {
      kv,
      loadSettlements: async () => [row({ settlement: 'Nombre nuevo' })],
      loadCorpusVersion: async () => '2026-08-06',
    }

    const res = await lookupPostalCode(nuevo, '09630')
    expect(res.cached).toBe(false)
    expect(res.response.settlements[0]?.name).toBe('Nombre nuevo')
    expect(res.response.corpusVersion).toBe('2026-08-06')
  })

  it('degrada a "no encontrado" cuando el corpus todavía no se ha importado', async () => {
    // Es el estado real de un ambiente recién migrado: las tablas existen y
    // están vacías. El checkout tiene que seguir funcionando a mano.
    const { deps: d, loadSettlements } = deps([], null)

    const res = await lookupPostalCode(d, '09630')
    expect(res.response.found).toBe(false)
    expect(res.response.corpusVersion).toBeNull()
    expect(loadSettlements).not.toHaveBeenCalled()
  })

  it('no vuelve a preguntarle a la base por un corpus ausente en cada request', async () => {
    const { deps: d, loadCorpusVersion } = deps([], null)

    await lookupPostalCode(d, '09630')
    await lookupPostalCode(d, '09630')
    expect(loadCorpusVersion).toHaveBeenCalledTimes(1)
  })
})
