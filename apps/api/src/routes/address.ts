/**
 * Consulta pública de direcciones (TASK-061.02).
 *
 * Un solo endpoint: dame un CP de 5 dígitos y te doy estado, municipio y las
 * colonias que SEPOMEX registra ahí. Lo consume el formulario de envío del
 * checkout mientras el comprador todavía escribe.
 *
 * SIN AUTH, igual que `/catalog` y `/sellers`: es reference data pública y la
 * petición no lleva ni un dato del comprador, solo el CP. Por lo mismo no se
 * loguea nada del request — no hay nada que loguear que no sea el CP.
 *
 * DELIBERADAMENTE de a un CP: no hay volcado, ni listado, ni búsqueda por
 * nombre de colonia. Sumado al rate limit, reconstruir el catálogo por aquí
 * toma días. El catálogo de Correos de México se publica para uso particular y
 * sin permiso de redistribución (ver docs/ingenieria/sepomex.md), así que el
 * endpoint sirve consultas, no copias.
 */

import { sepomexCorpusMeta, sepomexSettlements } from '@thepubmarket/db'
import { isValidPostalCode } from '@thepubmarket/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { lookupPostalCode } from '../lib/postal-codes'
import { checkRateLimit, clientIp } from '../lib/rate-limit'
import type { AppEnv } from '../types'

/**
 * Tope por IP y hora. Un comprador llenando un formulario hace un puñado de
 * consultas, así que no lo roza ni corrigiendo el CP varias veces; a quien
 * quisiera enumerar los 31,877 CPs del país le tomaría casi dos semanas.
 */
const LOOKUP_LIMIT_PER_HOUR = 120

/**
 * Cache de navegador/CDN. Corto comparado con el de KV a propósito: el de KV
 * se invalida solo al cambiar el vintage (la llave lo incluye), este no, así
 * que una hora acota cuánto puede sobrevivir una respuesta vieja tras un
 * refresh del corpus.
 */
const BROWSER_CACHE_SECONDS = 60 * 60

export const address = new Hono<AppEnv>()

/**
 * GET /address/postal-codes/:postalCode
 *
 * 200 con `found: false` cuando el CP está bien formado pero no existe en el
 * catálogo — es un desenlace normal (fraccionamientos nuevos, erratas) y el
 * formulario lo trata como "escríbelo a mano", no como una falla.
 * 400 solo si el parámetro no es un CP.
 */
address.get('/postal-codes/:postalCode', async (c) => {
  const postalCode = c.req.param('postalCode').trim()
  // Se valida antes de tocar KV o D1: un parámetro que no es un CP no llega
  // a la base.
  if (!isValidPostalCode(postalCode)) {
    return c.json({ error: 'invalid_postal_code' }, 400)
  }

  const ip = clientIp(c.req.header('cf-connecting-ip'))
  if (!(await checkRateLimit(c.env.SESSIONS, 'cp:ip', ip, LOOKUP_LIMIT_PER_HOUR, 60 * 60))) {
    return c.json({ error: 'rate_limited' }, 429)
  }

  const db = c.get('db')
  const { response } = await lookupPostalCode(
    {
      kv: c.env.SESSIONS,
      loadSettlements: (cp) =>
        db.select().from(sepomexSettlements).where(eq(sepomexSettlements.postalCode, cp)),
      loadCorpusVersion: async () => {
        const [meta] = await db
          .select({ version: sepomexCorpusMeta.version })
          .from(sepomexCorpusMeta)
          .limit(1)
        return meta?.version ?? null
      },
    },
    postalCode,
  )

  c.header('cache-control', `public, max-age=${BROWSER_CACHE_SECONDS}`)
  return c.json(response)
})
