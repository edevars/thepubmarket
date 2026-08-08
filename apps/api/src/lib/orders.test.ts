import type { OrderRow } from '@thepubmarket/db'
import { describe, expect, it } from 'vitest'
import {
  computePlatformFeeCents,
  deriveSellerOrderStatus,
  maskBuyer,
  orderToDelivery,
} from './orders'

/** Minimal order row; only the fields the derivation actually reads. */
function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'o1',
    status: 'paid',
    deliveryMethod: 'shipping',
    shippedAt: null,
    readyAt: null,
    deliveredAt: null,
    ...over,
  } as OrderRow
}

describe('deriveSellerOrderStatus', () => {
  it('walks a shipping order through its sequence', () => {
    expect(deriveSellerOrderStatus(order({ status: 'pending' }))).toBe('pending')
    expect(deriveSellerOrderStatus(order())).toBe('paid')
    expect(deriveSellerOrderStatus(order({ shippedAt: 1 }))).toBe('shipped')
    expect(deriveSellerOrderStatus(order({ shippedAt: 1, deliveredAt: 2 }))).toBe('delivered')
  })

  it('walks a pickup order through its own sequence', () => {
    const pickup = { deliveryMethod: 'pickup' } as Partial<OrderRow>
    expect(deriveSellerOrderStatus(order(pickup))).toBe('paid')
    expect(deriveSellerOrderStatus(order({ ...pickup, readyAt: 1 }))).toBe('ready')
    expect(deriveSellerOrderStatus(order({ ...pickup, readyAt: 1, deliveredAt: 2 }))).toBe(
      'delivered',
    )
  })

  it('treats collected and delivered as the same terminal state', () => {
    const shipped = order({ shippedAt: 1, deliveredAt: 2 })
    const collected = order({ deliveryMethod: 'pickup', readyAt: 1, deliveredAt: 2 })
    expect(deriveSellerOrderStatus(collected)).toBe(deriveSellerOrderStatus(shipped))
  })

  it("derives 'delivered' from status alone when the timestamp is missing", () => {
    // Legacy rows closed before deliveredAt existed still have status 'fulfilled'.
    expect(deriveSellerOrderStatus(order({ status: 'fulfilled' }))).toBe('delivered')
  })

  it('keeps a legacy order with no delivery method on the shipping sequence', () => {
    expect(deriveSellerOrderStatus(order({ deliveryMethod: null }))).toBe('paid')
    expect(deriveSellerOrderStatus(order({ deliveryMethod: null, shippedAt: 1 }))).toBe('shipped')
  })

  it('lets terminal states win over any fulfilment progress', () => {
    expect(deriveSellerOrderStatus(order({ status: 'cancelled', shippedAt: 1 }))).toBe('cancelled')
    expect(deriveSellerOrderStatus(order({ status: 'refunded', readyAt: 1 }))).toBe('refunded')
  })

  it('does not drop an inconsistent row out of the views', () => {
    // Both timestamps set should be unreachable through the API, but if it ever
    // happens the order still lands on a real status instead of 'pending'.
    expect(deriveSellerOrderStatus(order({ shippedAt: 1, readyAt: 1 }))).toBe('shipped')
  })
})

describe('computePlatformFeeCents', () => {
  it('applies basis points and rounds to whole cents', () => {
    expect(computePlatformFeeCents(21_000, 1000)).toBe(2100)
    expect(computePlatformFeeCents(999, 800)).toBe(80)
    expect(computePlatformFeeCents(0, 800)).toBe(0)
  })
})

describe('maskBuyer', () => {
  it('never exposes the full email', () => {
    expect(maskBuyer('Ana Rodríguez', 'ana@example.com')).toBe('Ana R.')
    expect(maskBuyer(null, 'ana.rodriguez@example.com')).toBe('ana.rodri…')
    expect(maskBuyer(null, 'ana@example.com')).toBe('ana…')
  })
})

describe('orderToDelivery — cotejo de dirección (TASK-061.04)', () => {
  const shipped = (over: Partial<OrderRow> = {}) =>
    order({
      deliveryMethod: 'shipping',
      shippingLine1: 'Av. Río Churubusco 500',
      shippingCity: 'Iztapalapa',
      shippingState: 'Ciudad de México',
      shippingPostalCode: '09630',
      ...over,
    })

  it('devuelve null en órdenes anteriores a la task, que no tienen veredicto', () => {
    // Existen en producción y tienen que seguir renderizando.
    expect(orderToDelivery(shipped(), undefined).addressCheck).toBeNull()
  })

  it('devuelve null en órdenes de recolección: no hay dirección que cotejar', () => {
    const pickup = order({ deliveryMethod: 'pickup', shippingAddressMatch: null })
    expect(orderToDelivery(pickup, undefined).addressCheck).toBeNull()
  })

  it('expone el veredicto, el vintage y lo que escribió el comprador', () => {
    const delivery = orderToDelivery(
      shipped({
        shippingAddressMatch: 'corrected',
        shippingAddressOriginal: JSON.stringify({ city: 'IZTAPALAPA' }),
        shippingCorpusVersion: '2026-08-06',
      }),
      undefined,
    )

    expect(delivery.addressCheck).toEqual({
      verdict: 'corrected',
      original: { city: 'IZTAPALAPA' },
      corpusVersion: '2026-08-06',
    })
  })

  it('un blob ilegible no tumba la vista de una orden pagada', () => {
    const delivery = orderToDelivery(
      shipped({ shippingAddressMatch: 'corrected', shippingAddressOriginal: '{roto' }),
      undefined,
    )
    expect(delivery.addressCheck?.verdict).toBe('corrected')
    expect(delivery.addressCheck?.original).toBeNull()
  })
})
