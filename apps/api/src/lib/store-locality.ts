/**
 * Localidad de una tienda, resuelta contra el corpus SEPOMEX (TASK-061.05).
 *
 * Existe por un bug documentado en `delivery.ts`: la recolección en tienda
 * aliada se ofrece solo entre tiendas de la misma ciudad, y esa comparación era
 * texto libre tecleado por quien dio de alta cada tienda. "CDMX" y "Ciudad de
 * México" son el mismo lugar y la comparación no lo sabía, así que un punto de
 * recolección legítimo desaparecía del checkout sin que nadie se enterara.
 *
 * POR QUÉ LA CIUDAD Y NO EL MUNICIPIO, que es lo que uno esperaría: medido
 * sobre el catálogo completo, **"Ciudad de México" es el único nombre de ciudad
 * del país que abarca más de un municipio** — sus 16 alcaldías. Emparejar por
 * municipio dejaría de juntar una tienda de la Condesa con una de Coyoacán, que
 * es exactamente lo contrario de lo que el checkout le promete al comprador.
 * Fuera de la CDMX ciudad ≈ municipio, así que la llave es igual de precisa.
 *
 * LO QUE ESTA LLAVE NO HACE: SEPOMEX no modela zonas metropolitanas. Zapopan y
 * Guadalajara son ciudades distintas para el catálogo, igual que San Pedro y
 * Monterrey. Agruparlas sería decidir qué tiendas cuentan como "misma ciudad",
 * que es producto y no dato — por eso la comparación de texto libre se conserva
 * en paralelo en vez de sustituirse.
 */
import type { PostalCodeLookupResponse } from '@thepubmarket/shared'
import { normalizeAddressPart } from '@thepubmarket/shared'

export interface StoreLocality {
  postalCode: string
  localityKey: string
  municipality: string
  state: string
}

/**
 * Localidad de una tienda a partir de la consulta de su CP, o `null` si el
 * catálogo no lo registra — ahí la tienda se guarda igual y sigue emparejando
 * por texto libre.
 */
export function resolveStoreLocality(lookup: PostalCodeLookupResponse): StoreLocality | null {
  if (!lookup.found || !lookup.state || !lookup.municipality) return null

  // La ciudad manda; el municipio es el respaldo para los CP que no la traen
  // (dos de cada tres asentamientos del país).
  const locality = lookup.city ?? lookup.municipality
  return {
    postalCode: lookup.postalCode,
    localityKey: `${lookup.stateCode ?? normalizeAddressPart(lookup.state)}:${normalizeAddressPart(locality)}`,
    municipality: lookup.municipality,
    state: lookup.state,
  }
}

/** Lo mínimo que se necesita de una tienda para decidir si comparte ciudad. */
export interface LocatableStore {
  localityKey: string | null
  city: string | null
}

/**
 * True si dos tiendas están en la misma ciudad.
 *
 * ADITIVO A PROPÓSITO: basta con que coincida la llave del corpus **o** la
 * ciudad de texto libre. Nunca deja fuera a una tienda que hoy sí aparece —
 * ni las que no tienen CP registrado, ni una de Zapopan que escribió
 * "Guadalajara" porque para cualquier comprador es la misma ciudad.
 */
export function isSameLocality(a: LocatableStore, b: LocatableStore): boolean {
  if (a.localityKey && b.localityKey && a.localityKey === b.localityKey) return true

  const cityA = normalizeAddressPart(a.city)
  return cityA !== '' && cityA === normalizeAddressPart(b.city)
}
