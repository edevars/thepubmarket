import { useTranslations } from 'next-intl'

/** Sello "Vendedor verificado / Tienda física vetada" con check cian. */
export function VerifiedBadge({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('sellers')

  return (
    <span className="inline-flex items-center gap-2 border border-cyan/40 bg-cyan/[0.07] px-2.5 py-1.5 text-cyan">
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2 4 5v6c0 4.5 3.2 8.4 8 10 4.8-1.6 8-5.5 8-10V5z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {t('verified')}
        </span>
        {!compact && (
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-cyan/70">
            {t('verifiedSub')}
          </span>
        )}
      </span>
    </span>
  )
}
