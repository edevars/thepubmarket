import { PanelShell } from '@/components/panel/PanelShell'

/**
 * Layout del Panel del Vendedor. El chrome del marketplace se oculta vía
 * `MarketplaceChrome` (layout del locale); el shell trae sidebar + topbar y el
 * guard de acceso (sesión + tienda vinculada) del lado del cliente.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>
}
