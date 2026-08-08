/**
 * Estado de la dirección de envío del checkout (TASK-061.03).
 *
 * Vive fuera del componente porque es la parte con reglas: qué se conserva y
 * qué se descarta cuando el comprador cambia el código postal. `apps/web` solo
 * corre vitest sobre módulos puros, así que separarlo es también lo que hace
 * que estas reglas estén probadas.
 */
import { normalizeAddressPart, type PostalCodeLookupResponse } from '@thepubmarket/shared'

export const EMPTY_ADDRESS = {
  recipient: '',
  phone: '',
  line1: '',
  line2: '',
  neighborhood: '',
  city: '',
  state: '',
  postalCode: '',
}

export type AddressFormValue = typeof EMPTY_ADDRESS

/** Campos sin los que la paquetería no llega. */
export const REQUIRED_FIELDS = [
  'recipient',
  'phone',
  'line1',
  'city',
  'state',
  'postalCode',
] as const

/**
 * Cómo se captura la colonia.
 *   - `list`: el CP trae asentamientos y se elige de la lista.
 *   - `manual`: no hay lista (CP sin registro, API caída) o el comprador
 *     eligió escribirla porque la suya no aparece.
 */
export type ColoniaMode = 'list' | 'manual'

export interface AppliedLookup {
  address: AddressFormValue
  coloniaMode: ColoniaMode
  /** Asentamiento seleccionado en la lista, o null si ninguno coincide. */
  selectedSettlementId: string | null
}

/** Campos que el comprador debe llenar y siguen vacíos. */
export function missingFields(address: AddressFormValue): string[] {
  return REQUIRED_FIELDS.filter((field) => address[field].trim() === '')
}

/** True si hay algo escrito en el CP y no son 5 dígitos. */
export function isPostalCodeInvalid(postalCode: string): boolean {
  const value = postalCode.trim()
  return value !== '' && !/^\d{5}$/.test(value)
}

/**
 * Aplica el resultado de la consulta del CP a la dirección en curso.
 *
 * Una consulta exitosa **sobreescribe** municipio y estado. Cambiar el código
 * postal es un acto deliberado que significa "otro lugar", así que conservar lo
 * que el comprador escribió para el CP anterior produciría exactamente la
 * dirección incoherente que este epic existe para evitar. Después de
 * autocompletar, los campos siguen siendo suyos y puede corregirlos.
 *
 * El municipio va al campo `city` a propósito: el esquema de dirección tiene un
 * solo espacio para la localidad y lo que lee el mensajero en la guía es el
 * municipio o alcaldía, no la "ciudad" de SEPOMEX (para el CP 01000 son Álvaro
 * Obregón y Ciudad de México respectivamente).
 *
 * La colonia solo sobrevive si el CP nuevo la sigue teniendo — comparando sin
 * acentos ni mayúsculas, porque el comprador pudo haberla escrito a mano antes.
 * Si el CP trae una sola, se elige sola: no hay nada que decidir.
 */
export function applyLookup(
  address: AddressFormValue,
  lookup: PostalCodeLookupResponse,
): AppliedLookup {
  if (!lookup.found) {
    // Sin registro: no se toca nada de lo que ya escribió. El formulario
    // simplemente vuelve a ser el de siempre, todo a mano.
    return { address, coloniaMode: 'manual', selectedSettlementId: null }
  }

  const current = normalizeAddressPart(address.neighborhood)
  const match =
    lookup.settlements.length === 1
      ? lookup.settlements[0]
      : (lookup.settlements.find((s) => normalizeAddressPart(s.name) === current) ?? null)

  return {
    address: {
      ...address,
      city: lookup.municipality ?? address.city,
      state: lookup.state ?? address.state,
      neighborhood: match ? match.name : '',
    },
    coloniaMode: lookup.settlements.length > 0 ? 'list' : 'manual',
    selectedSettlementId: match?.id ?? null,
  }
}

/**
 * Campos obligatorios en el ORDEN EN QUE SE PINTAN en `ShippingAddressForm`.
 * Sirve para llevar el foco al primer error al intentar continuar, que es lo
 * que evita que alguien navegando con teclado tenga que ir campo por campo
 * buscando cuál falta. Si cambia el orden del formulario, cambia aquí.
 */
const FOCUS_ORDER = ['postalCode', 'line1', 'city', 'state', 'recipient', 'phone'] as const

/** Primer campo que el comprador debe corregir, o null si no hay ninguno. */
export function firstInvalidField(
  missing: readonly string[],
  postalCodeInvalid: boolean,
): string | null {
  if (postalCodeInvalid) return 'postalCode'
  return FOCUS_ORDER.find((field) => missing.includes(field)) ?? null
}

/** Payload de `POST /checkout`: recorta y convierte los opcionales vacíos en null. */
export function toShippingAddress(address: AddressFormValue) {
  return {
    recipient: address.recipient.trim(),
    phone: address.phone.trim(),
    line1: address.line1.trim(),
    line2: address.line2.trim() || null,
    neighborhood: address.neighborhood.trim() || null,
    city: address.city.trim(),
    state: address.state.trim(),
    postalCode: address.postalCode.trim(),
    country: 'MX' as const,
  }
}
