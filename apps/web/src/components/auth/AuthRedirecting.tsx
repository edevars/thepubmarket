/**
 * Success screen shown between "the API said yes" and the page actually
 * changing.
 *
 * Signing in, creating an account and resetting a password all end with
 * `router.push('/')`. That navigation is not instant, and until now the gap
 * rendered as the same disabled button the user had been staring at for the
 * previous second — indistinguishable from a form that ignored the click. This
 * replaces the form outright, so the outcome is unambiguous: it worked, you are
 * signed in, we are taking you somewhere.
 *
 * Borrows the spinner idiom from the cart's redirect-to-Stripe screen
 * (`tpmSpin` + `tpmPulse`) so the two "we are moving you" moments in the
 * product read as the same thing.
 */
export function AuthRedirecting({ title, body }: { title: string; body: string }) {
  return (
    <main
      className="mx-auto w-full max-w-[480px] px-5 py-24 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative mx-auto mb-7 h-[64px] w-[64px]">
        <span
          className="absolute inset-0 rounded-full border-2 border-line-soft"
          style={{
            borderTopColor: '#3b7bff',
            borderRightColor: '#35e0ee',
            animation: 'tpmSpin 0.9s linear infinite',
          }}
        />
        <span
          className="absolute inset-[16px] rounded-full border-[1.5px] border-line"
          style={{ animation: 'tpmPulse 1.4s ease-in-out infinite' }}
        />
      </div>
      <h2 className="mb-2 font-display text-2xl font-bold tracking-[0.03em] text-white">{title}</h2>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
    </main>
  )
}
