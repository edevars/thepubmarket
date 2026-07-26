import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'
import { guardPanelAccess } from './lib/panel-access-guard'

/**
 * Compone el gate de Cloudflare Access para `/panel` (ver
 * `src/lib/panel-access-guard.ts`) con el middleware de i18n de next-intl.
 * El gate corre primero: si bloquea, ni siquiera llega al middleware de
 * locale. Si deja pasar (incluyendo cualquier ruta fuera de `/panel`), el
 * comportamiento de i18n queda exactamente igual que antes.
 */
const intlMiddleware = createMiddleware(routing)

export default async function middleware(request: NextRequest) {
  const accessResponse = await guardPanelAccess(request)
  if (accessResponse) return accessResponse

  return intlMiddleware(request)
}

export const config = {
  // Aplica i18n (y el gate de /panel) a todo salvo archivos estáticos,
  // internos de Next y la API.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
