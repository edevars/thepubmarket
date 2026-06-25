/**
 * Protección de las rutas de admin (carga de inventario).
 *
 * TODO: proteger con Cloudflare Access / Zero Trust.
 *   Estas rutas administran inventario interno y NO deben quedar expuestas al
 *   público. Cuando Cloudflare Access esté configurado, el panel admin debe
 *   quedar detrás de Access (validando el JWT `Cf-Access-Jwt-Assertion`) y este
 *   middleware de clave compartida desaparece.
 *
 * Mientras tanto: gate por clave compartida (`x-admin-key` contra
 * `env.ADMIN_API_KEY`). Bloquea por defecto: si no hay clave configurada en el
 * entorno, NINGUNA petición pasa (fail-closed). En local se define en
 * `.dev.vars`; en producción como secreto de Wrangler (`wrangler secret put`).
 */

import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

export const adminAuth = createMiddleware<AppEnv>(async (c, next) => {
  const expected = c.env.ADMIN_API_KEY
  // Fail-closed: sin clave configurada, no se entra.
  if (!expected) {
    return c.json({ error: 'admin_auth_not_configured' }, 503)
  }

  const provided = c.req.header('x-admin-key')
  if (!provided || provided !== expected) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  await next()
})
