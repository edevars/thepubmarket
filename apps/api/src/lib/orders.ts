/**
 * Helpers de órdenes: cálculo de comisión (application fee) y mapeo a DTO.
 * Dinero SIEMPRE en centavos enteros.
 */
import type { OrderItemRow, OrderRow } from '@thepubmarket/db'
import type { OrderItemSummary, OrderStatus, OrderSummary } from '@thepubmarket/shared'

/** Comisión de la plataforma en centavos a partir de los puntos básicos (bps). */
export function computePlatformFeeCents(subtotalCents: number, bps: number): number {
  return Math.round((subtotalCents * bps) / 10000)
}

function itemToSummary(row: OrderItemRow): OrderItemSummary {
  return {
    id: row.id,
    inventoryId: row.inventoryId,
    titleSnapshot: row.titleSnapshot,
    unitPriceCents: row.unitPriceCents,
    quantity: row.quantity,
    lineTotalCents: row.lineTotalCents,
  }
}

/** Mapea fila de orden + líneas al DTO público `OrderSummary`. */
export function orderToSummary(order: OrderRow, items: OrderItemRow[]): OrderSummary {
  return {
    id: order.id,
    status: order.status as OrderStatus,
    sellerId: order.sellerId,
    subtotalCents: order.subtotalCents,
    platformFeeCents: order.platformFeeCents,
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt,
    items: items.map(itemToSummary),
  }
}
