'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { useCart } from '@/lib/cart'

/** Logo angular con glow, fiel al diseño. */
function Logo() {
  const t = useTranslations('common')
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5">
      <span className="relative h-[26px] w-[26px] shrink-0">
        <span className="glow-primary absolute inset-0 bg-primary [clip-path:polygon(50%_0,100%_100%,50%_70%,0_100%)]" />
      </span>
      <span className="flex flex-col gap-0.5 leading-none">
        <span className="font-display text-base font-bold tracking-[0.14em] text-white">
          {t('brand')}
        </span>
        <span className="font-mono text-[8px] tracking-[0.22em] text-faint-2">{t('brandTag')}</span>
      </span>
    </Link>
  )
}

/** Selector de idioma ES / EN; conmuta el locale conservando la ruta actual. */
function LangSwitch() {
  const pathname = usePathname()
  return (
    <div className="flex border border-line">
      <Link
        href={pathname}
        locale="es"
        className="px-2.5 py-1.5 font-display text-xs font-bold tracking-[0.08em] text-muted-2 hover:text-ink"
      >
        ES
      </Link>
      <Link
        href={pathname}
        locale="en"
        className="px-2.5 py-1.5 font-display text-xs font-bold tracking-[0.08em] text-muted-2 hover:text-ink"
      >
        EN
      </Link>
    </div>
  )
}

export function SiteHeader() {
  const t = useTranslations('common')
  const pathname = usePathname()
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { count, openDrawer } = useCart()
  const [search, setSearch] = useState('')
  const isHome = pathname === '/'

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = search.trim()
    router.push(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog')
  }

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-line-soft bg-[#080c16]/92 px-5 py-3.5 backdrop-blur">
      <Logo />

      <nav className="hidden items-center gap-1 whitespace-nowrap md:flex">
        <Link
          href="/catalog"
          className="px-2.5 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-ink-2 hover:text-primary-hover"
        >
          {t('navCatalog')}
        </Link>
        <Link
          href="/catalog"
          className="px-2.5 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-ink-2 hover:text-primary-hover"
        >
          {t('navMagic')}
        </Link>
        <span className="cursor-default px-2.5 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-faint">
          {t('navMore')}
        </span>
        <span className="cursor-default px-2.5 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-faint">
          {t('navStore')}
        </span>
      </nav>

      {!isHome && (
        <form
          onSubmit={submitSearch}
          className="ml-auto hidden max-w-[340px] flex-1 items-center gap-2 border border-line bg-input px-3 py-2 md:flex"
        >
          <span className="h-3 w-3 shrink-0 rounded-full border-[1.5px] border-faint-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
          />
        </form>
      )}

      <div className={`flex shrink-0 items-center gap-2.5 ${isHome ? 'ml-auto' : 'ml-2'}`}>
        <button
          type="button"
          onClick={openDrawer}
          className="relative flex items-center px-2 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-ink-2 hover:text-primary-hover"
        >
          {t('cart')}
          {count > 0 && (
            <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center bg-primary px-1 font-mono text-[10px] font-bold text-[#06121f]">
              {count}
            </span>
          )}
        </button>

        {user ? (
          <button
            type="button"
            onClick={() => signOut()}
            title={user.email}
            className="hidden px-2 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-ink-2 hover:text-primary-hover sm:block"
          >
            {t('logout')}
          </button>
        ) : (
          <Link
            href="/login"
            className="hidden px-2 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.06em] text-ink-2 hover:text-primary-hover sm:block"
          >
            {t('login')}
          </Link>
        )}

        <LangSwitch />
        <Link
          href="/catalog"
          aria-label={t('navCatalog')}
          className="flex cursor-pointer flex-col gap-[3px] p-1 md:hidden"
        >
          <span className="h-0.5 w-[18px] bg-ink-2" />
          <span className="h-0.5 w-[18px] bg-ink-2" />
          <span className="h-0.5 w-[18px] bg-ink-2" />
        </Link>
      </div>
    </header>
  )
}
