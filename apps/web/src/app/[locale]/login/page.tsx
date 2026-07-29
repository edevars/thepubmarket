'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { AngularButton } from '@/components/ui/AngularButton'
import { Link, useRouter } from '@/i18n/navigation'
import { isValidEmail } from '@/lib/auth-validation'
import { loginUser } from '@/lib/session'

export default function LoginPage() {
  const t = useTranslations('auth')
  const { user, signIn } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const emailInvalid = emailTouched && email.trim().length > 0 && !isValidEmail(email)

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
          setBusy(true)
          setError(null)
          const result = await loginUser(email.trim().toLowerCase(), password)
          setBusy(false)
          if ('error' in result) {
            // No hay rama para "cuenta sin contraseña": la API responde
            // invalid_credentials en ese caso a propósito, para no confirmar
            // qué correos están registrados. Esas cuentas se recuperan por
            // "olvidé mi contraseña" (enlace debajo del formulario).
            setError(
              result.error === 'rate_limited'
                ? t('errorRateLimited')
                : t('errorInvalidCredentials'),
            )
            return
          }
          signIn(result.sessionToken, result.user)
          router.push('/')
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
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('passwordPlaceholder')}
          aria-label={t('passwordPlaceholder')}
          className="border border-line bg-input px-4 py-3 text-sm text-ink outline-none focus:border-primary"
        />
        {error && <p className="text-sm text-[#d6584f]">{error}</p>}
        <AngularButton type="submit" disabled={busy}>
          {busy ? t('signingIn') : t('signIn')}
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
