/**
 * Mapper de fila `sellers` (+ singlesCount agregado) al contrato público
 * `Seller` de @thepubmarket/shared.
 *
 * SOLO vitrina: nunca expone `userId`, `stripeConnectAccountId` ni timestamps.
 * Normaliza NULLs de las columnas de perfil (nullable en D1) a los defaults del
 * contrato para que el frontend no lidie con opcionales.
 */
import type { SellerRow } from '@thepubmarket/db'
import type { Seller } from '@thepubmarket/shared'

export function rowToSeller(row: SellerRow & { singlesCount: number }): Seller {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    verified: row.verified,
    monogram: row.monogram ?? row.name.slice(0, 2).toUpperCase(),
    city: row.city ?? '',
    neighborhood: row.neighborhood ?? '',
    memberSince: row.memberSince ?? new Date(row.createdAt * 1000).getUTCFullYear(),
    blurb: row.blurb ?? '',
    favoriteGames: row.favoriteGames ?? [],
    yearsInHobby: row.yearsInHobby ?? 0,
    funFact: row.funFact ?? '',
    address: row.address ?? '',
    hours: row.hours ?? [],
    whatsapp: row.whatsapp ?? '',
    instagram: row.instagram ?? '',
    singlesCount: row.singlesCount,
  }
}
