'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useState } from 'react'
import { TURNSTILE_SLOT_CLASS, useTurnstile } from '@/components/security/useTurnstile'
import { AngularButton } from '@/components/ui/AngularButton'
import { Spinner } from '@/components/ui/Spinner'
import { Link } from '@/i18n/navigation'
import { type AuthPhase, isBusy } from '@/lib/auth-phase'
import { isValidEmail } from '@/lib/auth-validation'
import { NETWORK_ERROR, requestPasswordReset } from '@/lib/session'

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
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [emailTouched, setEmailTouched] = useState(false)
  const [sent, setSent] = useState(false)
  const [phase, setPhase] = useState<AuthPhase>('idle')
  const busy = isBusy(phase)
  const [error, setError] = useState<string | null>(null)
  const turnstile = useTurnstile('password-forgot')
  const emailInvalid = emailTouched && email.trim().length > 0 && !isValidEmail(email)

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 py-16">
      <h1 className="mb-2 font-display text-3xl font-bold tracking-[0.02em] text-white">
        {t('forgotPasswordTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">{t('forgotPasswordSubtitle')}</p>

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
            setError(null)
            try {
              setPhase('verifying')
              const turnstileToken = await turnstile.getToken()
              if (turnstile.enabled && !turnstileToken) {
                setPhase('idle')
                setError(t('errorVerification'))
                return
              }
              setPhase('submitting')
              // La respuesta de la API es neutral (no dice si el correo
              // existe); un fallo aquí es un rechazo real: Turnstile, rate
              // limit o red.
              const result = await requestPasswordReset(email.trim().toLowerCase(), turnstileToken)
              setPhase('idle')
              if (!result.ok) {
                setError(
                  result.error === NETWORK_ERROR
                    ? t('errorNetwork')
                    : result.error === 'rate_limited'
                      ? t('errorRateLimited')
                      : t('errorVerification'),
                )
                return
              }
              setSent(true)
            } catch (err) {
              console.error('forgot-password: submit failed', err)
              setPhase('idle')
              setError(t('errorUnexpected'))
            }
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={turnstile.prewarm}
            onBlur={() => setEmailTouched(true)}
            placeholder={t('emailPlaceholder')}
            aria-label={t('emailPlaceholder')}
            aria-invalid={emailInvalid}
            className={`border bg-input px-4 py-3 text-sm text-ink outline-none focus:border-primary ${
              emailInvalid ? 'border-[#d6584f]' : 'border-line'
            }`}
          />
          {emailInvalid && <p className="text-[12.5px] text-[#d6584f]">{t('errorInvalidEmail')}</p>}
          {error && <p className="text-sm text-[#d6584f]">{error}</p>}
          <div ref={turnstile.containerRef} className={TURNSTILE_SLOT_CLASS} />
          <AngularButton type="submit" disabled={busy} className="gap-2">
            {busy && <Spinner />}
            {phase === 'verifying'
              ? t('verifying')
              : phase === 'idle'
                ? t('sendResetLink')
                : t('sendingLink')}
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
