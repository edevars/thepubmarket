/**
 * Mapeo entre la fila de `inventory` (tipo inferido del esquema Drizzle en
 * @thepubmarket/db) y el contrato `InventoryItem` (DTO HTTP que consume la web).
 */

import type { InventoryRow } from '@thepubmarket/db'
import type { Condition, InventoryItem } from '@thepubmarket/shared'

/** Convierte una fila de Drizzle al contrato público `InventoryItem`. */
export function rowToInventoryItem(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    sellerId: row.sellerId,
    card: {
      scryfallId: row.scryfallId ?? '',
      oracleId: row.oracleId ?? '',
      name: row.title,
      setCode: row.setCode ?? '',
      setName: row.setName ?? '',
      collectorNumber: row.collectorNumber ?? '',
      lang: row.cardLang ?? '',
      rarity: row.rarity ?? '',
      finishes: [],
      imageUrl: row.imageUrl,
    },
    condition: (row.condition ?? 'NM') as Condition,
    language: row.cardLang ?? '',
    finish: row.finish,
    priceCents: row.priceCents,
    quantity: row.quantity,
    status: row.status,
  }
}
