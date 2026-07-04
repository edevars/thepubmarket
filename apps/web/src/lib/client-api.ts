/**
 * Llamadas a la API desde el browser que requieren sesión (Bearer): checkout
 * del comprador y Panel del Vendedor. Catálogo se sigue leyendo server-side
 * en `lib/api.ts`.
 */
import type {
  BuyerOrder,
  BuyerOrdersResponse,
  CardSnapshot,
  CheckoutRequest,
  CheckoutResponse,
  CreateListingRequest,
  InventoryItem,
  OrderSummary,
  SellerOrder,
  SellerOrdersResponse,
  SellerPanelMe,
  UpdateListingRequest,
} from '@thepubmarket/shared'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

function authHeaders(token: string): Record<string, string> {
  return { 'content-type': 'application/json', Authorization: `Bearer ${token}` }
}

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

/** Órdenes del comprador para "Mis compras" (con tienda, tracking y estado). */
export async function fetchBuyerOrders(token: string): Promise<BuyerOrder[]> {
  const res = await fetch(`${API}/orders`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`orders request failed: ${res.status}`)
  return ((await res.json()) as BuyerOrdersResponse).items
}

/** Detalle de una orden propia (página de éxito). */
export async function fetchOrder(token: string, id: string): Promise<OrderSummary | null> {
  const res = await fetch(`${API}/orders/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return (await res.json()) as OrderSummary
}

// =====================================================================
// Panel del Vendedor (API /seller, requiere fila activa en sellers)
// =====================================================================

/**
 * Identidad de tienda de la sesión. `null` = sesión inválida (401);
 * `'not_a_seller'` = usuario sin tienda vinculada (403).
 */
export async function fetchSellerMe(token: string): Promise<SellerPanelMe | null | 'not_a_seller'> {
  const res = await fetch(`${API}/seller/me`, { headers: authHeaders(token) })
  if (res.status === 403) return 'not_a_seller'
  if (!res.ok) return null
  return (await res.json()) as SellerPanelMe
}

/** Inventario completo del seller (incluye pausadas y sin stock). */
export async function fetchSellerInventory(token: string): Promise<InventoryItem[]> {
  const res = await fetch(`${API}/seller/inventory`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(`seller inventory failed: ${res.status}`)
  return ((await res.json()) as { items: InventoryItem[] }).items
}

/** Publica un single. Devuelve el item creado o un error tipado. */
export async function createListing(
  token: string,
  body: CreateListingRequest,
): Promise<{ ok: true; item: InventoryItem } | { ok: false; error: string }> {
  const res = await fetch(`${API}/seller/inventory`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (res.ok) return { ok: true, item: (await res.json()) as InventoryItem }
  const err = (await res.json().catch(() => ({ error: 'publish_failed' }))) as { error: string }
  return { ok: false, error: err.error }
}

/** Edita precio/cantidad/estado de un item propio. Null si falló. */
export async function updateListing(
  token: string,
  id: string,
  body: UpdateListingRequest,
): Promise<InventoryItem | null> {
  const res = await fetch(`${API}/seller/inventory/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return (await res.json()) as InventoryItem
}

/** Busca impresiones en el catálogo canónico (Scryfall) para el alta. */
export async function searchPrintings(token: string, q: string): Promise<CardSnapshot[]> {
  const res = await fetch(`${API}/seller/scryfall/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) return []
  return ((await res.json()) as { results: CardSnapshot[] }).results
}

/** Órdenes de la tienda (con líneas, envío y liquidación). */
export async function fetchSellerOrders(token: string): Promise<SellerOrder[]> {
  const res = await fetch(`${API}/seller/orders`, { headers: authHeaders(token) })
  if (!res.ok) throw new Error(`seller orders failed: ${res.status}`)
  return ((await res.json()) as SellerOrdersResponse).items
}

/** Marca una orden pagada como enviada, con guía de rastreo. */
export async function shipOrder(
  token: string,
  id: string,
  trackingNumber: string,
): Promise<boolean> {
  const res = await fetch(`${API}/seller/orders/${encodeURIComponent(id)}/ship`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ trackingNumber }),
  })
  return res.ok
}

/** Marca una orden enviada como entregada. */
export async function deliverOrder(token: string, id: string): Promise<boolean> {
  const res = await fetch(`${API}/seller/orders/${encodeURIComponent(id)}/deliver`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return res.ok
}
