import { useTranslations } from 'next-intl'
import { Link } from '../../i18n/navigation'

interface PaginationProps {
  page: number
  pages: number
  /** Query a preservar entre páginas (p.ej. la búsqueda activa). */
  query: { q?: string }
}

/** Controles de paginación previa/siguiente, preservando la búsqueda. */
export function Pagination({ page, pages, query }: PaginationProps) {
  const t = useTranslations('catalog')
  if (pages <= 1) return null

  const hrefFor = (p: number) => ({
    pathname: '/catalog',
    query: { ...(query.q ? { q: query.q } : {}), ...(p > 1 ? { page: String(p) } : {}) },
  })

  const linkStyle = {
    padding: '0.5rem 0.9rem',
    border: '1px solid #d4d4d4',
    borderRadius: 8,
    textDecoration: 'none',
    color: 'inherit',
  } as const
  const disabledStyle = {
    ...linkStyle,
    color: '#bbb',
    borderColor: '#eee',
    pointerEvents: 'none' as const,
  }

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        margin: '1.75rem 0',
      }}
    >
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} style={linkStyle}>
          {t('prev')}
        </Link>
      ) : (
        <span style={disabledStyle}>{t('prev')}</span>
      )}

      <span style={{ color: '#666', fontSize: '0.9rem' }}>{t('pageInfo', { page, pages })}</span>

      {page < pages ? (
        <Link href={hrefFor(page + 1)} style={linkStyle}>
          {t('next')}
        </Link>
      ) : (
        <span style={disabledStyle}>{t('next')}</span>
      )}
    </nav>
  )
}
