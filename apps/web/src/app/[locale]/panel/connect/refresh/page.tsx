'use client'

import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'

/**
 * `refresh_url` de la Account Link de Stripe: se usa cuando el link expiró
 * antes de que el seller terminara. Vuelve a /panel/pagos, donde el CTA de
 * onboarding pide un link fresco.
 */
export default function PanelConnectRefreshPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/panel/pagos')
  }, [router])
  return null
}
