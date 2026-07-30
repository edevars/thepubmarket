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
import { isValidEmail } from '@/lib/auth-validation'
import { loginUser, NETWORK_ERROR } from '@/lib/session'

export default function LoginPage() {
  const t = useTranslations('auth')
  const { user, signIn } = useAuth()
  const router = useRouter()
  const turnstile = useTurnstile('login')
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<AuthPhase>('idle')
  const busy = isBusy(phase)
  const emailInvalid = emailTouched && email.trim().length > 0 && !isValidEmail(email)

  // Warm the destination while the user is still typing. Signing in ends in a
  // client navigation to a page that fetches the catalog; without this, that
  // load starts only after the credentials come back and shows up as "login is
  // slow" even though the API answered in ~250ms.
  useEffect(() => {
    router.prefetch('/')
  }, [router])

  if (phase === 'done') {
    return <AuthRedirecting title={t('redirSignedInTitle')} body={t('redirSignedInBody')} />
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
        {t('signInTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">{t('signInSubtitle')}</p>

      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setEmailTouched(true)
          if (!email.trim() || !password) return
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
            const result = await loginUser(email.trim().toLowerCase(), password, turnstileToken)
            if ('error' in result) {
              setPhase('idle')
              // No hay rama para "cuenta sin contraseña": la API responde
              // invalid_credentials en ese caso a propósito, para no confirmar
              // qué correos están registrados. Esas cuentas se recuperan por
              // "olvidé mi contraseña" (enlace debajo del formulario).
              setError(
                result.error === NETWORK_ERROR
                  ? t('errorNetwork')
                  : result.error === 'rate_limited'
                    ? t('errorRateLimited')
                    : result.error === 'turnstile_failed'
                      ? t('errorVerification')
                      : t('errorInvalidCredentials'),
              )
              return
            }
            // Stays in `done` on purpose: the page is navigating away, so the
            // form must not come back to life under the redirect screen.
            setPhase('done')
            signIn(result.sessionToken, result.user)
            router.push('/')
          } catch (err) {
            console.error('login: submit failed', err)
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={turnstile.prewarm}
          placeholder={t('passwordPlaceholder')}
          aria-label={t('passwordPlaceholder')}
          className="border border-line bg-input px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        {error && <p className="text-sm text-[#d6584f]">{error}</p>}
        <div ref={turnstile.containerRef} className={TURNSTILE_SLOT_CLASS} />
        <AngularButton type="submit" disabled={busy} className="gap-2">
          {busy && <Spinner />}
          {phase === 'verifying' ? t('verifying') : phase === 'idle' ? t('signIn') : t('signingIn')}
        </AngularButton>
      </form>

      <div className="mt-5 flex flex-col gap-1.5 text-sm text-muted">
        <Link href="/auth/forgot-password" className="text-primary-hover hover:text-cyan">
          {t('forgotPasswordLink')}
        </Link>
        <span>
          {t('noAccount')}{' '}
          <Link href="/register" className="text-primary-hover hover:text-cyan">
            {t('registerLink')}
          </Link>
        </span>
      </div>
    </main>
  )
}
