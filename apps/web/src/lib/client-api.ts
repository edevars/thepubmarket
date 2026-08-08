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
  ConnectOnboardingLinkResponse,
  ConnectPayout,
  ConnectPayoutsResponse,
  ConnectStatusResponse,
  CreateListingRequest,
  InventoryItem,
  InventoryPhoto,
  OrderSummary,
  PickupPoint,
  PickupPointsResponse,
  PostalCodeLookupResponse,
  SellerOrder,
  SellerOrdersResponse,
  SellerPanelMe,
  ShipOrderRequest,
  Tcg,
  UpdateListingRequest,
} from '@thepubmarket/shared'
import { withTurnstileHeader } from './turnstile'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

function authHeaders(token: string): Record<string, string> {
  return { 'content-type': 'application/json', Authorization: `Bearer ${token}` }
}

export interface CheckoutError {
  error: string
  inventoryId?: string
  reason?: string
}

/**
 * Crea el checkout y devuelve la URL de Stripe, o un error tipado.
 *
 * `turnstileToken` viaja en el header `cf-turnstile-response`: la API lo
 * verifica contra siteverify antes de reservar inventario o hablar con Stripe.
 * `null` = sin widget configurado (el header se omite).
 */
export async function createCheckout(
  token: string,
  body: CheckoutRequest,
  turnstileToken: string | null,
): Promise<{ ok: true; data: CheckoutResponse } | { ok: false; error: CheckoutError }> {
  const res = await fetch(`${API}/checkout`, {
    method: 'POST',
    headers: withTurnstileHeader(
      { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      turnstileToken,
    ),
    body: JSON.stringify(body),
  })
  if (res.ok) return { ok: true, data: (await res.json()) as CheckoutResponse }
  return {
    ok: false,
    error: (await res.json().catch(() => ({ error: 'checkout_failed' }))) as CheckoutError,
  }
}

/**
 * Tiendas donde se puede recoger una orden de este vendedor.
 *
 * Público (no lleva sesión): son los mismos datos de vitrina que `/tiendas`.
 * Lista vacía es un resultado legítimo — un vendedor sin ciudad registrada no
 * tiene ciudad contra la cual buscar aliadas —, así que la vista debe caer a
 * envío a domicilio en vez de tratarlo como error.
 */
export async function fetchPickupPoints(sellerId: string): Promise<PickupPoint[]> {
  const res = await fetch(`${API}/checkout/pickup-points?sellerId=${encodeURIComponent(sellerId)}`)
  if (!res.ok) throw new Error(`pickup points request failed: ${res.status}`)
  return ((await res.json()) as PickupPointsResponse).items
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

/**
 * Sube una foto de un item propio. `blob` ya viene downscaled/re-encoded a
 * JPEG por `resizeImageForUpload` — el body es el binario crudo, no
 * `FormData`, y el `content-type` es el mime real del blob (el server nunca
 * confía en ese header; solo es cortesía, detecta el tipo por magic bytes).
 * El try/catch cubre el único caso de los tres nuevos endpoints donde puede
 * fallar antes de llegar a la API (sin red).
 */
export async function uploadPhoto(
  token: string,
  inventoryId: string,
  blob: Blob,
): Promise<{ ok: true; photo: InventoryPhoto } | { ok: false; error: string }> {
  let res: Response
  try {
    res = await fetch(`${API}/seller/inventory/${encodeURIComponent(inventoryId)}/photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': blob.type },
      body: blob,
    })
  } catch {
    return { ok: false, error: 'network_error' }
  }
  if (res.ok) return { ok: true, photo: (await res.json()) as InventoryPhoto }
  const err = (await res.json().catch(() => ({ error: 'upload_failed' }))) as { error: string }
  return { ok: false, error: err.error }
}

/** Borra una foto propia. `false` cubre tanto "no era tuya" como "ya no existe" (404 opaco). */
export async function deletePhoto(
  token: string,
  inventoryId: string,
  photoId: string,
): Promise<boolean> {
  const res = await fetch(
    `${API}/seller/inventory/${encodeURIComponent(inventoryId)}/photos/${encodeURIComponent(photoId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
  )
  return res.ok
}

/** Reordena todas las fotos de un item propio (el server exige el set completo de ids). Null si falló. */
export async function reorderPhotos(
  token: string,
  inventoryId: string,
  order: string[],
): Promise<InventoryPhoto[] | null> {
  const res = await fetch(
    `${API}/seller/inventory/${encodeURIComponent(inventoryId)}/photos/reorder`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ order }),
    },
  )
  if (!res.ok) return null
  return ((await res.json()) as { photos: InventoryPhoto[] }).photos
}

/** Busca impresiones en el catálogo canónico del juego para el alta. */
export async function searchPrintings(
  token: string,
  q: string,
  game: Tcg = 'mtg',
): Promise<CardSnapshot[]> {
  const res = await fetch(`${API}/seller/catalog/search?game=${game}&q=${encodeURIComponent(q)}`, {
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

/**
 * Transiciones de cumplimiento. Cada una aplica a UN método de entrega: la API
 * responde 409 si no corresponde (marcar enviada una recolección, cerrar una
 * recogida que nunca estuvo lista), así que `false` aquí significa "esa acción
 * no aplica a esta orden", no un error de red.
 */
function fulfilmentAction(action: 'ship' | 'deliver' | 'ready' | 'collect') {
  return async (token: string, id: string, body?: unknown): Promise<boolean> => {
    const res = await fetch(`${API}/seller/orders/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: authHeaders(token),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return res.ok
  }
}

const postShip = fulfilmentAction('ship')

/** Marca una orden de envío como enviada, con guía y paquetería opcional. */
export async function shipOrder(
  token: string,
  id: string,
  trackingNumber: string,
  carrier?: string | null,
): Promise<boolean> {
  const body: ShipOrderRequest = { trackingNumber, carrier: carrier?.trim() || null }
  return postShip(token, id, body)
}

/** Marca una orden enviada como entregada. Solo envío a domicilio. */
export const deliverOrder = fulfilmentAction('deliver')

/** Marca una orden de recolección como lista para recoger en la tienda destino. */
export const readyOrder = fulfilmentAction('ready')

/** Cierra una orden de recolección: el comprador ya se la llevó. */
export const collectOrder = fulfilmentAction('collect')

// =====================================================================
// Onboarding y payouts de Stripe Connect (self-service)
// =====================================================================

/** Estado de onboarding en vivo (consultado directo a Stripe). Null si falló. */
export async function fetchConnectStatus(token: string): Promise<ConnectStatusResponse | null> {
  const res = await fetch(`${API}/seller/connect/status`, { headers: authHeaders(token) })
  if (!res.ok) return null
  return (await res.json()) as ConnectStatusResponse
}

/** Historial reciente de payouts leído en vivo de la cuenta Connect del seller. */
export async function fetchConnectPayouts(token: string): Promise<ConnectPayout[]> {
  const res = await fetch(`${API}/seller/connect/payouts`, { headers: authHeaders(token) })
  if (!res.ok) return []
  return ((await res.json()) as ConnectPayoutsResponse).items
}

/** Pide una Account Link fresca para completar/retomar el onboarding. Null si falló. */
export async function requestOnboardingLink(token: string): Promise<string | null> {
  const res = await fetch(`${API}/seller/connect/onboarding-link`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) return null
  return ((await res.json()) as ConnectOnboardingLinkResponse).url
}

// =====================================================================
// Direcciones — consulta de código postal (SEPOMEX)
// =====================================================================

/**
 * Consulta un CP en el corpus SEPOMEX para autocompletar la dirección de
 * envío. Sin auth: es reference data pública y solo viaja el CP.
 *
 * Devuelve `null` cuando la consulta no se pudo hacer (red caída, 429, CP mal
 * formado): el formulario debe caer a captura manual, nunca bloquear el
 * checkout. Un CP que simplemente no existe en el catálogo NO es este caso —
 * llega como respuesta válida con `found: false`.
 *
 * `signal` permite cancelar la consulta en vuelo cuando el comprador sigue
 * escribiendo.
 */
export async function lookupPostalCode(
  postalCode: string,
  signal?: AbortSignal,
): Promise<PostalCodeLookupResponse | null> {
  try {
    const res = await fetch(`${API}/address/postal-codes/${encodeURIComponent(postalCode)}`, {
      signal,
    })
    if (!res.ok) return null
    return (await res.json()) as PostalCodeLookupResponse
  } catch {
    return null
  }
}
