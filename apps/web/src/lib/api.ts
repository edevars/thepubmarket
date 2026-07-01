/**
 * Capa de acceso a la API del Worker desde la web. Solo lectura del catálogo
 * público en Fase 1 (sin carrito ni checkout).
 */
import type {
  CatalogListResponse,
  InventoryItem,
  Seller,
  SellerListResponse,
} from '@thepubmarket/shared'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

export const CATALOG_PAGE_SIZE = 24

export interface CatalogQuery {
  q?: string
  set?: string
  /** Filtra por id de seller (inventario de una tienda). */
  seller?: string
  page?: number
  /** Tamaño de página explícito. Default `CATALOG_PAGE_SIZE`. La API topa en 200. */
  limit?: number
}

/** Lista paginada del catálogo. Lanza si la API responde con error. */
export async function fetchCatalog(query: CatalogQuery): Promise<CatalogListResponse> {
  const page = Math.max(1, query.page ?? 1)
  const limit = query.limit ?? CATALOG_PAGE_SIZE
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.set) params.set('set', query.set)
  if (query.seller) params.set('seller', query.seller)
  params.set('limit', String(limit))
  params.set('offset', String((page - 1) * limit))

  const res = await fetch(`${API_URL}/catalog?${params.toString()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`catalog request failed: ${res.status}`)
  return (await res.json()) as CatalogListResponse
}

/** Detalle de un item. Devuelve null si no existe / no está activo (404). */
export async function fetchCatalogItem(id: string): Promise<InventoryItem | null> {
  const res = await fetch(`${API_URL}/catalog/${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`catalog item request failed: ${res.status}`)
  return (await res.json()) as InventoryItem
}

/** Tiendas activas del market. Lanza si la API responde con error. */
export async function fetchSellers(): Promise<SellerListResponse> {
  const res = await fetch(`${API_URL}/sellers`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`sellers request failed: ${res.status}`)
  return (await res.json()) as SellerListResponse
}

/** Perfil de una tienda por slug. Null si no existe / no está activa (404). */
export async function fetchSellerBySlug(slug: string): Promise<Seller | null> {
  const res = await fetch(`${API_URL}/sellers/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`seller request failed: ${res.status}`)
  return (await res.json()) as Seller
}

/**
 * Formatea centavos MXN (entero) a moneda. La división entre 100 es SOLO para
 * presentación; el dinero se almacena y transmite siempre como entero.
 */
export function formatPriceCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-MX' : 'es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(cents / 100)
}
