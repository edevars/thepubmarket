interface FoilTagProps {
  size?: 'sm' | 'md'
}

/** Distintivo FOIL con texto en gradiente cian→violeta. */
export function FoilTag({ size = 'sm' }: FoilTagProps) {
  const text = size === 'md' ? 'text-[10px]' : 'text-[9px]'
  return (
    <span className="inline-block border border-cyan/45 bg-[#060911]/70 px-1.5 py-[3px]">
      <span className={`foil-text font-mono ${text} font-semibold tracking-[0.12em]`}>FOIL</span>
    </span>
  )
}
