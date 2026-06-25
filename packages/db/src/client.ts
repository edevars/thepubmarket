/**
 * Cliente Drizzle sobre D1. Crea una instancia por request a partir del binding
 * `DB` del Worker. Cualquier worker con un binding D1 puede usar este cliente
 * con el mismo esquema compartido.
 */
import { drizzle } from 'drizzle-orm/d1'
import { schema } from './schema'

/** Crea el cliente Drizzle tipado para una D1Database. */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

/** Tipo del cliente Drizzle de la app (con el esquema cargado). */
export type Db = ReturnType<typeof createDb>
