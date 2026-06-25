/**
 * Helpers de navegación conscientes del locale (next-intl). Usar `Link` de aquí
 * en lugar de `next/link` para que las URLs respeten el prefijo de idioma
 * configurado en `routing` (ES sin prefijo, EN con `/en`).
 */
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
