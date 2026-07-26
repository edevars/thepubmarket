/**
 * Protección de las rutas de admin (carga de inventario e invitación de
 * vendedores).
 *
 * Gate por clave compartida (`x-admin-key` contra `env.ADMIN_API_KEY`). Bloquea
 * por defecto: si no hay clave configurada en el entorno, NINGUNA petición pasa
 * (fail-closed). En local se define en `.dev.vars`; en producción como secreto
 * de Wrangler (`wrangler secret put`).
 *
 * Revisión TASK-010 — qué se endureció y qué sigue pendiente:
 *   * La comparación es de tiempo constante sobre el SHA-256 de cada valor. Se
 *     compara el digest, no el texto, para que la longitud de la clave tampoco
 *     se filtre por el tiempo de respuesta.
 *   * Los intentos FALLIDOS se limitan por IP en KV (`checkRateLimit`), así una
 *     clave robada/adivinada no se puede montar a fuerza bruta desde un origen.
 *     Las peticiones exitosas no gastan presupuesto.
 *   * Una clave corta solo dispara `console.warn`: fallar cerrado por longitud
 *     dejaría al operador fuera del admin de producción sin previo aviso.
 *
 * PENDIENTE (necesita dashboard de Cloudflare, mismo bloqueo que TASK-009):
 *   una clave compartida autentica a "quien tiene la clave", no a una persona.
 *   El cierre real es poner `/admin/*` detrás de Cloudflare Access con service
 *   tokens (`CF-Access-Client-Id` / `CF-Access-Client-Secret`), que sí funcionan
 *   para llamadas no interactivas. Mientras tanto, la atribución de quién hizo
 *   qué se registra por convención vía `x-admin-actor` (ver routes/admin.ts).
 */

import { createMiddleware } from 'hono/factory'
import { checkRateLimit, clientIp } from '../lib/rate-limit'
import type { AppEnv } from '../types'

/** Longitud mínima recomendada de `ADMIN_API_KEY` (solo advertencia). */
const MIN_KEY_LENGTH = 32
/** Intentos fallidos tolerados por IP dentro de la ventana. */
const FAILED_ATTEMPT_LIMIT = 10
const FAILED_ATTEMPT_WINDOW_SECONDS = 15 * 60

/**
 * Compara dos secretos en tiempo constante. Hashea ambos con SHA-256 primero:
 * los digests siempre miden 32 bytes, así el bucle no depende de la longitud
 * del valor recibido y no hay oráculo de tiempo ni por contenido ni por tamaño.
 */
async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const av = new Uint8Array(a)
  const bv = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < av.length; i++) diff |= (av[i] ?? 0) ^ (bv[i] ?? 0)
  return diff === 0
}

export const adminAuth = createMiddleware<AppEnv>(async (c, next) => {
  const expected = c.env.ADMIN_API_KEY
  // Fail-closed: sin clave configurada, no se entra.
  if (!expected) {
    return c.json({ error: 'admin_auth_not_configured' }, 503)
  }
  if (expected.length < MIN_KEY_LENGTH) {
    console.warn(
      `admin-auth: ADMIN_API_KEY tiene ${expected.length} caracteres; se recomiendan al menos ${MIN_KEY_LENGTH}`,
    )
  }

  const ip = clientIp(c.req.header('cf-connecting-ip'))
  const provided = c.req.header('x-admin-key')

  if (!provided || !(await secretsMatch(provided, expected))) {
    // Solo los fallos consumen presupuesto: el operador legítimo nunca choca
    // con el límite, y quien adivina se queda sin intentos.
    const withinLimit = await checkRateLimit(
      c.env.SESSIONS,
      'admin:fail',
      ip,
      FAILED_ATTEMPT_LIMIT,
      FAILED_ATTEMPT_WINDOW_SECONDS,
    )
    if (!withinLimit) {
      console.warn(`admin-auth: demasiados intentos fallidos desde ${ip}`)
      return c.json({ error: 'rate_limited' }, 429)
    }
    return c.json({ error: 'unauthorized' }, 401)
  }

  await next()
})
