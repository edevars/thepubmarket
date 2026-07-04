'use client'

import { usePathname } from '@/i18n/navigation'

/**
 * Envuelve el chrome del marketplace (header/footer/drawer) y lo oculta dentro
 * del Panel del Vendedor (`/panel/*`), que trae su propio layout de trabajo.
 * Nota: pathname de @/i18n/navigation ya viene sin prefijo de locale.
 */
export function MarketplaceChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/panel' || pathname.startsWith('/panel/')) return null
  return <>{children}</>
}
