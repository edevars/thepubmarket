import { parseIconTokens } from './icon-tokens'

/**
 * Pinta un texto de Riftbound resolviendo los tokens `:rb_x:` en pequeñas
 * insignias con etiqueta legible (ver `icon-tokens.ts`) en vez de dejar pasar
 * el token crudo. Componente puro de servidor: no hay estado ni interacción.
 */
export function IconizedText({ text }: { text: string }) {
  const segments = parseIconTokens(text)
  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segmentos derivados de un string estático, sin reordenamiento entre renders
          <span key={`t-${i}`}>{segment.value}</span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: ver arriba
            key={`i-${i}`}
            title={segment.label}
            className="mx-[3px] inline-flex items-center border border-cyan/40 bg-cyan/10 px-1.5 py-[1px] align-middle font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.06em] text-cyan"
          >
            {segment.label}
          </span>
        ),
      )}
    </>
  )
}
