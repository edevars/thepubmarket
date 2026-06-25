import { useTranslations } from 'next-intl'

/**
 * Barra de búsqueda. Formulario nativo GET (sin JS de cliente): al enviar,
 * navega a la URL actual con `?q=…`, lo que reinicia a la primera página.
 * Preserva el locale porque envía a la ruta vigente.
 */
export function SearchBar({ defaultValue }: { defaultValue?: string }) {
  const t = useTranslations('catalog')
  return (
    <form style={{ display: 'flex', gap: '0.5rem', margin: '1.25rem 0' }}>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        style={{
          flex: 1,
          padding: '0.6rem 0.75rem',
          fontSize: '1rem',
          border: '1px solid #d4d4d4',
          borderRadius: 8,
        }}
      />
      <button
        type="submit"
        style={{
          padding: '0.6rem 1.1rem',
          fontSize: '1rem',
          border: 'none',
          borderRadius: 8,
          background: '#111',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        {t('searchButton')}
      </button>
    </form>
  )
}
