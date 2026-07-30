/**
 * Inline spinner for a button that is working.
 *
 * Reuses the `tpmSpin` keyframe already defined in globals.css for the cart's
 * redirect screen, so there is one spin animation in the product rather than
 * two that almost match. `currentColor` on the leading edge means it inherits
 * whatever the button's text colour is.
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-current/30 ${className}`}
      style={{ borderTopColor: 'currentColor', animation: 'tpmSpin 0.7s linear infinite' }}
    />
  )
}
