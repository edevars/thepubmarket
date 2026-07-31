import type { SellerRow } from '@thepubmarket/db'
import { SHIPPING_FLAT_CENTS } from '@thepubmarket/shared'
import { describe, expect, it } from 'vitest'
import {
  deliverySchema,
  isEligiblePickupPoint,
  normalizeCity,
  shippingCentsFor,
  toPickupPoint,
} from './delivery'

/** Minimal seller row; only the fields the delivery rules actually read. */
function seller(over: Partial<SellerRow> & { id: string }): SellerRow {
  return {
    status: 'active',
    city: 'Ciudad de México',
    name: 'Tienda',
    slug: 'tienda',
    neighborhood: 'Roma Norte',
    address: 'Calle 1',
    hours: [],
    ...over,
  } as SellerRow
}

const validAddress = {
  recipient: 'Ana Rodríguez',
  phone: '5512345678',
  line1: 'Av. Insurgentes Sur 123, int 4',
  city: 'Ciudad de México',
  state: 'CDMX',
  postalCode: '06700',
}

describe('shippingCentsFor', () => {
  it('charges the flat rate for shipping and nothing for pickup', () => {
    expect(shippingCentsFor('shipping')).toBe(SHIPPING_FLAT_CENTS)
    expect(shippingCentsFor('pickup')).toBe(0)
  })
})

describe('normalizeCity', () => {
  it('ignores case, accents and surrounding whitespace', () => {
    expect(normalizeCity('  Ciudad de México ')).toBe('ciudad de mexico')
    expect(normalizeCity('CIUDAD DE MEXICO')).toBe(normalizeCity('Ciudad de México'))
  })

  it('treats missing city as empty rather than throwing', () => {
    expect(normalizeCity(null)).toBe('')
    expect(normalizeCity(undefined)).toBe('')
  })

  it('does not pretend abbreviations are the same place', () => {
    // Documents a known limit: this is a data-quality problem in `sellers.city`,
    // not something to paper over with an alias table here.
    expect(normalizeCity('CDMX')).not.toBe(normalizeCity('Ciudad de México'))
  })
})

describe('isEligiblePickupPoint', () => {
  const selling = seller({ id: 'selling', city: 'Ciudad de México' })

  it('always allows the selling store — nothing has to be moved', () => {
    expect(isEligiblePickupPoint(selling, selling)).toBe(true)
  })

  it('allows another active store in the same city, spelled differently', () => {
    const other = seller({ id: 'other', city: 'ciudad de mexico' })
    expect(isEligiblePickupPoint(other, selling)).toBe(true)
  })

  it('rejects a store in a different city', () => {
    expect(isEligiblePickupPoint(seller({ id: 'gdl', city: 'Guadalajara' }), selling)).toBe(false)
  })

  it('rejects stores that are not active', () => {
    const invited = seller({ id: 'invited', status: 'invited' })
    const suspended = seller({ id: 'suspended', status: 'suspended' })
    expect(isEligiblePickupPoint(invited, selling)).toBe(false)
    expect(isEligiblePickupPoint(suspended, selling)).toBe(false)
  })

  it('rejects a suspended selling store rather than trusting the identity shortcut', () => {
    const dead = seller({ id: 'dead', status: 'suspended' })
    expect(isEligiblePickupPoint(dead, dead)).toBe(false)
  })

  it('falls back to the selling store alone when it has no city recorded', () => {
    const noCity = seller({ id: 'nocity', city: null })
    expect(isEligiblePickupPoint(noCity, noCity)).toBe(true)
    expect(isEligiblePickupPoint(seller({ id: 'other' }), noCity)).toBe(false)
  })
})

describe('toPickupPoint', () => {
  it('marks the selling store and defaults absent profile fields to empty', () => {
    const bare = seller({ id: 'x', neighborhood: null, address: null, city: null, hours: null })
    expect(toPickupPoint(bare, 'x')).toMatchObject({
      isSellingStore: true,
      city: '',
      neighborhood: '',
      address: '',
      hours: [],
    })
    expect(toPickupPoint(bare, 'other').isSellingStore).toBe(false)
  })
})

describe('deliverySchema', () => {
  it('accepts a shipping selection and defaults country to MX', () => {
    const parsed = deliverySchema.parse({ method: 'shipping', address: validAddress })
    expect(parsed).toMatchObject({ method: 'shipping' })
    if (parsed.method === 'shipping') expect(parsed.address.country).toBe('MX')
  })

  it('accepts a pickup selection', () => {
    const parsed = deliverySchema.parse({
      method: 'pickup',
      pickupSellerId: '11111111-1111-4111-8111-111111111111',
    })
    expect(parsed).toMatchObject({ method: 'pickup' })
  })

  it('rejects a shipping selection missing address fields', () => {
    const { postalCode, ...incomplete } = validAddress
    expect(deliverySchema.safeParse({ method: 'shipping', address: incomplete }).success).toBe(
      false,
    )
  })

  it('rejects a postal code that is not five digits', () => {
    for (const postalCode of ['0670', '067000', 'abcde', '06 70']) {
      const result = deliverySchema.safeParse({
        method: 'shipping',
        address: { ...validAddress, postalCode },
      })
      expect(result.success, `postalCode=${postalCode}`).toBe(false)
    }
  })

  it('rejects a selection that mixes both methods or names neither', () => {
    expect(deliverySchema.safeParse({ address: validAddress }).success).toBe(false)
    expect(deliverySchema.safeParse({ method: 'both', address: validAddress }).success).toBe(false)
  })

  it('rejects a country other than MX — widening the market is a product decision', () => {
    const result = deliverySchema.safeParse({
      method: 'shipping',
      address: { ...validAddress, country: 'US' },
    })
    expect(result.success).toBe(false)
  })
})
