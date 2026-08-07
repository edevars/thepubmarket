/**
 * Inventario: mapeo fila↔DTO y lógica de alta compartida (admin y panel del
 * seller publican con el mismo flujo: snapshot canónico del catálogo del juego
 * + validación del acabado; solo cambia de dónde sale el sellerId).
 *
 * El catálogo es por juego: cada `Tcg` con soporte de publicación tiene un
 * proveedor en `CATALOG_PROVIDERS` que resuelve un id de impresión a su
 * `CardSnapshot`. Un juego sin proveedor se rechaza con `tcg_not_supported`.
 */

import { type InventoryRow, inventory } from '@thepubmarket/db'
import type {
  CardGameAttributes,
  CardSnapshot,
  Condition,
  Finish,
  InventoryItem,
  InventoryPhoto,
  Tcg,
} from '@thepubmarket/shared'
import { CatalogError } from './catalog'
import { type CatalogContext, catalogProviderFor, supportedTcgs } from './catalog-providers'

/**
 * Lee los atributos de juego guardados como JSON. Defensivo a propósito: un
 * blob corrupto o de una forma vieja debe degradar el detalle, nunca tumbar el
 * render de una publicación que por lo demás está bien.
 */
function parseGameAttributes(raw: string | null): CardGameAttributes | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CardGameAttributes
    return parsed && typeof parsed === 'object' && 'tcg' in parsed ? parsed : null
  } catch {
    return null
  }
}

/**
 * Id de impresión de una fila de inventario en el catálogo de su juego.
 * Filas previas a la columna `catalog_id` solo tienen `scryfall_id` (MTG).
 * Se usa tanto para armar el snapshot como para enriquecer el detalle con
 * datos que viven en `catalog_cards` y no en el snapshot de `inventory`
 * (rules_text/flavor_text — ver `catalog.get('/:id')` y TASK-038).
 */
export function catalogIdOf(row: InventoryRow): string {
  return row.catalogId ?? row.scryfallId ?? ''
}

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
      catalogId: catalogIdOf(row),
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
      gameAttributes: parseGameAttributes(row.cardAttributes),
    },
    photos,
    condition: (row.condition ?? 'NM') as Condition,
    language: row.cardLang ?? '',
    finish: row.finish,
    priceCents: row.priceCents,
    quantity: row.quantity,
    status: row.status,
    // Unix seconds tal cual la columna (TASK-049), para sort=newest.
    createdAt: row.createdAt,
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
 * Publica un single: trae el snapshot canónico del catálogo del juego (local
 * en D1 o proveedor HTTP con cache KV, según el juego), valida que el acabado
 * exista para esa impresión e inserta la fila con status activo.
 */
export async function createListing(
  ctx: CatalogContext,
  input: ListingInput,
  sellerId: string,
): Promise<CreateListingResult> {
  const { db } = ctx
  const provider = catalogProviderFor(input.tcg)
  if (!provider) {
    return {
      ok: false,
      error: 'tcg_not_supported',
      status: 400,
      extra: { tcg: input.tcg, supported: supportedTcgs() },
    }
  }

  let card: CardSnapshot
  try {
    card = await provider.getCardById(input.catalogId, ctx)
  } catch (err) {
    if (err instanceof CatalogError) {
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
      cardAttributes: card.gameAttributes ? JSON.stringify(card.gameAttributes) : null,
    })
    .returning()

  if (!row) return { ok: false, error: 'insert_failed', status: 500 }
  return { ok: true, row }
}
