'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import type { SellerHours as Hours, SellerProfile } from '@/lib/sellers/types'

/** Minutos desde medianoche de 'HH:MM'. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Devuelve la fila de horario aplicable al día de la semana dado (0=Dom). */
function rowForDay(hours: Hours[], day: number): Hours | undefined {
  const key = day === 0 ? 'sunday' : day >= 1 && day <= 4 ? 'weekday' : 'friSat'
  return hours.find((h) => h.key === key)
}

/** ¿Abierto en este instante? (No considera festivos.) */
function isOpenNow(hours: Hours[], now: Date): boolean {
  const row = rowForDay(hours, now.getDay())
  if (!row?.open || !row.close) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= toMinutes(row.open) && mins < toMinutes(row.close)
}

/** Horarios de la tienda + estado "abierto ahora" + contacto (WhatsApp / IG). */
export function SellerHours({ seller }: { seller: SellerProfile }) {
  const t = useTranslations('sellers')

  // Se calcula tras el montaje para evitar desajustes de hidratación (hora local).
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(() => {
    setOpen(isOpenNow(seller.hours, new Date()))
  }, [seller.hours])

  const waUrl = `https://wa.me/${seller.whatsapp}`
  const igUrl = `https://instagram.com/${seller.instagram}`

  return (
    <section>
      <div className="grid gap-5 md:grid-cols-2 md:items-start">
        {/* Horarios */}
        <div className="border border-line-soft bg-panel-2 p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
              {t('hoursTitle')}
            </span>
            {open !== null && (
              <span
                className={`inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.04em] ${
                  open ? 'text-cond-nm' : 'text-faint'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-cond-nm' : 'bg-faint'}`} />
                {open ? t('openNow') : t('closedNow')}
              </span>
            )}
          </div>

          <dl className="flex flex-col">
            {seller.hours.map((row) => {
              const closed = !row.open || !row.close
              return (
                <div
                  key={row.key}
                  className="flex items-center justify-between border-b border-line-soft py-2.5 last:border-0"
                >
                  <dt className="text-[13px] text-ink-2">{t(`days.${row.key}`)}</dt>
                  <dd
                    className={`font-mono text-[12px] tracking-[0.04em] ${
                      closed ? 'text-faint' : 'text-ink'
                    }`}
                  >
                    {closed ? t('closed') : `${row.open} – ${row.close}`}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>

        {/* Contacto */}
        <div className="flex flex-col gap-3">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="clip-btn flex items-center justify-center gap-2.5 bg-[#25d366] px-4 py-3.5 font-display text-sm font-bold uppercase tracking-[0.08em] text-[#06121f] transition hover:brightness-110"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.31-1.95 1.36-.5.05-.96.23-3.23-.67-2.72-1.07-4.44-3.85-4.57-4.03-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.94-2.25.24-.27.53-.34.71-.34.18 0 .35 0 .5.01.16.01.38-.06.59.45.24.58.81 2 .88 2.15.07.14.12.31.02.5-.1.18-.15.29-.29.45-.15.16-.31.36-.44.48-.15.15-.3.31-.13.6.18.29.79 1.3 1.69 2.11 1.17 1.04 2.15 1.36 2.44 1.51.29.15.46.13.63-.08.18-.2.73-.85.92-1.14.19-.29.39-.24.65-.15.27.1 1.68.79 1.97.94.29.15.48.22.55.34.07.13.07.72-.17 1.4Z" />
            </svg>
            {t('whatsapp')}
          </a>
          <a
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="clip-btn flex items-center justify-center gap-2.5 border border-line-strong bg-panel px-4 py-3.5 font-display text-sm font-bold uppercase tracking-[0.08em] text-ink transition hover:border-primary"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
            @{seller.instagram}
          </a>
        </div>
      </div>
    </section>
  )
}
