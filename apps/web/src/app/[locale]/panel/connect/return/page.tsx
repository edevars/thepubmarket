'use client'

import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'

/**
 * `return_url` de la Account Link de Stripe (ver POST /seller/connect/onboarding-link).
 * Solo UX: el flip real de `sellers.status` lo hace el webhook `account.updated`,
 * no esta redirección. Manda al seller a ver su estado actualizado en /panel/pagos.
 */
export default function PanelConnectReturnPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/panel/pagos')
  }, [router])
  return null
}
