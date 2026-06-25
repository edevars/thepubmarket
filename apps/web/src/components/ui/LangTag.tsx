interface LangTagProps {
  /** Idioma de la impresión ('es' | 'en' | 'jp'). */
  lang: string
}

/** Etiqueta de idioma en mono, discreta. */
export function LangTag({ lang }: LangTagProps) {
  return (
    <span className="border border-line px-[5px] py-0.5 font-mono text-[9px] tracking-[0.08em] text-muted">
      {lang.toUpperCase()}
    </span>
  )
}
