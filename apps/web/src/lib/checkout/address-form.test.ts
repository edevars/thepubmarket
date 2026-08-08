/**
 * Reglas de la dirección de envío al resolver un CP (TASK-061.03).
 *
 * Lo que se prueba aquí es lo que decide si un comprador termina con una
 * dirección coherente o con la colonia de un CP y el estado de otro.
 */
import type { PostalCodeLookupResponse, PostalCodeSettlement } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import {
  applyLookup,
  EMPTY_ADDRESS,
  firstInvalidField,
  isPostalCodeInvalid,
  missingFields,
  toShippingAddress,
} from './address-form'

const settlement = (id: string, name: string, extra?: Partial<PostalCodeSettlement>) => ({
  id,
  name,
  type: 'Colonia',
  city: 'Ciudad de México',
  zone: 'Urbano',
  ...extra,
})

const lookup = (over: Partial<PostalCodeLookupResponse> = {}): PostalCodeLookupResponse => ({
  postalCode: '09630',
  found: true,
  state: 'Ciudad de México',
  stateCode: '09',
  municipality: 'Iztapalapa',
  municipalityCode: '007',
  city: 'Ciudad de México',
  settlements: [settlement('0001', 'Sinatel'), settlement('0002', 'Los Ángeles')],
  corpusVersion: '2026-08-06',
  ...over,
})

const filled = { ...EMPTY_ADDRESS, postalCode: '09630', line1: 'Av. Río Churubusco 500' }

describe('applyLookup', () => {
  it('llena municipio y estado, y ofrece la lista de colonias', () => {
    const result = applyLookup(filled, lookup())

    expect(result.address.city).toBe('Iztapalapa')
    expect(result.address.state).toBe('Ciudad de México')
    expect(result.coloniaMode).toBe('list')
    // Con varias colonias no elige por el comprador.
    expect(result.selectedSettlementId).toBeNull()
    expect(result.address.neighborhood).toBe('')
  })

  it('no toca lo que el comprador ya escribió fuera de la ubicación', () => {
    const result = applyLookup({ ...filled, recipient: 'Ana', line1: 'Calle 5 #12' }, lookup())
    expect(result.address.recipient).toBe('Ana')
    expect(result.address.line1).toBe('Calle 5 #12')
  })

  it('elige sola la colonia cuando el CP solo tiene una', () => {
    const result = applyLookup(
      filled,
      lookup({ settlements: [settlement('0001', 'San Ángel')], municipality: 'Álvaro Obregón' }),
    )
    expect(result.address.neighborhood).toBe('San Ángel')
    expect(result.selectedSettlementId).toBe('0001')
  })

  it('conserva la colonia escrita a mano si el CP nuevo la tiene, ignorando acentos', () => {
    const result = applyLookup({ ...filled, neighborhood: 'los angeles' }, lookup())
    // Se queda con la ortografía del catálogo, que es la que lee el mensajero.
    expect(result.address.neighborhood).toBe('Los Ángeles')
    expect(result.selectedSettlementId).toBe('0002')
  })

  it('descarta la colonia que ya no pertenece al CP nuevo', () => {
    // El caso que este epic existe para evitar: colonia de un código postal
    // conviviendo con el municipio de otro.
    const result = applyLookup(
      { ...filled, neighborhood: 'Sinatel' },
      lookup({
        postalCode: '01000',
        municipality: 'Álvaro Obregón',
        settlements: [settlement('0001', 'San Ángel')],
      }),
    )
    expect(result.address.neighborhood).toBe('San Ángel')
    expect(result.address.neighborhood).not.toBe('Sinatel')
  })

  it('sobreescribe municipio y estado en cada consulta exitosa', () => {
    // Cambiar el CP es un acto deliberado: significa "otro lugar".
    const edited = { ...filled, city: 'Monterrey', state: 'Nuevo León' }
    const result = applyLookup(edited, lookup())
    expect(result.address.city).toBe('Iztapalapa')
    expect(result.address.state).toBe('Ciudad de México')
  })

  it('ante un CP sin registro deja todo como está y pasa a captura manual', () => {
    const typed = {
      ...filled,
      neighborhood: 'Villas del Sol',
      city: 'Tulum',
      state: 'Quintana Roo',
    }
    const result = applyLookup(
      typed,
      lookup({
        found: false,
        state: null,
        stateCode: null,
        municipality: null,
        municipalityCode: null,
        city: null,
        settlements: [],
      }),
    )

    expect(result.address).toEqual(typed)
    expect(result.coloniaMode).toBe('manual')
    expect(result.selectedSettlementId).toBeNull()
  })

  it('un CP encontrado pero sin asentamientos también cae a captura manual', () => {
    const result = applyLookup(filled, lookup({ settlements: [] }))
    expect(result.coloniaMode).toBe('manual')
    expect(result.address.city).toBe('Iztapalapa')
  })
})

describe('missingFields', () => {
  it('la colonia y el interior no son obligatorios: hay domicilios sin ellos', () => {
    const complete = {
      recipient: 'Ana',
      phone: '5512345678',
      line1: 'Calle 5 #12',
      line2: '',
      neighborhood: '',
      city: 'Iztapalapa',
      state: 'Ciudad de México',
      postalCode: '09630',
    }
    expect(missingFields(complete)).toEqual([])
  })

  it('reporta los campos vacíos y los que solo tienen espacios', () => {
    expect(missingFields({ ...EMPTY_ADDRESS, recipient: '   ' })).toContain('recipient')
    expect(missingFields(EMPTY_ADDRESS)).toHaveLength(6)
  })
})

describe('isPostalCodeInvalid', () => {
  it('no marca error mientras el campo está vacío o a medio escribir', () => {
    expect(isPostalCodeInvalid('')).toBe(false)
  })

  it('marca error con menos, más o algo que no sean dígitos', () => {
    expect(isPostalCodeInvalid('1234')).toBe(true)
    expect(isPostalCodeInvalid('123456')).toBe(true)
    expect(isPostalCodeInvalid('0a000')).toBe(true)
  })

  it('acepta un CP de 5 dígitos, con o sin espacios alrededor', () => {
    expect(isPostalCodeInvalid('09630')).toBe(false)
    expect(isPostalCodeInvalid(' 09630 ')).toBe(false)
  })
})

describe('toShippingAddress', () => {
  it('recorta, fija el país y convierte los opcionales vacíos en null', () => {
    const payload = toShippingAddress({
      ...EMPTY_ADDRESS,
      recipient: '  Ana  ',
      phone: ' 5512345678 ',
      line1: ' Calle 5 #12 ',
      line2: '   ',
      neighborhood: ' Sinatel ',
      city: ' Iztapalapa ',
      state: ' Ciudad de México ',
      postalCode: ' 09630 ',
    })

    expect(payload).toEqual({
      recipient: 'Ana',
      phone: '5512345678',
      line1: 'Calle 5 #12',
      line2: null,
      neighborhood: 'Sinatel',
      city: 'Iztapalapa',
      state: 'Ciudad de México',
      postalCode: '09630',
      country: 'MX',
    })
  })
})

describe('firstInvalidField', () => {
  it('manda el foco al CP cuando tiene un formato inválido', () => {
    expect(firstInvalidField([], true)).toBe('postalCode')
  })

  it('elige el primer faltante en el orden en que se pinta el formulario', () => {
    // 'recipient' se pinta al final aunque sea el primero del arreglo de
    // requeridos: el foco debe caer en el campo de más arriba que falte.
    expect(firstInvalidField(['recipient', 'city'], false)).toBe('city')
    expect(firstInvalidField(['recipient', 'phone'], false)).toBe('recipient')
  })

  it('devuelve null cuando no hay nada que corregir', () => {
    expect(firstInvalidField([], false)).toBeNull()
  })
})
