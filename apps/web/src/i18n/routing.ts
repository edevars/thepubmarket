import { defineRouting } from 'next-intl/routing'

/**
 * Configuración de i18n. ES es el idioma por defecto (mercado inicial: México);
 * EN como segundo idioma. El locale por defecto no lleva prefijo en la URL.
 */
export const routing = defineRouting({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localePrefix: 'as-needed',
})
