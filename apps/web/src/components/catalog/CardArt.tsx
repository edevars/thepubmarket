/**
 * Arte 5:7 de la carta. Si hay `imageUrl` (Scryfall, hoy; R2 más adelante)
 * renderiza la imagen real; si no, cae al placeholder geométrico del diseño.
 */
interface CardArtProps {
  name: string
  /** Tinte radial (rgba) — ver `artTintFor`. */
  tint: string
  /** URL de imagen de la carta. Null → placeholder geométrico. */
  imageUrl?: string | null
  size?: 'sm' | 'lg'
}

export function CardArt({ name, tint, imageUrl, size = 'sm' }: CardArtProps) {
  const nameSize = size === 'lg' ? 'text-2xl' : 'text-base'
  const tag = size === 'lg' ? 'IMG 5:7 · ARTE REAL' : 'IMG 5:7'

  if (imageUrl) {
    return (
      <div className="relative aspect-[5/7] w-full overflow-hidden bg-[#0e1626]">
        {/* biome-ignore lint/performance/noImgElement: imágenes externas de Scryfall (TODO migrar a R2) */}
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    )
  }

  return (
    <div className="relative aspect-[5/7] w-full overflow-hidden bg-[#0e1626]">
      <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.028)_0_2px,transparent_2px_9px)]" />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: `radial-gradient(circle at 50% 34%, ${tint}, transparent 72%)` }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
        <div className={`font-display font-semibold leading-tight text-ink-2 ${nameSize}`}>
          {name}
        </div>
        <div className="font-mono text-[9px] tracking-[0.2em] text-[#3f4d70]">{tag}</div>
      </div>
    </div>
  )
}
