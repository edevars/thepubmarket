import type { InventoryItem } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import type { SellerProfile } from '@/lib/sellers/types'
import { SellerAbout } from './SellerAbout'
import { SellerBreadcrumb } from './SellerBreadcrumb'
import { SellerHero } from './SellerHero'
import { SellerHours } from './SellerHours'
import { SellerInventory } from './SellerInventory'
import { SellerLocation } from './SellerLocation'

interface SellerHubViewProps {
  seller: SellerProfile
  inventory: InventoryItem[]
}

/** Perfil público completo de una tienda (hub del vendedor). */
export function SellerHubView({ seller, inventory }: SellerHubViewProps) {
  const t = useTranslations('sellers')

  return (
    <div className="flex flex-col gap-10">
      <SellerBreadcrumb name={seller.name} />
      <SellerHero seller={seller} />

      {inventory.length > 0 ? (
        <SellerInventory items={inventory} />
      ) : (
        <div className="border border-dashed border-line bg-panel-2 px-6 py-16 text-center">
          <h2 className="mb-2 font-display text-xl font-bold tracking-[0.03em] text-white">
            {t('inventoryEmptyTitle')}
          </h2>
          <p className="mx-auto max-w-[400px] text-[13.5px] text-muted-2">
            {t('inventoryEmptyBody')}
          </p>
        </div>
      )}

      <SellerAbout seller={seller} />
      <SellerLocation seller={seller} />
      <SellerHours seller={seller} />

      <p className="border-t border-line-soft pt-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-faint-2">
        {t('hubFooter', { name: seller.name })}
      </p>
    </div>
  )
}
