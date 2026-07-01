/**
 * Tipos del perfil de tienda. El contrato canónico vive en @thepubmarket/shared
 * (lo comparten Worker y web); aquí solo quedan alias para que los componentes
 * conserven su ruta de import y el tipo semilla de los mocks.
 */
import type { Seller } from '@thepubmarket/shared'

export type { HoursKey, SellerHours } from '@thepubmarket/shared'

/** Perfil público de una tienda (alias del contrato compartido). */
export type SellerProfile = Seller

/** Perfil sin el campo derivado — forma de los datos mock crudos. */
export type SellerSeed = Omit<Seller, 'singlesCount'>
