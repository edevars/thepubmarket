'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

export default function CheckoutCancelPage() {
  const t = useTranslations('checkout')
  return (
    <main className="mx-auto w-full max-w-[640px] px-5 py-20 text-center">
      <h1 className="mb-3 font-display text-3xl font-bold tracking-[0.02em] text-white">
        {t('cancelTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">{t('cancelSubtitle')}</p>
      <Link href="/cart" className="text-primary-hover hover:text-cyan">
        {t('backToCart')} ›
      </Link>
    </main>
  )
}
