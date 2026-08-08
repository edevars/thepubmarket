/**
 * Cotejo de la dirección de envío contra el corpus (TASK-061.04).
 *
 * La regla que se prueba aquí, más que cada veredicto suelto: NADA de esto
 * bloquea. Lo que decide es qué se guarda en la orden y qué se le avisa a la
 * tienda antes de imprimir la guía.
 */
import type { PostalCodeLookupResponse } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import { addressNeedsReview, checkShippingAddress } from './address-check'

const lookup = (over: Partial<PostalCodeLookupResponse> = {}): PostalCodeLookupResponse => ({
  postalCode: '09630',
  found: true,
  state: 'Ciudad de México',
  stateCode: '09',
  municipality: 'Iztapalapa',
  municipalityCode: '007',
  city: 'Ciudad de México',
  settlements: [
    { id: '0001', name: 'Sinatel', type: 'Colonia', city: 'Ciudad de México', zone: 'Urbano' },
    { id: '0002', name: 'Los Ángeles', type: 'Barrio', city: 'Ciudad de México', zone: 'Urbano' },
  ],
  corpusVersion: '2026-08-06',
  ...over,
})

const address = (over: Partial<Parameters<typeof checkShippingAddress>[0]> = {}) => ({
  neighborhood: 'Sinatel',
  city: 'Iztapalapa',
  state: 'Ciudad de México',
  postalCode: '09630',
  ...over,
})

describe('checkShippingAddress', () => {
  it('marca exact cuando todo coincide tal cual', () => {
    const check = checkShippingAddress(address(), lookup())
    expect(check.verdict).toBe('exact')
    expect(check.original).toBeNull()
    expect(check.corpusVersion).toBe('2026-08-06')
  })

  it('guarda la ortografía del catálogo cuando solo cambian acentos o mayúsculas', () => {
    const check = checkShippingAddress(
      address({ neighborhood: 'los angeles', city: 'IZTAPALAPA', state: 'ciudad de mexico' }),
      lookup(),
    )

    expect(check.verdict).toBe('corrected')
    expect(check.neighborhood).toBe('Los Ángeles')
    expect(check.city).toBe('Iztapalapa')
    expect(check.state).toBe('Ciudad de México')
    // Lo que escribió el comprador se guarda al lado, no encima.
    expect(check.original).toEqual({
      state: 'ciudad de mexico',
      city: 'IZTAPALAPA',
      neighborhood: 'los angeles',
    })
  })

  it('acepta la ciudad del CP cuando el comprador la escribe en vez del municipio', () => {
    // En zonas metropolitanas mucha gente escribe la ciudad, y no está mal.
    const check = checkShippingAddress(address({ city: 'Ciudad de México' }), lookup())
    expect(check.verdict).toBe('exact')
    expect(check.city).toBe('Ciudad de México')
  })

  it('marca la colonia que no está en la lista del CP, sin tocar lo que escribió', () => {
    const check = checkShippingAddress(address({ neighborhood: 'Villas del Sol' }), lookup())
    expect(check.verdict).toBe('unlisted_settlement')
    expect(check.neighborhood).toBe('Villas del Sol')
    expect(addressNeedsReview(check.verdict)).toBe(true)
  })

  it('trata una dirección sin colonia como colonia fuera de lista', () => {
    const check = checkShippingAddress(address({ neighborhood: null }), lookup())
    expect(check.verdict).toBe('unlisted_settlement')
    expect(check.neighborhood).toBeNull()
  })

  it('marca el municipio que no corresponde al CP', () => {
    const check = checkShippingAddress(address({ city: 'Coyoacán' }), lookup())
    expect(check.verdict).toBe('municipality_mismatch')
    expect(check.city).toBe('Coyoacán')
  })

  it('marca el estado contradictorio aparte, y CONSERVA lo que escribió el comprador', () => {
    // Es la dirección posteada directo a la API saltándose el formulario. No se
    // corrige: si el dedazo estuvo en el CP y no en el estado, "arreglarlo"
    // mandaría el paquete al otro lado del país.
    const check = checkShippingAddress(
      address({ city: 'Monterrey', state: 'Nuevo León' }),
      lookup(),
    )

    expect(check.verdict).toBe('state_mismatch')
    expect(check.state).toBe('Nuevo León')
    expect(check.city).toBe('Monterrey')
    expect(check.original).toBeNull()
    expect(addressNeedsReview(check.verdict)).toBe(true)
  })

  it('el estado contradictorio gana sobre cualquier otro desajuste', () => {
    const check = checkShippingAddress(
      address({ neighborhood: 'Inventada', city: 'Otra', state: 'Yucatán' }),
      lookup(),
    )
    expect(check.verdict).toBe('state_mismatch')
  })

  it('marca el CP desconocido y deja la dirección intacta', () => {
    const typed = address({ neighborhood: 'Villas del Sol', city: 'Tulum', state: 'Quintana Roo' })
    const check = checkShippingAddress(
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

    expect(check.verdict).toBe('unknown_postal_code')
    expect(check.city).toBe('Tulum')
    expect(check.state).toBe('Quintana Roo')
    expect(check.neighborhood).toBe('Villas del Sol')
    expect(check.corpusVersion).toBe('2026-08-06')
  })

  it('distingue "no hay catálogo cargado" de "el CP no existe"', () => {
    // Es el estado de un ambiente recién migrado. No dice nada de la dirección
    // y no debe mandar a nadie a llamarle al comprador.
    const check = checkShippingAddress(
      address(),
      lookup({ found: false, corpusVersion: null, settlements: [] }),
    )

    expect(check.verdict).toBe('no_corpus')
    expect(check.corpusVersion).toBeNull()
    expect(addressNeedsReview(check.verdict)).toBe(false)
  })

  it('nunca inventa datos: sin coincidencia, se persiste lo que llegó', () => {
    const typed = address({ neighborhood: '  Sinatel  ' })
    const check = checkShippingAddress(typed, lookup())
    // El trim sí ocurre; el contenido no se sustituye por otra cosa.
    expect(check.neighborhood).toBe('Sinatel')
  })
})

describe('addressNeedsReview', () => {
  it('no molesta al vendedor con una dirección correcta', () => {
    expect(addressNeedsReview('exact')).toBe(false)
    expect(addressNeedsReview('corrected')).toBe(false)
  })

  it('no le pasa al vendedor un problema de nuestra operación', () => {
    expect(addressNeedsReview('no_corpus')).toBe(false)
  })

  it('tolera órdenes anteriores a esta task, que no tienen veredicto', () => {
    expect(addressNeedsReview(null)).toBe(false)
    expect(addressNeedsReview(undefined)).toBe(false)
  })
})
