import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Aplica i18n a todo salvo archivos estáticos, internos de Next y la API.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
