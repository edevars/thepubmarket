'use client'

import type { SellerPanelMe } from '@thepubmarket/shared'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { angularButtonClasses } from '@/components/ui/AngularButton'
import { Link, usePathname } from '@/i18n/navigation'
import { fetchSellerMe } from '@/lib/client-api'
import { getToken } from '@/lib/session'
import { PanelProvider, usePanel } from './PanelProvider'

type Gate = 'loading' | 'signedOut' | 'notSeller' | 'ok'

/**
 * Shell del Panel del Vendedor: guard de acceso (sesión + tienda vinculada),
 * sidebar de navegación y topbar. Todo cliente: el token vive en localStorage.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('panel')
  const { user, loading } = useAuth()
  const [gate, setGate] = useState<Gate>('loading')
  const [me, setMe] = useState<SellerPanelMe | null>(null)
  const [token, setTokenState] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    const sessionToken = getToken()
    if (!user || !sessionToken) {
      setGate('signedOut')
      return
    }
    fetchSellerMe(sessionToken).then((result) => {
      if (result === 'not_a_seller') setGate('notSeller')
      else if (result === null) setGate('signedOut')
      else {
        setMe(result)
        setTokenState(sessionToken)
        setGate('ok')
      }
    })
  }, [user, loading])

  if (gate === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
        <span className="h-[15px] w-[15px] animate-spin rounded-full border-2 border-line border-t-primary" />
        {t('loading')}
      </div>
    )
  }

  if (gate === 'signedOut' || gate === 'notSeller') {
    const signedOut = gate === 'signedOut'
    return (
      <div className="mx-auto w-full max-w-[560px] px-6 py-24 text-center">
        <div className="relative mx-auto mb-6 h-[70px] w-[70px]">
          <span className="absolute inset-0 border-2 border-line-strong [clip-path:polygon(50%_0,100%_27%,100%_73%,50%_100%,0_73%,0_27%)]" />
          <span className="absolute inset-6 border-[1.5px] border-line" />
        </div>
        <h1 className="mb-2 font-display text-2xl font-bold tracking-[0.03em] text-white">
          {t(signedOut ? 'gateSignedOutTitle' : 'gateNotSellerTitle')}
        </h1>
        <p className="mx-auto mb-6 max-w-[420px] text-sm leading-relaxed text-muted-2">
          {t(signedOut ? 'gateSignedOutBody' : 'gateNotSellerBody')}
        </p>
        <Link
          href={signedOut ? '/login' : '/'}
          className={angularButtonClasses(signedOut ? 'primary' : 'outline')}
        >
          {t(signedOut ? 'gateSignedOutCta' : 'gateBackHome')}
        </Link>
      </div>
    )
  }

  if (!me || !token) return null

  return (
    <PanelProvider token={token} me={me}>
      <div className="mx-auto flex w-full max-w-[1360px] border border-line-soft bg-surface md:min-h-[calc(100vh-0px)]">
        <PanelSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <PanelTopbar />
          <main className="flex-1 px-5 py-6 sm:px-7">{children}</main>
        </div>
      </div>
    </PanelProvider>
  )
}

/** Item de navegación con rombo indicador y badge opcional. */
function NavItem({
  href,
  label,
  active,
  badge,
}: {
  href: string
  label: string
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={href}
      className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 font-display text-[14.5px] font-semibold tracking-[0.04em] transition ${
        active
          ? 'border-primary bg-primary/10 text-white'
          : 'border-transparent text-muted hover:text-ink-2'
      }`}
    >
      <span
        className={`clip-rhombus h-2 w-2 shrink-0 ${active ? 'glow-primary bg-primary' : 'bg-line-strong'}`}
      />
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-auto min-w-[18px] bg-[#e08a3c] px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-[#06121f] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
          {badge}
        </span>
      )}
    </Link>
  )
}

function PanelSidebar() {
  const t = useTranslations('panel')
  const { me, pendingCount } = usePanel()
  const { user, signOut } = useAuth()
  const pathname = usePathname()

  const nav = [
    { href: '/panel', label: t('navResumen'), active: pathname === '/panel' },
    {
      href: '/panel/inventario',
      label: t('navInventario'),
      active: pathname.startsWith('/panel/inventario'),
    },
    {
      href: '/panel/agregar',
      label: t('navAgregar'),
      active: pathname.startsWith('/panel/agregar'),
    },
    {
      href: '/panel/ordenes',
      label: t('navOrdenes'),
      active: pathname.startsWith('/panel/ordenes'),
      badge: pendingCount,
    },
  ]

  const initials = (user?.displayName ?? user?.email ?? '·')
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('')

  return (
    <aside className="hidden w-[250px] shrink-0 flex-col border-r border-line-soft bg-[#080d18] md:flex">
      {/* Marca */}
      <Link href="/" className="flex items-center gap-2.5 border-b border-line-soft px-4 py-4">
        <span className="relative h-[24px] w-[24px] shrink-0">
          <span className="glow-primary absolute inset-0 bg-primary [clip-path:polygon(50%_0,100%_100%,50%_70%,0_100%)]" />
        </span>
        <span className="flex flex-col gap-0.5 leading-none">
          <span className="font-display text-[14px] font-bold tracking-[0.14em] text-white">
            THE PUB MARKET
          </span>
          <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-faint-2">
            {t('brandTag')}
          </span>
        </span>
      </Link>

      {/* Tarjeta de tienda */}
      <div className="border-b border-line-soft px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-line-strong bg-[#0e1626] font-display text-base font-bold text-white/30">
            {me.seller.monogram}
          </span>
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-bold text-ink">
              {me.seller.name}
            </div>
            <div className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              {me.seller.city} · {me.seller.neighborhood}
            </div>
          </div>
        </div>
        {me.seller.verified && (
          <div className="mt-3 inline-flex items-center gap-1.5 border border-cyan/40 bg-cyan/[0.07] px-2 py-1 font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em] text-cyan">
            ✓ {t('verified')}
          </div>
        )}
      </div>

      {/* Navegación */}
      <nav className="flex-1 py-3">
        <div className="mb-1.5 px-4 font-mono text-[9px] uppercase tracking-[0.18em] text-faint-2">
          {t('navBusiness')}
        </div>
        {nav.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Usuario */}
      <div className="flex items-center gap-2.5 border-t border-line-soft px-4 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-input font-mono text-[10px] font-semibold text-muted">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-ink-2">
            {user?.displayName ?? user?.email}
          </div>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-faint hover:text-ink-2"
        >
          {t('logout')}
        </button>
      </div>
    </aside>
  )
}

function PanelTopbar() {
  const t = useTranslations('panel')
  const locale = useLocale()
  const pathname = usePathname()

  const view = pathname.startsWith('/panel/inventario')
    ? 'Inventario'
    : pathname.startsWith('/panel/agregar')
      ? 'Agregar'
      : pathname.startsWith('/panel/ordenes')
        ? 'Ordenes'
        : 'Resumen'

  const today = new Intl.DateTimeFormat(locale === 'en' ? 'en-MX' : 'es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date())

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-line-soft px-5 py-4 sm:px-7">
      <div className="min-w-0 flex-1">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan">
          {t(`eyebrow${view}`)}
        </div>
        <h1 className="truncate font-display text-[26px] font-bold tracking-[0.02em] text-white">
          {t(`title${view}`)}
        </h1>
      </div>
      <div className="hidden flex-col items-end sm:flex">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.18em] text-faint-2">
          {t('today')}
        </span>
        <span className="font-mono text-[11px] text-muted">{today}</span>
      </div>
      <Link href="/panel/agregar" className={angularButtonClasses('primary')}>
        {t('addCardCta')}
      </Link>
    </header>
  )
}
