/**
 * Punto de entrada de @thepubmarket/db. Reexporta el esquema, el cliente y los
 * tipos inferidos de cada tabla para consumir desde cualquier worker.
 */

export { createDb, type Db } from './client'
export * from './schema'

import type {
  catalogCards,
  inventory,
  inventoryPhotos,
  orderItems,
  orders,
  sellerInvitations,
  sellers,
  sepomexCorpusMeta,
  sepomexSettlements,
  users,
  webhookEvents,
} from './schema'

// Tipos de fila inferidos del esquema (fuente única de verdad).
export type UserRow = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type SellerRow = typeof sellers.$inferSelect
export type NewSeller = typeof sellers.$inferInsert
export type SellerInvitationRow = typeof sellerInvitations.$inferSelect
export type NewSellerInvitation = typeof sellerInvitations.$inferInsert
export type InventoryRow = typeof inventory.$inferSelect
export type NewInventory = typeof inventory.$inferInsert
export type InventoryPhotoRow = typeof inventoryPhotos.$inferSelect
export type NewInventoryPhoto = typeof inventoryPhotos.$inferInsert
export type OrderRow = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItemRow = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert
export type WebhookEventRow = typeof webhookEvents.$inferSelect
export type NewWebhookEvent = typeof webhookEvents.$inferInsert
export type CatalogCardRow = typeof catalogCards.$inferSelect
export type NewCatalogCard = typeof catalogCards.$inferInsert
export type SepomexSettlementRow = typeof sepomexSettlements.$inferSelect
export type NewSepomexSettlement = typeof sepomexSettlements.$inferInsert
export type SepomexCorpusMetaRow = typeof sepomexCorpusMeta.$inferSelect
export type NewSepomexCorpusMeta = typeof sepomexCorpusMeta.$inferInsert
