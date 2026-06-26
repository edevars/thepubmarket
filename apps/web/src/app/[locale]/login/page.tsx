'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { AngularButton } from '@/components/ui/AngularButton'
import { Link } from '@/i18n/navigation'
import { requestMagicLink } from '@/lib/session'

export default function LoginPage() {
  const t = useTranslations('auth')
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (user) {
    return (
      <main className="mx-auto w-full max-w-[480px] px-5 py-16 text-center">
        <p className="text-muted">{t('alreadySignedIn', { email: user.email })}</p>
        <Link href="/" className="mt-4 inline-block text-primary-hover hover:text-cyan">
          {t('backHome')}
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 py-16">
      <h1 className="mb-2 font-display text-3xl font-bold tracking-[0.02em] text-white">
        {t('signInTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">{t('signInSubtitle')}</p>

      {sent ? (
        <div className="border border-line bg-panel-2 px-5 py-6">
          <p className="text-sm text-ink">{t('linkSent', { email })}</p>
          <p className="mt-2 text-[12.5px] text-muted-2">{t('linkSentHint')}</p>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!email.trim()) return
            setBusy(true)
            await requestMagicLink(email.trim().toLowerCase())
            setBusy(false)
            setSent(true)
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            aria-label={t('emailPlaceholder')}
            className="border border-line bg-input px-4 py-3 text-sm text-ink outline-none focus:border-primary"
          />
          <AngularButton type="submit" disabled={busy}>
            {busy ? t('sending') : t('sendLink')}
          </AngularButton>
        </form>
      )}
    </main>
  )
}
