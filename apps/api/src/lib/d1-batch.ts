/**
 * Helpers para no rebasar el tope de parámetros enlazados de D1.
 *
 * D1 rechaza un statement con más de 100 bound parameters. Un `IN (...)` sobre
 * una lista de ids enlaza uno por id, así que cualquier consulta cuyo tamaño
 * dependa de datos (una página de catálogo, las órdenes de un comprador) tiene
 * que partirse. No es una optimización: pasarse tumba la petición completa con
 * un 500, y solo ocurre cuando el negocio empieza a crecer — el catálogo
 * público estuvo caído por esto al pasar de 100 singles activos (TASK-047).
 */

/**
 * Tope de ids por statement. Debajo de 100 a propósito: deja lugar para los
 * demás parámetros que la misma consulta pueda enlazar (filtros, orden).
 */
export const MAX_BOUND_IDS = 90

/** Parte una lista de ids en tramos que D1 sí acepta enlazar. */
export function chunkIds<T>(ids: readonly T[], size = MAX_BOUND_IDS): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

/**
 * Corre una consulta por-ids en tramos y junta las filas.
 *
 * `run` recibe un tramo de ids y debe devolver sus filas; los tramos van en
 * paralelo, así que el orden ENTRE tramos no está garantizado. Quien dependa
 * del orden debe reordenar (o agrupar por id, que es el caso normal).
 *
 * Con una lista vacía no toca la base y devuelve `[]`.
 */
export async function selectByIds<Id, Row>(
  ids: readonly Id[],
  run: (chunk: Id[]) => Promise<Row[]>,
): Promise<Row[]> {
  if (ids.length === 0) return []
  if (ids.length <= MAX_BOUND_IDS) return run([...ids])
  const results = await Promise.all(chunkIds(ids).map(run))
  return results.flat()
}
