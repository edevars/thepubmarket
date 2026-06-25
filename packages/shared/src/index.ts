/**
 * Tipos compartidos entre el Worker (apps/api) y el frontend (apps/web).
 *
 * Mantener este paquete mínimo y sin dependencias: es solo un contrato.
 */

/** Estado de un subsistema verificado por el health check. */
export type HealthStatus = 'ok' | 'error'

/** Respuesta de `GET /health` del Worker. */
export interface HealthResponse {
  /** Estado global del servicio. */
  status: HealthStatus
  /** Conectividad con D1 (base transaccional). */
  db: HealthStatus
  /** Marca de tiempo unix en segundos. */
  timestamp: number
}

// =====================================================================
// Catálogo / inventario (Fase 1)
// =====================================================================

/**
 * Seller ancla: The Pub Game Store. UUID fijo sembrado en la migración
 * 0003_seed_anchor_seller.sql. En Fase 1 es el ÚNICO seller; el admin de carga
 * usa este id por defecto al crear inventario.
 */
export const ANCHOR_SELLER_ID = '00000000-0000-4000-8000-000000000001'

/** Estado físico de un single. Orden de mejor a peor. */
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG'

/** Acabado de la carta. MTG: foil / no-foil (etched llega en fases posteriores). */
export type Finish = 'nonfoil' | 'foil'

export const CONDITIONS: readonly Condition[] = ['NM', 'LP', 'MP', 'HP', 'DMG']
export const FINISHES: readonly Finish[] = ['nonfoil', 'foil']

/**
 * Snapshot de los datos canónicos de una carta tomados de Scryfall (fuente de
 * verdad). Se guardan en la fila de inventory para renderizar sin volver a
 * llamar a Scryfall. Las cartas son inmutables, por eso el snapshot es seguro.
 */
export interface CardSnapshot {
  /** Identificador único de la impresión en Scryfall. */
  scryfallId: string
  /** Identificador del oracle (la carta lógica, compartido entre impresiones). */
  oracleId: string
  /** Nombre de la carta. */
  name: string
  /** Código del set (p.ej. 'mh3'). */
  setCode: string
  /** Nombre legible del set (p.ej. 'Modern Horizons 3'). */
  setName: string
  /** Número de coleccionista dentro del set. */
  collectorNumber: string
  /** Idioma de la impresión según Scryfall (p.ej. 'en', 'es'). */
  lang: string
  /** Rareza (p.ej. 'common', 'rare', 'mythic'). */
  rarity: string
  /** Acabados disponibles para esta impresión según Scryfall. */
  finishes: string[]
  /**
   * URL de imagen de la carta servida por Scryfall.
   * TODO: migrar a R2 en fase posterior; por ahora se referencia directo.
   */
  imageUrl: string | null
}

/**
 * Un item de inventario: un single físico a la venta, ligado a una impresión de
 * Scryfall. Combina el snapshot de la carta con los datos de la oferta.
 */
export interface InventoryItem {
  /** UUID del item de inventario. */
  id: string
  /** Seller que ofrece el item. */
  sellerId: string
  /** Carta (snapshot de Scryfall). */
  card: CardSnapshot
  /** Condición física. */
  condition: Condition
  /** Idioma del single ofrecido (puede diferir del de la impresión base). */
  language: string
  /** Acabado ofrecido. */
  finish: Finish
  /** Precio en centavos MXN (entero, nunca float). */
  priceCents: number
  /** Cantidad disponible. */
  quantity: number
  /** Estado de la publicación. */
  status: 'active' | 'inactive'
}

/** Respuesta paginada de `GET /catalog`. */
export interface CatalogListResponse {
  items: InventoryItem[]
  /** Total de items que cumplen el filtro (para paginación). */
  total: number
  limit: number
  offset: number
}
