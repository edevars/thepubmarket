'use client'

import type { ConnectPayout, ConnectStatusResponse } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { angularButtonClasses } from '@/components/ui/AngularButton'
import { formatMoneyCents } from '@/lib/catalog/display'
import { fetchConnectPayouts, fetchConnectStatus, requestOnboardingLink } from '@/lib/client-api'
import { usePanel } from './PanelProvider'
import { PanelSkeleton } from './ResumenView'
import { PAYOUT_STATUS_HEX, payoutStatusKey } from './status'

/**
 * Vista Pagos: estado de onboarding de Stripe Connect + historial de payouts.
 * Todo leído en vivo de Stripe (GET /seller/connect/status y /payouts) — la
 * plataforma nunca custodia ni calcula estos montos, solo los muestra.
 */
export function PagosView() {
  const t = useTranslations('panel')
  const locale = useLocale()
  const { token } = usePanel()

  const [status, setStatus] = useState<ConnectStatusResponse | null>(null)
  const [payouts, setPayouts] = useState<ConnectPayout[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    Promise.all([fetchConnectStatus(token), fetchConnectPayouts(token)]).then(
      ([statusRes, payoutsRes]) => {
        setStatus(statusRes)
        setPayouts(payoutsRes)
        setLoading(false)
      },
    )
  }, [token])

  if (loading) return <PanelSkeleton />

  const onboarded = status?.chargesEnabled === true && status?.detailsSubmitted === true

  const handleOnboarding = async () => {
    setRequesting(true)
    const url = await requestOnboardingLink(token)
    if (url) window.location.href = url
    else setRequesting(false)
  }

  return (
    <div className="flex flex-col gap-6">
      {!onboarded && (
        <div className="flex flex-wrap items-center gap-4 border border-[#e08a3c]/40 bg-[linear-gradient(120deg,rgba(224,138,60,0.10),#08101c_60%)] px-5 py-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#e08a3c]/60 font-display text-sm font-bold text-[#f0a862]">
            !
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-bold text-white">
              {t('connectPendingTitle')}
            </div>
            <div className="text-[12.5px] text-muted-2">{t('connectPendingBody')}</div>
          </div>
          <button
            type="button"
            onClick={handleOnboarding}
            disabled={requesting}
            className={angularButtonClasses('primary')}
          >
            {requesting ? t('connectPendingCtaLoading') : t('connectPendingCta')}
          </button>
        </div>
      )}

      {/* Badges de estado */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatusTile
          label={t('connectChargesLabel')}
          ok={status?.chargesEnabled === true}
          unknown={status?.chargesEnabled === null}
        />
        <StatusTile
          label={t('connectDetailsLabel')}
          ok={status?.detailsSubmitted === true}
          unknown={status?.detailsSubmitted === null}
        />
        <StatusTile
          label={t('connectPayoutsLabel')}
          ok={status?.payoutsEnabled === true}
          unknown={status?.payoutsEnabled === null}
        />
      </div>

      {/* Historial de payouts */}
      <div className="border border-line-soft bg-panel-2">
        <div className="border-b border-line-soft px-4 py-3">
          <span className="font-display text-[15px] font-bold uppercase tracking-[0.06em] text-white">
            {t('payoutsHistoryTitle')}
          </span>
        </div>
        {payouts.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-faint">{t('payoutsEmpty')}</div>
        ) : (
          <div>
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0"
              >
                <span className="font-mono text-[11px] text-muted">
                  {new Intl.DateTimeFormat(locale === 'en' ? 'en-MX' : 'es-MX', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }).format(new Date(p.arrivalDate * 1000))}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{p.id}</span>
                <span className="font-mono text-[12px] font-semibold text-white">
                  {formatMoneyCents(p.amountCents, locale)}
                </span>
                <span
                  className="border px-2 py-0.5 font-display text-[10.5px] font-bold uppercase tracking-[0.06em]"
                  style={{
                    color: PAYOUT_STATUS_HEX[p.status] ?? '#7a88a8',
                    borderColor: `${PAYOUT_STATUS_HEX[p.status] ?? '#7a88a8'}66`,
                    background: `${PAYOUT_STATUS_HEX[p.status] ?? '#7a88a8'}14`,
                  }}
                >
                  {t(payoutStatusKey(p.status))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-faint">{t('payoutsFootnote')}</p>
    </div>
  )
}

function StatusTile({ label, ok, unknown }: { label: string; ok: boolean; unknown: boolean }) {
  const t = useTranslations('panel')
  const color = unknown ? '#7a88a8' : ok ? '#46c98a' : '#e08a3c'
  return (
    <div className="border border-line-soft bg-panel-2 p-4">
      <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-faint">
        {label}
      </span>
      <div className="mt-2 flex items-center gap-2">
        <span className="clip-rhombus h-2 w-2 shrink-0" style={{ background: color }} />
        <span
          className="font-display text-[13px] font-bold uppercase tracking-[0.04em]"
          style={{ color }}
        >
          {unknown
            ? t('connectStatusUnknown')
            : ok
              ? t('connectStatusOk')
              : t('connectStatusPending')}
        </span>
      </div>
    </div>
  )
}
