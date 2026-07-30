'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { AuthRedirecting } from '@/components/auth/AuthRedirecting'
import { TURNSTILE_SLOT_CLASS, useTurnstile } from '@/components/security/useTurnstile'
import { AngularButton } from '@/components/ui/AngularButton'
import { Spinner } from '@/components/ui/Spinner'
import { Link, useRouter } from '@/i18n/navigation'
import { type AuthPhase, isBusy } from '@/lib/auth-phase'
import { isPasswordLongEnough } from '@/lib/auth-validation'
import { NETWORK_ERROR, resetPassword } from '@/lib/session'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="px-5 py-20" />}>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const t = useTranslations('auth')
  const params = useSearchParams()
  const router = useRouter()
  const { signIn } = useAuth()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<AuthPhase>('idle')
  const busy = isBusy(phase)
  const turnstile = useTurnstile('password-reset')
  const passwordOk = isPasswordLongEnough(password)

  // Terminal: the reset token is single-use and already spent, so the form must
  // never come back. This is what stops the double submit that fired a second
  // request against a consumed token.

  // Same reason as the login screen: this flow ends in a client navigation to a
  // page that fetches the catalog, so warm it while the user is still typing.
  useEffect(() => {
    router.prefetch('/')
  }, [router])

  if (phase === 'done') {
    return (
      <AuthRedirecting title={t('redirPasswordSavedTitle')} body={t('redirPasswordSavedBody')} />
    )
  }

  if (!token) {
    return (
      <main className="mx-auto w-full max-w-[480px] px-5 py-20 text-center">
        <p className="mb-4 text-[#d6584f]">{t('resetInvalidOrExpired')}</p>
        <Link href="/auth/forgot-password" className="text-primary-hover hover:text-cyan">
          {t('tryAgain')}
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 py-16">
      <h1 className="mb-2 font-display text-3xl font-bold tracking-[0.02em] text-white">
        {t('resetPasswordTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">{t('resetPasswordSubtitle')}</p>

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!password) return
          if (!passwordOk) {
            setError(t('errorPasswordTooShort'))
            return
          }
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
            const result = await resetPassword(token, password, turnstileToken)
            if ('error' in result) {
              setPhase('idle')
              setError(
                result.error === NETWORK_ERROR
                  ? t('errorNetwork')
                  : result.error === 'invalid_or_expired'
                    ? t('resetInvalidOrExpired')
                    : result.error === 'rate_limited'
                      ? t('errorRateLimited')
                      : result.error === 'turnstile_failed'
                        ? t('errorVerification')
                        : t('errorPasswordTooShort'),
              )
              return
            }
            setPhase('done')
            signIn(result.sessionToken, result.user)
            router.push('/')
          } catch (err) {
            console.error('reset-password: submit failed', err)
            setPhase('idle')
            setError(t('errorUnexpected'))
          }
        }}
        className="flex flex-col gap-3"
      >
        <input
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={turnstile.prewarm}
          placeholder={t('newPasswordPlaceholder')}
          aria-label={t('newPasswordPlaceholder')}
          className="border border-line bg-input px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        <p className={`text-[12.5px] ${passwordOk ? 'text-cond-nm' : 'text-muted-2'}`}>
          {passwordOk ? t('passwordHintOk') : t('passwordHint')}
        </p>
        {error && (
          <p className="text-sm text-[#d6584f]">
            {error}
            {error === t('resetInvalidOrExpired') && (
              <>
                {' '}
                <Link href="/auth/forgot-password" className="text-primary-hover hover:text-cyan">
                  {t('tryAgain')}
                </Link>
              </>
            )}
          </p>
        )}
        <div ref={turnstile.containerRef} className={TURNSTILE_SLOT_CLASS} />
        <AngularButton type="submit" disabled={busy} className="gap-2">
          {busy && <Spinner />}
          {phase === 'verifying'
            ? t('verifying')
            : phase === 'idle'
              ? t('resetPasswordCta')
              : t('savingPassword')}
        </AngularButton>
      </form>
    </main>
  )
}
