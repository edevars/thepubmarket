/**
 * Llamadas a la API desde el browser que requieren la sesión del comprador
 * (Bearer). Catálogo se sigue leyendo server-side en `lib/api.ts`.
 */
import type { CheckoutRequest, CheckoutResponse, OrderSummary } from '@thepubmarket/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

export interface CheckoutError {
  error: string
  inventoryId?: string
  reason?: string
}

/** Crea el checkout y devuelve la URL de Stripe, o un error tipado. */
export async function createCheckout(
  token: string,
  body: CheckoutRequest,
): Promise<{ ok: true; data: CheckoutResponse } | { ok: false; error: CheckoutError }> {
  const res = await fetch(`${API}/checkout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (res.ok) return { ok: true, data: (await res.json()) as CheckoutResponse }
  return {
    ok: false,
    error: (await res.json().catch(() => ({ error: 'checkout_failed' }))) as CheckoutError,
  }
}

/** Detalle de una orden propia (página de éxito). */
export async function fetchOrder(token: string, id: string): Promise<OrderSummary | null> {
  const res = await fetch(`${API}/orders/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return (await res.json()) as OrderSummary
}
