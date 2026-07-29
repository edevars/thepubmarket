/**
 * Cloudflare Turnstile (browser side): site key, script loader and the typed
 * surface of `window.turnstile` that `useTurnstile` drives.
 *
 * The widget is rendered *explicitly* (`?render=explicit`) so a single script
 * load can serve several widgets and so nothing renders on pages that don't ask
 * for one. The resulting token goes to the API in the `cf-turnstile-response`
 * header, where `turnstileGuard` exchanges it with siteverify.
 *
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is inlined at BUILD time (like
 * NEXT_PUBLIC_API_URL) — a wrangler `var` would not reach the client bundle.
 * When it is empty the whole layer no-ops, which is what keeps `next dev` and
 * the curl flows usable. Keep it in sync with the Worker's
 * `TURNSTILE_SECRET_KEY`: a site key without a secret means no protection, and
 * a secret without a site key means every request gets a 403.
 */

/** Header the API reads the token from (see apps/api/src/middleware/turnstile.ts). */
export const TURNSTILE_HEADER = 'cf-turnstile-response'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

/** False when no site key is configured — every Turnstile call then no-ops. */
export const TURNSTILE_ENABLED = SITE_KEY.length > 0

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export interface TurnstileRenderOptions {
  sitekey: string
  action?: string
  /** 'execute' defers the challenge until `turnstile.execute()` is called. */
  execution?: 'render' | 'execute'
  /** 'interaction-only' hides the widget unless the visitor has to solve something. */
  appearance?: 'always' | 'execute' | 'interaction-only'
  theme?: 'auto' | 'light' | 'dark'
  language?: string
  callback?: (token: string) => void
  'error-callback'?: (code: string) => void
  'expired-callback'?: () => void
  'timeout-callback'?: () => void
}

export interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string
  execute: (idOrEl: string | HTMLElement, options?: { action?: string }) => void
  reset: (idOrEl?: string | HTMLElement) => void
  remove: (idOrEl: string | HTMLElement) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export const turnstileSiteKey = SITE_KEY

let loader: Promise<TurnstileApi> | null = null

/** Injects the Turnstile script once per page and resolves with `window.turnstile`. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('turnstile: not available during SSR'))
  }
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loader) return loader

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('turnstile: script loaded but the global is missing'))
    }
    script.onerror = () => {
      // Allow a later attempt to retry the load (flaky network, blocked once).
      loader = null
      reject(new Error('turnstile: failed to load the script'))
    }
    document.head.appendChild(script)
  })

  return loader
}

/** Adds the token header when there is one; otherwise leaves headers untouched. */
export function withTurnstileHeader(
  headers: Record<string, string>,
  token: string | null,
): Record<string, string> {
  return token ? { ...headers, [TURNSTILE_HEADER]: token } : headers
}
