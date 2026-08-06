/**
 * Seam compartido entre los catálogos de carta por juego (Scryfall para MTG,
 * RiftCodex para Riftbound). Solo lo que TODOS los proveedores comparten: el
 * error tipado que el alta de inventario sabe traducir a HTTP y los TTL de
 * cache. Cada cliente concreto vive en su propio módulo.
 */

/**
 * Falla al consultar el catálogo de un juego. `status` es el código del
 * proveedor (o 504 si nos ganó el timeout); `createListing` lo traduce a la
 * respuesta que ve el cliente.
 */
export class CatalogError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CatalogError'
  }
}

/** Las impresiones son inmutables → cache largo. 30 días en segundos. */
export const CARD_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30

/** Las búsquedas cambian → cache corto. 10 minutos en segundos. */
export const SEARCH_CACHE_TTL_SECONDS = 60 * 10

/**
 * Tope por request a un catálogo externo. Sin esto un proveedor colgado deja
 * la petición del vendedor esperando hasta el límite del Worker.
 */
export const CATALOG_TIMEOUT_MS = 8_000
