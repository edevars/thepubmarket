/**
 * Identidad de CARTA sobre el inventario (TASK-062).
 *
 * El inventario es una lista de PUBLICACIONES: una fila por oferta. El
 * catálogo, en cambio, se navega por carta — el comprador busca "Rengar", no
 * "la copia HP de Rengar de la tienda X". Sin agrupar, una misma tienda que
 * publica la misma carta en dos condiciones aparece dos veces en el grid, con
 * dos fichas distintas, y ninguna de las dos menciona a la otra.
 *
 * QUÉ ES "LA MISMA CARTA": impresión + idioma + acabado.
 *   - La impresión (`card.catalogId`) es el id canónico del catálogo del juego
 *     (`UNL-183` en Riftbound, el UUID de Scryfall en MTG). Dos impresiones
 *     distintas del mismo nombre —el arte alterno, el promo— son cartas
 *     distintas, así que el nombre y el `oracleId` NO sirven como identidad:
 *     en MTG el `oracleId` es el mismo para todas las reimpresiones de una
 *     carta en todos los sets.
 *   - El idioma y el acabado entran en la identidad porque cambian lo que el
 *     comprador recibe: el foil y el no-foil de una misma impresión son
 *     productos distintos y se cotizan distinto (en producción, Dark Ritual
 *     msc: $60 no-foil contra $231 foil). Además mantienen honestos los
 *     badges de la tarjeta y coherentes los filtros de idioma/foil.
 *   - Lo que SÍ varía dentro de una carta: condición, precio, cantidad y
 *     vendedor. Eso es exactamente lo que la ficha lista como ofertas.
 *
 * Módulo puro (sin React) y sin dependencias de datos: lo consumen tanto la
 * capa de datos (`data.ts`) como las vistas del grid.
 */
import type { InventoryItem } from '@thepubmarket/shared'

/**
 * Clave de identidad de carta de una publicación.
 *
 * Sin id de impresión no se agrupa NADA: la clave cae a la fila misma. Una
 * fila sin `catalogId` (snapshot viejo, importador a medias) no tiene con qué
 * demostrar que es la misma carta que otra, y fusionar por nombre sería peor
 * que no fusionar — juntaría impresiones distintas bajo un precio que no es
 * el suyo.
 */
export function cardKey(item: InventoryItem): string {
  const printing = item.card.catalogId?.trim()
  if (!printing) return `listing:${item.id}`
  return `${item.tcg}|${printing}|${item.language}|${item.finish}`
}

/** Una carta del catálogo con todas sus ofertas activas. */
export interface CardOffers {
  /** Clave de identidad (`cardKey`), estable entre renders. */
  key: string
  /** Oferta que representa a la carta en el grid (ver `pickRepresentative`). */
  representative: InventoryItem
  /** Todas las ofertas de la carta, de menor a mayor precio. */
  offers: InventoryItem[]
  /** Precio de la oferta más barata, para el "desde $X" de la tarjeta. */
  minPriceCents: number
  /** Suma de existencias de todas las ofertas. */
  totalQuantity: number
}

/**
 * Elige la oferta que se publica en el catálogo: la de precio MÁS CERCANO AL
 * PROMEDIO de la carta.
 *
 * El promedio es aritmético simple sobre los precios de las ofertas (no
 * ponderado por cantidad): una tienda con 8 copias baratas no debe arrastrar
 * el precio de portada por debajo de lo que vale la carta, ni al revés.
 *
 * Mostrar la más barata invitaría a publicar una copia HP de regalo para ganar
 * la portada; mostrar la primera que ordenó la base es arbitrario y cambia
 * sola. El promedio da un precio representativo y estable.
 *
 * Desempates, en orden: precio menor, luego id menor. Con dos ofertas siempre
 * hay empate (ambas quedan a la misma distancia de la media), así que este
 * caso es la regla, no la excepción: gana la barata, que es la que no decepciona
 * al comprador cuando abre la ficha.
 */
export function pickRepresentative(offers: InventoryItem[]): InventoryItem {
  const [first] = offers
  if (!first) throw new Error('pickRepresentative: sin ofertas')
  if (offers.length === 1) return first

  const average = offers.reduce((sum, o) => sum + o.priceCents, 0) / offers.length
  let best = first
  let bestDistance = Math.abs(first.priceCents - average)
  for (const offer of offers.slice(1)) {
    const distance = Math.abs(offer.priceCents - average)
    if (distance < bestDistance) {
      best = offer
      bestDistance = distance
      continue
    }
    if (distance > bestDistance) continue
    if (offer.priceCents < best.priceCents) best = offer
    else if (offer.priceCents === best.priceCents && offer.id < best.id) best = offer
  }
  return best
}

/**
 * Agrupa publicaciones en cartas. Conserva el orden de entrada: cada carta
 * aparece donde apareció su PRIMERA publicación, así que el orden que trae la
 * API (título ascendente) o el que ya aplicó el llamador se respeta.
 */
export function groupByCard(items: InventoryItem[]): CardOffers[] {
  const byKey = new Map<string, InventoryItem[]>()
  for (const item of items) {
    const key = cardKey(item)
    const bucket = byKey.get(key)
    if (bucket) bucket.push(item)
    else byKey.set(key, [item])
  }

  return [...byKey.entries()].map(([key, bucket]) => {
    // Empate de precio: por id, para que el orden no dependa del de entrada.
    const offers = [...bucket].sort(
      (a, b) => a.priceCents - b.priceCents || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    return {
      key,
      representative: pickRepresentative(offers),
      offers,
      minPriceCents: offers[0]?.priceCents ?? 0,
      totalQuantity: offers.reduce((sum, o) => sum + o.quantity, 0),
    }
  })
}

/** Una publicación por carta (la representante), en el orden de entrada. */
export function dedupeByCard(items: InventoryItem[]): InventoryItem[] {
  return groupByCard(items).map((group) => group.representative)
}

/** Índice `id de la representante -> carta`, para que el grid pinte "N ofertas". */
export function indexByRepresentative(groups: CardOffers[]): Map<string, CardOffers> {
  return new Map(groups.map((group) => [group.representative.id, group]))
}

/**
 * Las ofertas que son la MISMA carta que `item` (incluida la suya), de menor a
 * mayor precio. Lo usa la ficha para listar precios y condiciones sobre lo que
 * devuelva la API para esa impresión, descartando lo que comparta impresión
 * pero no idioma o acabado.
 */
export function offersOfSameCard(
  item: InventoryItem,
  candidates: InventoryItem[],
): InventoryItem[] {
  const key = cardKey(item)
  const same = candidates.filter((c) => c.id !== item.id && cardKey(c) === key)
  return groupByCard([item, ...same])[0]?.offers ?? [item]
}
