/**
 * Filas de atributos propios del juego para la tabla del detalle.
 *
 * Vive fuera del componente para poder probarse sin montar React: la regla
 * interesante no es cómo se pintan, sino CUÁLES aparecen — una carta sin coste
 * o sin dominios no debe mostrar filas vacías ni guiones.
 */
import type { CardGameAttributes } from '@thepubmarket/shared'

/** Etiquetas ya traducidas que necesita el armado de filas. */
export interface GameAttributeLabels {
  type: string
  domains: string
  energy: string
  might: string
  power: string
}

/**
 * Devuelve `[etiqueta, valor]` solo para los atributos presentes. Sin
 * atributos de juego (MTG, o publicaciones previas a la columna) la lista es
 * vacía y la tabla del detalle queda exactamente como antes.
 */
export function gameAttributeRows(
  attrs: CardGameAttributes | null | undefined,
  labels: GameAttributeLabels,
): Array<[string, string]> {
  // TASK-049: CardGameAttributes ahora es una unión (Riftbound | MTG). Esta
  // tabla solo pinta el bloque de Riftbound; MTG no tiene fila propia aquí
  // todavía (colores/tipos se muestran aparte en el detalle vía card.card).
  if (attrs?.tcg !== 'riftbound') return []

  const rows: Array<[string, string]> = []
  // El supertipo ('Champion') califica al tipo: se muestran juntos.
  const type = [attrs.supertype, attrs.type].filter(Boolean).join(' · ')
  if (type) rows.push([labels.type, type])
  if (attrs.domains.length > 0) rows.push([labels.domains, attrs.domains.join(' · ')])
  if (attrs.energy != null) rows.push([labels.energy, String(attrs.energy)])
  if (attrs.might != null) rows.push([labels.might, String(attrs.might)])
  if (attrs.power != null) rows.push([labels.power, String(attrs.power)])
  return rows
}
