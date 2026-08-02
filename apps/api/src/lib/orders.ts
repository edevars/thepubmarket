/**
 * Helpers de órdenes: cálculo de comisión (application fee) y mapeo a DTO.
 * Dinero SIEMPRE en centavos enteros.
 */
import type { InventoryRow, OrderItemRow, OrderRow, SellerRow } from '@thepubmarket/db'
import type {
  BuyerOrder,
  Condition,
  DeliveryMethod,
  OrderDelivery,
  OrderItemSummary,
  OrderStatus,
  OrderSummary,
  SellerOrder,
  SellerOrderStatus,
} from '@thepubmarket/shared'

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

/**
 * Entrega de una orden para las vistas.
 *
 * `method` es null en órdenes anteriores a TASK-019 — existen en producción y
 * tienen que seguir renderizando, así que nada aquí asume que hay método.
 * La tienda de recolección se pasa aparte porque vive en otra tabla; si ya no
 * existe (baja del seller, FK set-null) queda en null y la vista degrada.
 */
export function orderToDelivery(
  order: OrderRow,
  pickupStore: SellerRow | undefined,
): OrderDelivery {
  const method = (order.deliveryMethod as DeliveryMethod | null) ?? null

  return {
    method,
    address:
      method === 'shipping' && order.shippingLine1
        ? {
            recipient: order.shippingRecipient ?? '',
            phone: order.shippingPhone ?? '',
            line1: order.shippingLine1,
            line2: order.shippingLine2,
            neighborhood: order.shippingNeighborhood,
            city: order.shippingCity ?? '',
            state: order.shippingState ?? '',
            postalCode: order.shippingPostalCode ?? '',
            country: order.shippingCountry ?? 'MX',
          }
        : null,
    pickupPoint:
      method === 'pickup' && pickupStore
        ? {
            id: pickupStore.id,
            name: pickupStore.name,
            slug: pickupStore.slug,
            address: pickupStore.address ?? '',
          }
        : null,
  }
}

/**
 * Estado derivado para el panel del seller. La columna `status` conserva su
 * enum original; el avance del cumplimiento sale de los timestamps.
 *
 * El orden de las guardas importa: `delivered` gana sobre `shipped`/`ready`
 * porque es terminal para ambos métodos (entregada por paquetería y recogida en
 * tienda son el mismo hecho, y al marcarse fija status 'fulfilled'). `shipped` y
 * `ready` son excluyentes en la práctica —la API no deja marcar lista una orden
 * de envío ni al revés—, pero se evalúa `shipped` primero para que una fila
 * inconsistente no desaparezca de los filtros de las vistas.
 */
export function deriveSellerOrderStatus(order: OrderRow): SellerOrderStatus {
  if (order.status === 'cancelled' || order.status === 'refunded') return order.status
  if (order.deliveredAt != null || order.status === 'fulfilled') return 'delivered'
  if (order.shippedAt != null) return 'shipped'
  if (order.readyAt != null) return 'ready'
  if (order.status === 'paid') return 'paid'
  return 'pending'
}

/**
 * Etiqueta de comprador para el seller: nombre + inicial ("Ana R.") o, sin
 * displayName, el local-part truncado del email ("ana.rodri…"). Nunca expone
 * el email completo.
 */
export function maskBuyer(displayName: string | null, email: string): string {
  const name = displayName?.trim()
  if (name) {
    const [first = '', ...rest] = name.split(/\s+/)
    const last = rest.at(-1)
    return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first
  }
  const local = email.split('@')[0] ?? ''
  return local.length > 9 ? `${local.slice(0, 9)}…` : `${local}…`
}

/**
 * Mapea orden + líneas + tienda al DTO del comprador `BuyerOrder`.
 * SIN comisión: el comprador solo ve lo que pagó. Las líneas se enriquecen con
 * el inventario original cuando la fila sigue viva (cond/set/imagen).
 */
export function orderToBuyerOrder(
  order: OrderRow,
  items: OrderItemRow[],
  seller: SellerRow | undefined,
  inventoryById: Map<string, InventoryRow>,
  pickupStore?: SellerRow,
): BuyerOrder {
  return {
    id: order.id,
    shortId: `#TPM-${order.id.slice(0, 4).toUpperCase()}`,
    status: deriveSellerOrderStatus(order),
    createdAt: order.createdAt,
    shippedAt: order.shippedAt,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    seller: {
      name: seller?.name ?? '—',
      slug: seller?.slug ?? '',
      verified: seller?.verified ?? false,
    },
    delivery: orderToDelivery(order, pickupStore),
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    items: items.map((row) => {
      const inv = row.inventoryId ? inventoryById.get(row.inventoryId) : undefined
      return {
        ...itemToSummary(row),
        condition: (inv?.condition as Condition | undefined) ?? null,
        setCode: inv?.setCode ?? null,
        imageUrl: inv?.imageUrl ?? null,
      }
    }),
  }
}

/** Mapea orden + líneas + comprador al DTO del panel `SellerOrder`. */
export function orderToSellerOrder(
  order: OrderRow,
  items: OrderItemRow[],
  buyer: { displayName: string | null; email: string } | undefined,
  pickupStore?: SellerRow,
): SellerOrder {
  return {
    id: order.id,
    // Folio corto solo para UI; la clave sigue siendo el UUID completo.
    shortId: `#TPM-${order.id.slice(0, 4).toUpperCase()}`,
    status: deriveSellerOrderStatus(order),
    createdAt: order.createdAt,
    shippedAt: order.shippedAt,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    buyerLabel: buyer ? maskBuyer(buyer.displayName, buyer.email) : '—',
    delivery: orderToDelivery(order, pickupStore),
    subtotalCents: order.subtotalCents,
    // Envío cobrado al comprador. 0 en recolección en tienda.
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    platformFeeCents: order.platformFeeCents,
    netCents: order.subtotalCents - order.platformFeeCents,
    items: items.map(itemToSummary),
  }
}
