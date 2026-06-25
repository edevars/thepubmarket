/**
 * Punto de entrada de @thepubmarket/db. Reexporta el esquema, el cliente y los
 * tipos inferidos de cada tabla para consumir desde cualquier worker.
 */

export { createDb, type Db } from './client'
export * from './schema'

import type { inventory, orderItems, orders, sellers, users } from './schema'

// Tipos de fila inferidos del esquema (fuente única de verdad).
export type UserRow = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type SellerRow = typeof sellers.$inferSelect
export type NewSeller = typeof sellers.$inferInsert
export type InventoryRow = typeof inventory.$inferSelect
export type NewInventory = typeof inventory.$inferInsert
export type OrderRow = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItemRow = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert
