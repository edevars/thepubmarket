/** Colores por estado de orden del panel (paleta del diseño). */
import type { SellerOrderStatus } from '@thepubmarket/shared'

export const ORDER_STATUS_HEX: Record<SellerOrderStatus, string> = {
  pending: '#7a88a8',
  paid: '#3b7bff',
  shipped: '#35e0ee',
  delivered: '#46c98a',
  cancelled: '#7a88a8',
  refunded: '#d6584f',
}

/** Clave i18n del label del estado (namespace `panel`). */
export function orderStatusKey(s: SellerOrderStatus): string {
  return `st${s.charAt(0).toUpperCase()}${s.slice(1)}`
}
