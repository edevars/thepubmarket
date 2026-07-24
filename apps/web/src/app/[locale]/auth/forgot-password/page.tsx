'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useState } from 'react'
import { AngularButton } from '@/components/ui/AngularButton'
import { Link } from '@/i18n/navigation'
import { isValidEmail } from '@/lib/auth-validation'
import { requestPasswordReset } from '@/lib/session'

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<main className="px-5 py-20" />}>
      <ForgotPasswordInner />
    </Suspense>
  )
}

function ForgotPasswordInner() {
  const t = useTranslations('auth')
  const params = useSearchParams()
  const legacy = params.get('reason') === 'legacy'
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [emailTouched, setEmailTouched] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const emailInvalid = emailTouched && email.trim().length > 0 && !isValidEmail(email)

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 py-16">
      <h1 className="mb-2 font-display text-3xl font-bold tracking-[0.02em] text-white">
        {t('forgotPasswordTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {legacy ? t('forgotPasswordLegacyHint') : t('forgotPasswordSubtitle')}
      </p>

      {sent ? (
        <div className="border border-line bg-panel-2 px-5 py-6">
          <p className="text-sm text-ink">{t('resetLinkSent', { email })}</p>
          <p className="mt-2 text-[12.5px] text-muted-2">{t('linkSentHint')}</p>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setEmailTouched(true)
            if (!email.trim()) return
            if (!isValidEmail(email)) return
            setBusy(true)
            await requestPasswordReset(email.trim().toLowerCase())
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
            onBlur={() => setEmailTouched(true)}
            placeholder={t('emailPlaceholder')}
            aria-label={t('emailPlaceholder')}
            aria-invalid={emailInvalid}
            className={`border bg-input px-4 py-3 text-sm text-ink outline-none focus:border-primary ${
              emailInvalid ? 'border-[#d6584f]' : 'border-line'
            }`}
          />
          {emailInvalid && <p className="text-[12.5px] text-[#d6584f]">{t('errorInvalidEmail')}</p>}
          <AngularButton type="submit" disabled={busy}>
            {busy ? t('sending') : t('sendResetLink')}
          </AngularButton>
        </form>
      )}

      <div className="mt-5 text-sm text-muted">
        <Link href="/login" className="text-primary-hover hover:text-cyan">
          {t('backToSignIn')}
        </Link>
      </div>
    </main>
  )
}
