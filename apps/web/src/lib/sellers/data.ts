/**
 * Frontera de acceso a datos de vendedores (tiendas). Llama a la API real del
 * Worker (`apps/api`, GET /sellers) vía `lib/api.ts`. El resto de la app consume
 * SOLO este módulo, igual que `lib/catalog/data.ts`.
 *
 * Fallback offline: con `NEXT_PUBLIC_USE_MOCKS=true` se sirven las tiendas mock
 * de `mock-data.ts` (útil para desarrollar sin la API levantada).
 *
 * Nota de negocio: es SOLO perfil público de escaparate. No toca fondos, payouts
 * ni onboarding de Stripe Connect — la plataforma sigue fuera del flujo de dinero.
 */
import { ANCHOR_SELLER_ID, type InventoryItem } from '@thepubmarket/shared'
import { fetchCatalog, fetchSellerBySlug, fetchSellers } from '@/lib/api'
import { getCatalog } from '@/lib/catalog/data'
import { MOCK_SELLERS } from './mock-data'
import type { SellerProfile, SellerSeed } from './types'

/** Tope alto de la API: trae el inventario de una tienda en una sola página. */
const FETCH_LIMIT = 200
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true'

/** Todas las tiendas activas del market (con conteo de singles). */
export async function getSellers(): Promise<SellerProfile[]> {
  if (USE_MOCKS) {
    const active = MOCK_SELLERS.filter((s) => s.status === 'active')
    return Promise.all(active.map(mockWithCount))
  }
  return (await fetchSellers()).items
}

/** Perfil de una tienda por slug. Null si no existe o no está activa. */
export async function getSellerBySlug(slug: string): Promise<SellerProfile | null> {
  if (USE_MOCKS) {
    const seed = MOCK_SELLERS.find((s) => s.slug === slug && s.status === 'active')
    return seed ? mockWithCount(seed) : null
  }
  return fetchSellerBySlug(slug)
}

/** Inventario disponible de una tienda. */
export async function getSellerInventory(sellerId: string): Promise<InventoryItem[]> {
  if (USE_MOCKS) return mockSellerInventory(sellerId)
  return (await fetchCatalog({ seller: sellerId, limit: FETCH_LIMIT })).items
}

// =====================================================================
// Rama mock (NEXT_PUBLIC_USE_MOCKS=true): tiendas de mock-data.ts e inventario
// derivado del catálogo con un slice determinista por id.
// =====================================================================

/** Hash determinista simple (mismo espíritu que `display.ts`). */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * Inventario mock de una tienda. El ancla muestra el catálogo completo; las
 * demás obtienen un subconjunto determinista (rotado por su id) para poblar el
 * grid con conteos distintos, conservando ids reales de `/catalog/{id}`.
 */
async function mockSellerInventory(sellerId: string): Promise<InventoryItem[]> {
  const all = await getCatalog()
  if (sellerId === ANCHOR_SELLER_ID || all.length === 0) return all

  const seed = hash(sellerId)
  const size = Math.min(all.length, 6 + (seed % 9)) // 6..14 singles
  const start = seed % all.length
  const rotated = [...all.slice(start), ...all.slice(0, start)]
  return rotated.slice(0, size)
}

/** Enriquecer un seed mock con su conteo de singles. */
async function mockWithCount(seed: SellerSeed): Promise<SellerProfile> {
  const inventory = await mockSellerInventory(seed.id)
  return { ...seed, singlesCount: inventory.length }
}
