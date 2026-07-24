'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { AngularButton } from '@/components/ui/AngularButton'
import { Link, useRouter } from '@/i18n/navigation'
import { isPasswordLongEnough, isValidEmail } from '@/lib/auth-validation'
import { registerUser } from '@/lib/session'

export default function RegisterPage() {
  const t = useTranslations('auth')
  const { user, signIn } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const emailInvalid = emailTouched && email.trim().length > 0 && !isValidEmail(email)
  const passwordOk = isPasswordLongEnough(password)
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword

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
          setBusy(true)
          setError(null)
          const result = await registerUser(email.trim().toLowerCase(), password)
          setBusy(false)
          if ('error' in result) {
            setError(
              result.error === 'email_taken'
                ? t('errorEmailTaken')
                : result.error === 'rate_limited'
                  ? t('errorRateLimited')
                  : t('errorPasswordTooShort'),
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
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        <AngularButton type="submit" disabled={busy}>
          {busy ? t('signingIn') : t('registerCta')}
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
