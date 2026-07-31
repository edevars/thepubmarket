/**
 * Delivery rules — how an order reaches its buyer.
 *
 * Two methods, decided before payment and then frozen on the order:
 *
 * - **shipping**: to an address the buyer types in, for a fee.
 * - **pickup**: free, at an allied store in the same city as the selling store.
 *
 * NO CUSTODY (CLAUDE.md): the shipping fee is charged inside the same direct
 * charge on the seller's Connect account and settles to the seller — they are
 * the ones paying the courier. The application fee keeps being computed on the
 * product subtotal alone, so the platform earns nothing on freight and never
 * touches it. `shippingCents` is derived HERE from the method, never read from
 * the request: a client that could name its own shipping amount could name
 * zero.
 */
import type { SellerRow } from '@thepubmarket/db'
import { type DeliveryMethod, type PickupPoint, SHIPPING_FLAT_CENTS } from '@thepubmarket/shared'
import { z } from 'zod'

/**
 * Address fields. Kept deliberately loose beyond "present and plausible":
 * Mexican addresses are messy (no house number, informal references, rural
 * routes), and a strict format here rejects real deliverable addresses. The
 * courier reads this, not a machine.
 */
const addressSchema = z.object({
  recipient: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(8).max(24),
  line1: z.string().trim().min(5).max(200),
  line2: z.string().trim().max(200).nullish(),
  neighborhood: z.string().trim().max(120).nullish(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  // Mexican postal codes are exactly 5 digits.
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'invalid_postal_code'),
  // Initial market is Mexico only; widening this is a product decision, not a
  // validation tweak — shipping rates and customs both change with it.
  country: z.literal('MX').default('MX'),
})

/**
 * The buyer's choice. A discriminated union because there is no valid state
 * with both an address and a pickup store, or with neither.
 */
export const deliverySchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('shipping'), address: addressSchema }),
  z.object({ method: z.literal('pickup'), pickupSellerId: z.string().uuid() }),
])

export type DeliveryInput = z.infer<typeof deliverySchema>
type ParsedAddress = z.infer<typeof addressSchema>

/** What the buyer is charged for delivery. Server-side truth. */
export function shippingCentsFor(method: DeliveryMethod): number {
  return method === 'shipping' ? SHIPPING_FLAT_CENTS : 0
}

/**
 * Comparable form of a city name.
 *
 * `sellers.city` is free text typed by whoever onboarded the store, so
 * "Ciudad de México", "ciudad de mexico" and " CDMX " all show up. Strips
 * accents and case so same-city matching survives that. It does NOT know that
 * CDMX and Ciudad de México are the same place — that is a data problem, and
 * the fix is normalising the seller records, not adding aliases here.
 */
export function normalizeCity(city: string | null | undefined): string {
  if (!city) return ''
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Whether an order sold by `sellingStore` can be collected at `candidate`.
 *
 * The selling store always qualifies (nothing has to move). Any other store
 * qualifies when it is active and in the same city — that is the whole promise
 * made to the buyer: same city, free, up to a week.
 */
export function isEligiblePickupPoint(candidate: SellerRow, sellingStore: SellerRow): boolean {
  if (candidate.status !== 'active') return false
  if (candidate.id === sellingStore.id) return true

  const city = normalizeCity(sellingStore.city)
  // A selling store with no city recorded has no "same city" to compare
  // against; offering every store on the platform would be worse than
  // offering none, so only the selling store itself remains eligible.
  if (!city) return false
  return normalizeCity(candidate.city) === city
}

/** Maps an eligible store row to the public pickup-point DTO. */
export function toPickupPoint(row: SellerRow, sellingStoreId: string): PickupPoint {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city ?? '',
    neighborhood: row.neighborhood ?? '',
    address: row.address ?? '',
    hours: row.hours ?? [],
    isSellingStore: row.id === sellingStoreId,
  }
}

/**
 * Normalised address ready to persist, from validated input.
 *
 * Takes the parsed shape rather than `ShippingAddress` because zod's `nullish`
 * optionals arrive as `undefined`, while the stored column is `null`. Collapsing
 * the two here keeps that distinction out of the route.
 */
export function addressColumns(address: ParsedAddress) {
  return {
    shippingRecipient: address.recipient,
    shippingPhone: address.phone,
    shippingLine1: address.line1,
    shippingLine2: address.line2 ?? null,
    shippingNeighborhood: address.neighborhood ?? null,
    shippingCity: address.city,
    shippingState: address.state,
    shippingPostalCode: address.postalCode,
    shippingCountry: address.country,
  }
}
