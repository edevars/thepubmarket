'use client'

import type { HealthResponse } from '@thepubmarket/shared'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

type State = { kind: 'loading' } | { kind: 'ok'; data: HealthResponse } | { kind: 'unreachable' }

export function HealthCheck() {
  const t = useTranslations('health')
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/health`)
      .then((res) => res.json() as Promise<HealthResponse>)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ok', data })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'unreachable' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'loading') {
    return <p>{t('checking')}</p>
  }

  if (state.kind === 'unreachable') {
    return <Dot ok={false} label={t('unreachable')} />
  }

  const { status, db, timestamp } = state.data
  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <Dot ok={status === 'ok'} label={status === 'ok' ? t('serviceUp') : t('serviceDown')} />
      <Dot ok={db === 'ok'} label={db === 'ok' ? t('dbUp') : t('dbDown')} />
      <small style={{ color: '#666' }}>
        {t('lastCheck')}: {new Date(timestamp * 1000).toLocaleString()}
      </small>
    </div>
  )
}

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: ok ? '#16a34a' : '#dc2626',
        }}
      />
      {label}
    </span>
  )
}
