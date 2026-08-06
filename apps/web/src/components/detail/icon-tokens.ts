/**
 * Parser puro de los tokens `:rb_x:` que trae el texto de reglas y de
 * ambientación de Riftbound. El importador los preserva verbatim a propósito
 * (ver `cleanText` en `scripts/import-riftbound.mjs`) porque son datos
 * estructurados que el frontend puede convertir en icono/etiqueta — nunca se
 * deben mostrar tal cual al comprador.
 *
 * Vive fuera de React para poder probarse sin montar componentes: lo que
 * importa verificar es CÓMO se separa el texto en segmentos, no cómo se
 * pinta cada uno.
 */

/** Un tramo de texto plano, o un token de icono ya resuelto a etiqueta legible. */
export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'token'; token: string; label: string }

const TOKEN_RE = /:rb_([a-z0-9_]+):/gi

/**
 * Vocabulario conocido de tokens → etiqueta corta. Cubre los dominios (mismo
 * vocabulario que `RIFTBOUND_DOMAINS` en `@thepubmarket/shared`) y las
 * estadísticas de coste/fuerza que ya aparecen en la tabla de atributos. Un
 * token fuera de esta lista no es un error: se humaniza igual (ver
 * `humanizeToken`) para que nunca se filtre el token crudo.
 */
const KNOWN_TOKEN_LABELS: Record<string, string> = {
  fury: 'Fury',
  calm: 'Calm',
  chaos: 'Chaos',
  order: 'Order',
  mind: 'Mind',
  body: 'Body',
  colorless: 'Colorless',
  energy: 'Energy',
  might: 'Might',
  power: 'Power',
}

/** Convierte un token desconocido en algo legible: `deflect` → "Deflect", `two_words` → "Two Words". */
function humanizeToken(token: string): string {
  const known = KNOWN_TOKEN_LABELS[token.toLowerCase()]
  if (known) return known
  return token
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Parte `text` en segmentos de texto plano y tokens resueltos. `null`/`undefined`/vacío
 * devuelve `[]` — quien consuma esto decide si eso implica ocultar la sección
 * (mismo criterio de "omitir en vez de mostrar vacío" que `gameAttributeRows`).
 */
export function parseIconTokens(text: string | null | undefined): TextSegment[] {
  if (!text) return []

  const segments: TextSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0
    if (index > lastIndex) segments.push({ kind: 'text', value: text.slice(lastIndex, index) })
    const token = match[1] ?? ''
    segments.push({ kind: 'token', token, label: humanizeToken(token) })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ kind: 'text', value: text.slice(lastIndex) })
  return segments
}
