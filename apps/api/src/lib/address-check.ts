/**
 * Cotejo de la dirección de envío contra el corpus SEPOMEX (TASK-061.04).
 *
 * El formulario del checkout ya ancla la dirección en el código postal, pero la
 * API acepta el JSON que le manden: un cliente puede postear el CP de Coyoacán
 * con "Monterrey, Yucatán" y hoy la orden se crea así. Lo que queda congelado
 * en la orden es lo que lee el mensajero, así que vale revisarlo del lado del
 * servidor.
 *
 * NO ES UNA COMPUERTA, y la razón está escrita desde antes en `delivery.ts`:
 * validar estricto rechaza direcciones reales y entregables —colonias más
 * nuevas que el catálogo, rancherías, gente que escribe el municipio vecino
 * porque es donde de verdad le llega el correo—. Un desajuste se registra y se
 * le muestra a quien prepara el envío; nunca corta el pago.
 *
 * NORMALIZAR SÍ, REINTERPRETAR NO: se sustituye por la ortografía del catálogo
 * solo cuando el valor normalizado coincide, es decir cuando es el mismo lugar
 * escrito distinto. Si difiere de verdad se conserva lo que escribió el
 * comprador — corregirlo podría mandar el paquete a otro estado si el error
 * estuvo en el CP y no en el estado.
 */
import {
  normalizeAddressPart,
  type PostalCodeLookupResponse,
  type ShippingAddressMatch,
} from '@thepubmarket/shared'

/** Dirección tal como llegó, ya validada por `deliverySchema`. */
interface SubmittedAddress {
  neighborhood?: string | null
  city: string
  state: string
  postalCode: string
}

export interface AddressCheck {
  verdict: ShippingAddressMatch
  /** Valores a persistir: canónicos donde coincidieron, tal cual donde no. */
  city: string
  state: string
  neighborhood: string | null
  /** Lo que escribió el comprador en los campos que se sustituyeron, o null. */
  original: Record<string, string | null> | null
  corpusVersion: string | null
}

/** True si ambos nombran el mismo lugar ignorando acentos y mayúsculas. */
function matches(submitted: string | null | undefined, official: string | null): boolean {
  if (!official || !submitted) return false
  return normalizeAddressPart(submitted) === normalizeAddressPart(official)
}

/** Elige la ortografía del catálogo cuando ambas nombran el mismo lugar. */
function canonical(
  submitted: string,
  official: string | null,
): { value: string; changed: boolean } {
  if (!matches(submitted, official) || official === null)
    return { value: submitted, changed: false }
  return { value: official, changed: official !== submitted }
}

/**
 * Coteja la dirección con lo que el corpus sabe de su CP.
 *
 * `lookup` es la respuesta de `lookupPostalCode` — el mismo dato que consultó
 * el navegador del comprador, así que el veredicto se calcula contra
 * exactamente lo que él vio.
 *
 * El municipio se compara contra `city` de la dirección: el esquema tiene un
 * solo espacio para la localidad y lo que va en la guía es el municipio o
 * alcaldía (TASK-061.03). También se acepta la ciudad del catálogo como
 * coincidencia válida — en las zonas metropolitanas mucha gente escribe la
 * ciudad y no el municipio, y ambas son ciertas.
 */
export function checkShippingAddress(
  address: SubmittedAddress,
  lookup: PostalCodeLookupResponse,
): AddressCheck {
  const submitted = {
    city: address.city,
    state: address.state,
    neighborhood: address.neighborhood?.trim() || null,
  }

  // Sin catálogo cargado no hay nada contra qué cotejar. Se distingue del CP
  // desconocido a propósito: esto es infraestructura nuestra, no un problema
  // de la dirección, y nadie debería salir a llamarle al comprador por esto.
  if (lookup.corpusVersion === null) {
    return { verdict: 'no_corpus', ...submitted, original: null, corpusVersion: null }
  }

  if (!lookup.found) {
    return {
      verdict: 'unknown_postal_code',
      ...submitted,
      original: null,
      corpusVersion: lookup.corpusVersion,
    }
  }

  const state = canonical(address.state, lookup.state)
  // La localidad casa contra el municipio o contra la ciudad del CP: en zonas
  // metropolitanas mucha gente escribe la ciudad y no el municipio, y las dos
  // son ciertas. Se prefiere el municipio, que es lo que va en la guía.
  const city = matches(address.city, lookup.municipality)
    ? canonical(address.city, lookup.municipality)
    : canonical(address.city, lookup.city)

  const settlement = submitted.neighborhood
    ? (lookup.settlements.find((s) => matches(s.name, submitted.neighborhood)) ?? null)
    : null

  const original: Record<string, string | null> = {}
  if (state.changed) original.state = address.state
  if (city.changed) original.city = address.city
  const neighborhood = settlement ? settlement.name : submitted.neighborhood
  if (settlement && settlement.name !== submitted.neighborhood) {
    original.neighborhood = submitted.neighborhood
  }

  const verdict: ShippingAddressMatch = !matches(address.state, lookup.state)
    ? 'state_mismatch'
    : !matches(address.city, lookup.municipality) && !matches(address.city, lookup.city)
      ? 'municipality_mismatch'
      : settlement === null
        ? 'unlisted_settlement'
        : Object.keys(original).length > 0
          ? 'corrected'
          : 'exact'

  return {
    verdict,
    city: city.value,
    state: state.value,
    neighborhood,
    original: Object.keys(original).length > 0 ? original : null,
    corpusVersion: lookup.corpusVersion,
  }
}

/**
 * Veredictos que le importan a la tienda antes de imprimir una guía.
 *
 * `corrected` no está: ahí la dirección es correcta y solo se le arreglaron los
 * acentos. `no_corpus` tampoco: es una falla nuestra de operación, no algo que
 * el vendedor pueda resolver llamando al comprador.
 */
const NEEDS_REVIEW: ReadonlySet<string> = new Set([
  'unlisted_settlement',
  'municipality_mismatch',
  'state_mismatch',
  'unknown_postal_code',
])

/** True si la tienda debería confirmar la dirección antes de enviar. */
export function addressNeedsReview(verdict: string | null | undefined): boolean {
  return verdict !== null && verdict !== undefined && NEEDS_REVIEW.has(verdict)
}
