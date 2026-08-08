/**
 * Emparejamiento de tiendas por ciudad (TASK-061.05).
 *
 * El caso que motivó todo: dos tiendas de la CDMX que no se emparejaban porque
 * una decía "CDMX" y la otra "Ciudad de México".
 */
import type { PostalCodeLookupResponse } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import { isSameLocality, resolveStoreLocality } from './store-locality'

const lookup = (over: Partial<PostalCodeLookupResponse> = {}): PostalCodeLookupResponse => ({
  postalCode: '06140',
  found: true,
  state: 'Ciudad de México',
  stateCode: '09',
  municipality: 'Cuauhtémoc',
  municipalityCode: '015',
  city: 'Ciudad de México',
  settlements: [],
  corpusVersion: '2026-08-06',
  ...over,
})

describe('resolveStoreLocality', () => {
  it('usa la ciudad del catálogo como llave, no el municipio', () => {
    // Es lo que hace que Condesa y Coyoacán sigan siendo la misma ciudad.
    const condesa = resolveStoreLocality(lookup())
    const coyoacan = resolveStoreLocality(
      lookup({ postalCode: '04000', municipality: 'Coyoacán', municipalityCode: '003' }),
    )

    expect(condesa?.localityKey).toBe(coyoacan?.localityKey)
    expect(condesa?.municipality).toBe('Cuauhtémoc')
    expect(coyoacan?.municipality).toBe('Coyoacán')
  })

  it('cae al municipio cuando el CP no trae ciudad', () => {
    // Dos de cada tres asentamientos del país no la traen.
    const rural = resolveStoreLocality(
      lookup({
        postalCode: '99930',
        state: 'Zacatecas',
        stateCode: '32',
        municipality: 'Tlaltenango',
        city: null,
      }),
    )
    expect(rural?.localityKey).toBe('32:tlaltenango')
  })

  it('separa municipios homónimos de estados distintos', () => {
    const jalisco = resolveStoreLocality(
      lookup({
        state: 'Jalisco',
        stateCode: '14',
        municipality: 'Guadalajara',
        city: 'Guadalajara',
      }),
    )
    const zacatecas = resolveStoreLocality(
      lookup({ state: 'Zacatecas', stateCode: '32', municipality: 'Guadalupe', city: 'Guadalupe' }),
    )
    expect(jalisco?.localityKey).not.toBe(zacatecas?.localityKey)
  })

  it('devuelve null cuando el catálogo no conoce el CP', () => {
    expect(
      resolveStoreLocality(lookup({ found: false, state: null, municipality: null, city: null })),
    ).toBeNull()
  })
})

describe('isSameLocality', () => {
  const cdmx = '09:ciudad de mexico'

  it('empareja "CDMX" con "Ciudad de México" — el bug que originó la task', () => {
    expect(
      isSameLocality(
        { localityKey: cdmx, city: 'CDMX' },
        { localityKey: cdmx, city: 'Ciudad de México' },
      ),
    ).toBe(true)
  })

  it('empareja dos alcaldías distintas de la misma ciudad', () => {
    expect(
      isSameLocality(
        { localityKey: cdmx, city: 'Coyoacán' },
        { localityKey: cdmx, city: 'Cuauhtémoc' },
      ),
    ).toBe(true)
  })

  it('no empareja ciudades distintas', () => {
    expect(
      isSameLocality(
        { localityKey: cdmx, city: 'CDMX' },
        { localityKey: '19:monterrey', city: 'Monterrey' },
      ),
    ).toBe(false)
  })

  it('una tienda sin CP sigue emparejando por su ciudad de texto libre', () => {
    // AC #5: nadie se cae del checkout por no tener el dato nuevo.
    expect(
      isSameLocality(
        { localityKey: null, city: 'Guadalajara' },
        { localityKey: '14:guadalajara', city: 'Guadalajara' },
      ),
    ).toBe(true)
  })

  it('el texto libre rescata a dos tiendas de la misma zona metropolitana', () => {
    // SEPOMEX no modela zonas metropolitanas: Zapopan y Guadalajara son
    // ciudades distintas para el catálogo. Si el humano escribió lo mismo en
    // las dos, se respeta — la comparación suma caminos, no los quita.
    expect(
      isSameLocality(
        { localityKey: '14:zapopan', city: 'Guadalajara' },
        { localityKey: '14:guadalajara', city: 'Guadalajara' },
      ),
    ).toBe(true)
  })

  it('dos tiendas sin ciudad ni llave no se emparejan a ciegas', () => {
    expect(
      isSameLocality({ localityKey: null, city: null }, { localityKey: null, city: null }),
    ).toBe(false)
    expect(isSameLocality({ localityKey: null, city: '' }, { localityKey: null, city: '  ' })).toBe(
      false,
    )
  })
})
