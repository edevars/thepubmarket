/**
 * Provider de catálogo respaldado en D1 (TASK-037): sirve juegos cuyo catálogo
 * canónico ya vive en `catalog_cards` (importado por scripts/import-*.mjs, hoy
 * Riftbound desde dotgg — TASK-036).
 *
 * Reemplaza a RiftCodex, cuyo API fan era incapaz de buscar (0 resultados para
 * todo término) y respondía 500 a ids inexistentes. Con el catálogo local:
 *   - un id desconocido es un 404 honesto (`CatalogError`), no una falla
 *     del upstream;
 *   - la búsqueda es un LIKE sobre el índice NOCASE de `name`;
 *   - no hay cache KV: una consulta a D1 local es más barata que el
 *     round-trip a KV que amortizaba a los proveedores HTTP.
 *
 * `imageUrl` apunta a nuestra ruta `/card-images/...` cuando la imagen ya está
 * espejada en R2, con fallback a la URL del CDN de origen mientras tanto.
 */

import { type CatalogCardRow, catalogCards } from '@thepubmarket/db'
import type { CardGameAttributes, CardSnapshot, Tcg } from '@thepubmarket/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import { CatalogError } from './catalog'
import type { CatalogContext, CatalogProvider } from './catalog-providers'

/** Mismo tope que usaba la búsqueda de RiftCodex/Scryfall. */
const SEARCH_LIMIT = 60

/** Fila de `catalog_cards` → snapshot compartido que guardamos/servimos. */
export function rowToSnapshot(row: CatalogCardRow, origin: string): CardSnapshot {
  return {
    tcg: row.tcg as Tcg,
    catalogId: row.catalogId,
    oracleId: row.oracleId,
    name: row.name,
    setCode: row.setCode,
    setName: row.setName,
    collectorNumber: row.collectorNumber,
    lang: row.lang,
    rarity: row.rarity,
    artist: row.artist,
    finishes: row.finishes ?? [],
    // La llave de R2 ya es el path público bajo el origin del API
    // (`card-images/<tcg>/<id>.webp` — ver routes/card-images.ts).
    imageUrl: row.imageR2Key ? `${origin}/${row.imageR2Key}` : row.sourceImageUrl,
    gameAttributes: row.gameAttributes
      ? (JSON.parse(row.gameAttributes) as CardGameAttributes)
      : null,
  }
}

/**
 * Construye el provider local para un juego. Un juego entra aquí cuando su
 * importer llena `catalog_cards`; el registro en catalog-providers.ts decide
 * quién usa esto y quién sigue en un proveedor HTTP.
 */
export function localCatalogProvider(tcg: Tcg): CatalogProvider {
  return {
    async getCardById(catalogId: string, ctx: CatalogContext): Promise<CardSnapshot> {
      const row = await ctx.db
        .select()
        .from(catalogCards)
        .where(and(eq(catalogCards.tcg, tcg), eq(catalogCards.catalogId, catalogId)))
        .get()
      if (!row) throw new CatalogError(`card not found in local ${tcg} catalog`, 404)
      return rowToSnapshot(row, ctx.origin)
    },

    async searchCards(query: string, ctx: CatalogContext): Promise<CardSnapshot[]> {
      const trimmed = query.trim()
      if (!trimmed) return []

      // `%`/`_` del usuario son literales, no wildcards del LIKE.
      const escaped = trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`)
      const rows = await ctx.db
        .select()
        .from(catalogCards)
        .where(
          and(
            eq(catalogCards.tcg, tcg),
            sql`${catalogCards.name} LIKE ${`%${escaped}%`} ESCAPE '\\'`,
          ),
        )
        .orderBy(asc(catalogCards.name))
        .limit(SEARCH_LIMIT)
        .all()
      return rows.map((row) => rowToSnapshot(row, ctx.origin))
    },
  }
}
