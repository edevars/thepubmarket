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

/** Colores por estado de payout de Stripe (Payout.status). */
export const PAYOUT_STATUS_HEX: Record<string, string> = {
  paid: '#46c98a',
  pending: '#7a88a8',
  in_transit: '#3b7bff',
  canceled: '#d6584f',
  failed: '#d6584f',
}

/** Clave i18n del label del estado de payout (namespace `panel`), con fallback genérico. */
export function payoutStatusKey(status: string): string {
  const known = ['paid', 'pending', 'in_transit', 'canceled', 'failed']
  if (!known.includes(status)) return 'payoutStatusUnknown'
  return `payoutStatus${status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')}`
}
