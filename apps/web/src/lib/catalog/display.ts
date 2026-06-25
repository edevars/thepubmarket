/**
 * Helpers de presentación del catálogo. SOLO display: nada de esto se guarda en
 * el contrato `@thepubmarket/shared`. Color de condición, tinte de arte, labels
 * de juego/idioma y formateo de dinero viven aquí para no ensuciar el modelo.
 */
import type { Condition, InventoryItem, Tcg } from '@thepubmarket/shared'

/** Color por condición (mejor → peor). Se aplica inline por ser dinámico. */
export const CONDITION_HEX: Record<Condition, string> = {
  NM: '#46c98a',
  LP: '#9ec94e',
  MP: '#e0b341',
  HP: '#e08a3c',
  DMG: '#d6584f',
}

/** Clave i18n del nombre largo de la condición (namespace `condition`). */
export function conditionKey(c: Condition): string {
  return c.toLowerCase()
}

/** Metadatos de cada juego para tiles y filtros. */
export const TCG_META: Record<Tcg, { name: string; short: string }> = {
  mtg: { name: 'Magic', short: 'MTG' },
  pokemon: { name: 'Pokémon', short: 'PKM' },
  yugioh: { name: 'Yu-Gi-Oh!', short: 'YGO' },
  onepiece: { name: 'One Piece', short: 'OP' },
  lorcana: { name: 'Lorcana', short: 'LOR' },
  riftbound: { name: 'Riftbound', short: 'RIFT' },
}

/** Idiomas ofrecidos en los filtros del catálogo. */
export const FILTER_LANGUAGES = ['es', 'en', 'jp'] as const
export type FilterLanguage = (typeof FILTER_LANGUAGES)[number]

const ART_TINTS = [
  'rgba(214,88,79,.13)',
  'rgba(59,123,255,.13)',
  'rgba(70,201,138,.11)',
  'rgba(125,115,150,.13)',
  'rgba(230,120,50,.13)',
  'rgba(222,205,120,.11)',
  'rgba(224,179,65,.12)',
  'rgba(120,160,230,.11)',
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** Tinte radial determinista para el placeholder de arte de una carta. */
export function artTintFor(item: InventoryItem): string {
  return ART_TINTS[hash(item.id) % ART_TINTS.length] ?? 'rgba(150,150,160,0.1)'
}

/** Línea de set compacta: `MH2 · #138`. */
export function setLine(item: InventoryItem): string {
  return `${item.card.setCode.toUpperCase()} · #${item.card.collectorNumber}`
}

/**
 * Formatea centavos MXN (entero) a moneda. La división entre 100 es SOLO para
 * presentación; el dinero se almacena y transmite siempre como entero.
 */
export function formatMoneyCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-MX' : 'es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}
