'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { AngularButton } from '@/components/ui/AngularButton'
import { Link, useRouter } from '@/i18n/navigation'
import { isPasswordLongEnough } from '@/lib/auth-validation'
import { resetPassword } from '@/lib/session'

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
  const [busy, setBusy] = useState(false)
  const passwordOk = isPasswordLongEnough(password)

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
          setBusy(true)
          setError(null)
          const result = await resetPassword(token, password)
          setBusy(false)
          if ('error' in result) {
            setError(
              result.error === 'invalid_or_expired'
                ? t('resetInvalidOrExpired')
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
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        <AngularButton type="submit" disabled={busy}>
          {busy ? t('signingIn') : t('resetPasswordCta')}
        </AngularButton>
      </form>
    </main>
  )
}
