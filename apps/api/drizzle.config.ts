import { defineConfig } from 'drizzle-kit'

/**
 * Config de drizzle-kit para generar migraciones de D1.
 *
 * Flujo: `pnpm db:generate` (drizzle-kit) escribe el SQL en `migrations/`;
 * `pnpm db:migrate:local|remote` (wrangler) lo aplica a D1 e indexa en la tabla
 * `d1_migrations`. Solo se usa `generate` aquí: no requiere conexión a la BD.
 *
 * El esquema vive en el paquete compartido @thepubmarket/db.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: '../../packages/db/src/schema.ts',
  out: './migrations',
})
