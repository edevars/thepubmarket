import type { ButtonHTMLAttributes } from 'react'

export type AngularVariant = 'primary' | 'outline'

/**
 * Clases del CTA angular del diseño (clip-path + glow). Exportado para aplicarlo
 * también a `<Link>`/`<input type=submit>` sin envolver en el componente.
 */
export function angularButtonClasses(
  variant: AngularVariant = 'primary',
  size: 'md' | 'lg' = 'md',
) {
  const base =
    'inline-flex items-center justify-center font-display font-bold uppercase tracking-[0.1em] transition disabled:cursor-not-allowed'
  const sizing =
    size === 'lg' ? 'clip-btn-lg px-7 py-3.5 text-sm' : 'clip-btn px-4 py-2.5 text-[13px]'
  const skin =
    variant === 'primary'
      ? 'glow-primary bg-primary text-[#06121f] hover:bg-primary-hover'
      : 'border border-primary bg-transparent text-ink hover:bg-primary/12 hover:shadow-[0_0_18px_rgba(59,123,255,0.25)]'
  return `${base} ${sizing} ${skin}`
}

interface AngularButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AngularVariant
  size?: 'md' | 'lg'
}

export function AngularButton({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: AngularButtonProps) {
  return <button className={`${angularButtonClasses(variant, size)} ${className}`} {...props} />
}
