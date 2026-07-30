'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { AuthRedirecting } from '@/components/auth/AuthRedirecting'
import { TURNSTILE_SLOT_CLASS, useTurnstile } from '@/components/security/useTurnstile'
import { AngularButton } from '@/components/ui/AngularButton'
import { Spinner } from '@/components/ui/Spinner'
import { Link, useRouter } from '@/i18n/navigation'
import { type AuthPhase, isBusy } from '@/lib/auth-phase'
import { isPasswordLongEnough, isValidEmail } from '@/lib/auth-validation'
import { NETWORK_ERROR, registerUser } from '@/lib/session'

export default function RegisterPage() {
  const t = useTranslations('auth')
  const { user, signIn } = useAuth()
  const router = useRouter()
  const turnstile = useTurnstile('register')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<AuthPhase>('idle')
  const busy = isBusy(phase)

  const emailInvalid = emailTouched && email.trim().length > 0 && !isValidEmail(email)
  const passwordOk = isPasswordLongEnough(password)
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

  // Same reason as the login screen: this flow ends in a client navigation to a
  // page that fetches the catalog, so warm it while the user is still typing.
  useEffect(() => {
    router.prefetch('/')
  }, [router])

  if (phase === 'done') {
    return (
      <AuthRedirecting title={t('redirAccountCreatedTitle')} body={t('redirAccountCreatedBody')} />
    )
  }

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
        {t('registerTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">{t('registerSubtitle')}</p>

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setEmailTouched(true)
          if (!email.trim() || !password) return
          if (!isValidEmail(email)) return
          if (!passwordOk) {
            setError(t('errorPasswordTooShort'))
            return
          }
          if (password !== confirmPassword) {
            setError(t('errorPasswordMismatch'))
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
            const result = await registerUser(email.trim().toLowerCase(), password, turnstileToken)
            if ('error' in result) {
              setPhase('idle')
              setError(
                result.error === NETWORK_ERROR
                  ? t('errorNetwork')
                  : result.error === 'email_taken'
                    ? t('errorEmailTaken')
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
            console.error('register: submit failed', err)
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
        <input
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={turnstile.prewarm}
          placeholder={t('passwordPlaceholder')}
          aria-label={t('passwordPlaceholder')}
          className="border border-line bg-input px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        <p className={`text-[12.5px] ${passwordOk ? 'text-cond-nm' : 'text-muted-2'}`}>
          {passwordOk ? t('passwordHintOk') : t('passwordHint')}
        </p>
        <input
          type="password"
          required
          minLength={10}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t('confirmPasswordPlaceholder')}
          aria-label={t('confirmPasswordPlaceholder')}
          aria-invalid={passwordsMismatch}
          className={`border bg-input px-4 py-3 text-sm text-ink outline-none focus:border-primary ${
            passwordsMismatch ? 'border-[#d6584f]' : 'border-line'
          }`}
        />
        {passwordsMismatch && (
          <p className="text-[12.5px] text-[#d6584f]">{t('errorPasswordMismatch')}</p>
        )}
        {passwordsMatch && <p className="text-[12.5px] text-cond-nm">{t('passwordsMatch')}</p>}
        {error && <p className="text-sm text-[#d6584f]">{error}</p>}
        <div ref={turnstile.containerRef} className={TURNSTILE_SLOT_CLASS} />
        <AngularButton type="submit" disabled={busy} className="gap-2">
          {busy && <Spinner />}
          {phase === 'verifying'
            ? t('verifying')
            : phase === 'idle'
              ? t('registerCta')
              : t('creatingAccount')}
        </AngularButton>
      </form>

      <div className="mt-5 text-sm text-muted">
        {t('haveAccount')}{' '}
        <Link href="/login" className="text-primary-hover hover:text-cyan">
          {t('signInLink')}
        </Link>
      </div>
    </main>
  )
}
