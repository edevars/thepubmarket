import { type NextRequest, NextResponse } from 'next/server'
import { routing } from '../i18n/routing'
import { verifyAccessJwt } from './cloudflare-access'

/**
 * Gate de Cloudflare Access para `/panel` (con o sin prefijo de locale).
 *
 * Esto es una capa de red ADICIONAL al auth de aplicación que ya existe
 * (sellerAuth en la API + guard cliente de PanelShell) — no lo reemplaza y
 * no toca ninguno de los dos. Ver `docs/ingenieria/cloudflare-access-panel.md`
 * para la justificación completa (por qué Access solo protege estas páginas
 * y no la API, cómo se configura en el dashboard, y el gap de `workers.dev`
 * que este chequeo cierra).
 *
 * Vive en un módulo aparte de `middleware.ts` a propósito: `middleware.ts`
 * importa `next-intl/middleware`, que a su vez importa `next/server` desde
 * la copia de `next` que resuelve DENTRO del árbol de `next-intl` en
 * node_modules — algo que el resolver de Vite/Vitest no logra resolver en
 * este monorepo (symlinks de pnpm). Si esta lógica viviera en `middleware.ts`,
 * cualquier test que la importe arrastraría esa cadena rota. Manteniéndola
 * aquí, los tests importan `next/server` directo (la copia de `next` de
 * apps/web, sin ese problema) y nunca tocan `next-intl`.
 */
const localesPattern = routing.locales.join('|')
const PANEL_PATH_RE = new RegExp(`^/(?:(?:${localesPattern})/)?panel(?:/|$)`)

export function isPanelPath(pathname: string): boolean {
  return PANEL_PATH_RE.test(pathname)
}

/**
 * Devuelve `null` cuando la petición puede continuar (el caller decide qué
 * hacer después, p.ej. seguir con el middleware de next-intl), o una
 * `NextResponse` de bloqueo (401/403/503) cuando no.
 */
export async function guardPanelAccess(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (!isPanelPath(pathname)) return null

  const isProd = process.env.NODE_ENV === 'production'

  // Bypass de desarrollo local: nunca tiene efecto en producción, ni por
  // accidente (si `ACCESS_LOCAL_BYPASS=true` llegara a un build de prod, es
  // un no-op, no un bypass).
  if (!isProd && process.env.ACCESS_LOCAL_BYPASS === 'true') {
    console.warn(
      '[cloudflare-access] ACCESS_LOCAL_BYPASS activo: /panel corre sin Access en local.',
    )
    return null
  }

  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN
  const aud = process.env.CF_ACCESS_AUD

  if (!teamDomain || !aud) {
    if (isProd) {
      // Fail-closed: sin config no entra nadie (mismo espíritu que
      // apps/api/src/middleware/admin-auth.ts).
      return NextResponse.json({ error: 'access_not_configured' }, { status: 503 })
    }
    console.warn(
      '[cloudflare-access] CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD sin configurar: /panel corre sin protección en local.',
    )
    return null
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await verifyAccessJwt(token, { teamDomain, aud })
  if (!result.valid) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return null
}
