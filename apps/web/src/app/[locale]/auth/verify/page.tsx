'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { Link, useRouter } from '@/i18n/navigation'
import { verifyMagicToken } from '@/lib/session'

type State = 'verifying' | 'ok' | 'error'

export default function VerifyPage() {
  return (
    <Suspense fallback={<main className="px-5 py-20" />}>
      <VerifyInner />
    </Suspense>
  )
}

function VerifyInner() {
  const t = useTranslations('auth')
  const params = useSearchParams()
  const router = useRouter()
  const { signIn } = useAuth()
  const [state, setState] = useState<State>('verifying')
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    const token = params.get('token')
    if (!token) {
      setState('error')
      return
    }
    verifyMagicToken(token).then((res) => {
      if (!res) {
        setState('error')
        return
      }
      signIn(res.sessionToken, res.user)
      setState('ok')
      setTimeout(() => router.replace('/'), 1200)
    })
  }, [params, signIn, router])

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 py-20 text-center">
      {state === 'verifying' && <p className="text-muted">{t('verifying')}</p>}
      {state === 'ok' && <p className="text-cond-nm">{t('verifyOk')}</p>}
      {state === 'error' && (
        <div>
          <p className="mb-4 text-[#d6584f]">{t('verifyError')}</p>
          <Link href="/login" className="text-primary-hover hover:text-cyan">
            {t('tryAgain')}
          </Link>
        </div>
      )}
    </main>
  )
}
