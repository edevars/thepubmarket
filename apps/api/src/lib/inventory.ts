/**
 * Inventario: mapeo fila↔DTO y lógica de alta compartida (admin y panel del
 * seller publican con el mismo flujo: snapshot canónico de Scryfall +
 * validación del acabado; solo cambia de dónde sale el sellerId).
 */

import { type Db, type InventoryRow, inventory } from '@thepubmarket/db'
import type { Condition, Finish, InventoryItem, Tcg } from '@thepubmarket/shared'
import { getCardById, ScryfallError } from './scryfall'

/** Convierte una fila de Drizzle al contrato público `InventoryItem`. */
export function rowToInventoryItem(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    sellerId: row.sellerId,
    tcg: row.tcg as Tcg,
    card: {
      scryfallId: row.scryfallId ?? '',
      oracleId: row.oracleId ?? '',
      name: row.title,
      setCode: row.setCode ?? '',
      setName: row.setName ?? '',
      collectorNumber: row.collectorNumber ?? '',
      lang: row.cardLang ?? '',
      rarity: row.rarity ?? '',
      artist: row.artist,
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

/** Datos de la oferta para publicar un single (sin sellerId: lo pone el caller). */
export interface ListingInput {
  scryfallId: string
  condition: Condition
  finish: Finish
  language: string
  priceCents: number
  quantity: number
}

/** Resultado del alta: fila creada o error tipado listo para responder. */
export type CreateListingResult =
  | { ok: true; row: InventoryRow }
  | { ok: false; error: string; status: 400 | 404 | 500 | 502; extra?: Record<string, unknown> }

/**
 * Publica un single: trae el snapshot canónico (cache KV → Scryfall), valida
 * que el acabado exista para esa impresión e inserta la fila con status activo.
 */
export async function createListing(
  db: Db,
  kv: KVNamespace,
  input: ListingInput,
  sellerId: string,
): Promise<CreateListingResult> {
  let card: Awaited<ReturnType<typeof getCardById>>
  try {
    card = await getCardById(input.scryfallId, kv)
  } catch (err) {
    if (err instanceof ScryfallError) {
      return {
        ok: false,
        error: 'card_not_found_or_scryfall_error',
        status: err.status === 404 ? 404 : 502,
        extra: { status: err.status },
      }
    }
    throw err
  }

  // El acabado pedido debe existir para esa impresión (cuando Scryfall lo informa).
  if (card.finishes.length > 0 && !card.finishes.includes(input.finish)) {
    return {
      ok: false,
      error: 'finish_not_available',
      status: 400,
      extra: { available: card.finishes },
    }
  }

  const [row] = await db
    .insert(inventory)
    .values({
      id: crypto.randomUUID(),
      sellerId,
      tcg: 'mtg',
      title: card.name,
      scryfallId: card.scryfallId,
      oracleId: card.oracleId,
      setCode: card.setCode,
      setName: card.setName,
      collectorNumber: card.collectorNumber,
      cardLang: input.language,
      rarity: card.rarity,
      artist: card.artist,
      finish: input.finish,
      condition: input.condition,
      priceCents: input.priceCents,
      quantity: input.quantity,
      status: 'active',
      // Snapshot de la URL de Scryfall. TODO: migrar imágenes a R2.
      imageUrl: card.imageUrl,
    })
    .returning()

  if (!row) return { ok: false, error: 'insert_failed', status: 500 }
  return { ok: true, row }
}
