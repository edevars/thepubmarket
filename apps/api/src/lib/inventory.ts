/**
 * Inventario: mapeo fila↔DTO y lógica de alta compartida (admin y panel del
 * seller publican con el mismo flujo: snapshot canónico del catálogo del juego
 * + validación del acabado; solo cambia de dónde sale el sellerId).
 *
 * El catálogo es por juego: cada `Tcg` con soporte de publicación tiene un
 * proveedor en `CATALOG_PROVIDERS` que resuelve un id de impresión a su
 * `CardSnapshot`. Un juego sin proveedor se rechaza con `tcg_not_supported`.
 */

import { type Db, type InventoryRow, inventory } from '@thepubmarket/db'
import type {
  CardSnapshot,
  Condition,
  Finish,
  InventoryItem,
  InventoryPhoto,
  Tcg,
} from '@thepubmarket/shared'
import { CatalogError } from './catalog'
import { getCardById as getRiftboundCard } from './riftcodex'
import { getCardById as getMtgCard } from './scryfall'

/**
 * Convierte una fila de Drizzle al contrato público `InventoryItem`.
 *
 * `photos` es opcional y default vacío: quien no consulte `inventory_photos`
 * devuelve una publicación sin galería, que es un estado válido.
 */
export function rowToInventoryItem(
  row: InventoryRow,
  seller: { name: string; verified: boolean },
  photos: InventoryPhoto[] = [],
): InventoryItem {
  return {
    id: row.id,
    sellerId: row.sellerId,
    sellerName: seller.name,
    sellerVerified: seller.verified,
    tcg: row.tcg as Tcg,
    card: {
      tcg: row.tcg as Tcg,
      // Filas previas a la columna catalog_id solo tienen scryfall_id (MTG).
      catalogId: row.catalogId ?? row.scryfallId ?? '',
      oracleId: row.oracleId,
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
    photos,
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
  tcg: Tcg
  /** Id de la impresión en el catálogo de su juego (UUID de Scryfall en MTG). */
  catalogId: string
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
 * Resolución de impresión por juego. Un juego aparece aquí cuando su catálogo
 * está integrado; mientras tanto publicar en él devuelve `tcg_not_supported`.
 */
const CATALOG_PROVIDERS: Partial<
  Record<Tcg, (catalogId: string, kv: KVNamespace) => Promise<CardSnapshot>>
> = {
  mtg: getMtgCard,
  riftbound: getRiftboundCard,
}

/**
 * Publica un single: trae el snapshot canónico del catálogo del juego (cache
 * KV → proveedor), valida que el acabado exista para esa impresión e inserta
 * la fila con status activo.
 */
export async function createListing(
  db: Db,
  kv: KVNamespace,
  input: ListingInput,
  sellerId: string,
): Promise<CreateListingResult> {
  const lookup = CATALOG_PROVIDERS[input.tcg]
  if (!lookup) {
    return {
      ok: false,
      error: 'tcg_not_supported',
      status: 400,
      extra: { tcg: input.tcg, supported: Object.keys(CATALOG_PROVIDERS) },
    }
  }

  let card: CardSnapshot
  try {
    card = await lookup(input.catalogId, kv)
  } catch (err) {
    if (err instanceof CatalogError) {
      // Solo Scryfall distingue el 404; RiftCodex responde 500 a un id
      // inexistente, así que ahí un id malo se ve como falla del upstream.
      return {
        ok: false,
        error: err.status === 404 ? 'card_not_found' : 'catalog_error',
        status: err.status === 404 ? 404 : 502,
        extra: { tcg: input.tcg, status: err.status },
      }
    }
    throw err
  }

  // El acabado pedido debe existir para esa impresión (cuando el catálogo lo informa).
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
      tcg: input.tcg,
      title: card.name,
      catalogId: card.catalogId,
      // Columnas legacy MTG: se siguen escribiendo solo para ese juego.
      scryfallId: card.tcg === 'mtg' ? card.catalogId : null,
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
      // Snapshot de la URL del catálogo. TODO: migrar imágenes a R2.
      imageUrl: card.imageUrl,
    })
    .returning()

  if (!row) return { ok: false, error: 'insert_failed', status: 500 }
  return { ok: true, row }
}
