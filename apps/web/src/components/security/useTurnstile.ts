'use client'

/**
 * Turnstile widget bound to one submit action (sign in, register, checkout…).
 *
 * Renders in `execution: 'execute'` + `appearance: 'interaction-only'` mode:
 * nothing is drawn and no challenge is spent until `getToken()` runs on submit,
 * and the visitor only ever sees a widget when Cloudflare decides they have to
 * solve something. Tokens are single-use and short-lived, so minting one per
 * submit — instead of on page load — also avoids the whole class of
 * expired/duplicate-token bugs.
 *
 * Usage:
 *   const turnstile = useTurnstile('login')
 *   ...
 *   const token = await turnstile.getToken()
 *   if (turnstile.enabled && !token) { show verification error; return }
 *   ...
 *   <div ref={turnstile.containerRef} className={TURNSTILE_SLOT_CLASS} />
 *
 * With no site key configured (`TURNSTILE_ENABLED === false`) the hook is inert
 * and `getToken()` resolves `null`, which callers send as "no header".
 */

import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react'
import { loadTurnstile, TURNSTILE_ENABLED, turnstileSiteKey } from '@/lib/turnstile'

/** Empty until a challenge is required, so it must not reserve vertical space. */
export const TURNSTILE_SLOT_CLASS = 'empty:hidden'

/** How long to wait for a token before giving up (the visitor may have to solve a puzzle). */
const TOKEN_TIMEOUT_MS = 60_000

export interface TurnstileHandle {
  /** Attach to the element that hosts the widget. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Mints a fresh token, or resolves `null` if it can't (disabled, failed, timed out). */
  getToken: () => Promise<string | null>
  /** Whether a site key is configured at all. */
  enabled: boolean
}

export function useTurnstile(action: string): TurnstileHandle {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Resolves with the widget id once rendered, or null if rendering failed.
  const widgetRef = useRef<Promise<string | null> | null>(null)
  const pendingRef = useRef<((token: string | null) => void) | null>(null)

  /** Hands a result to the in-flight getToken(), if any. Idempotent. */
  const settle = useCallback((token: string | null) => {
    const resolve = pendingRef.current
    pendingRef.current = null
    resolve?.(token)
  }, [])

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let widgetId: string | null = null

    widgetRef.current = loadTurnstile()
      .then((api) => {
        if (disposed) return null
        widgetId = api.render(container, {
          sitekey: turnstileSiteKey,
          action,
          execution: 'execute',
          appearance: 'interaction-only',
          theme: 'dark',
          callback: (token) => settle(token),
          'error-callback': () => settle(null),
          'expired-callback': () => settle(null),
          'timeout-callback': () => settle(null),
        })
        return widgetId
      })
      .catch((err: unknown) => {
        console.error('turnstile: widget could not be rendered', err)
        return null
      })

    return () => {
      disposed = true
      if (widgetId) window.turnstile?.remove(widgetId)
      widgetRef.current = null
      settle(null)
    }
  }, [action, settle])

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!TURNSTILE_ENABLED) return null

    // Waits out the script load, so an auto-started checkout (/cart?pay=1)
    // doesn't race the widget's first render.
    const widgetId = await widgetRef.current
    const api = typeof window === 'undefined' ? undefined : window.turnstile
    if (!widgetId || !api) return null

    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => settle(null), TOKEN_TIMEOUT_MS)
      pendingRef.current = (token) => {
        clearTimeout(timer)
        resolve(token)
      }
      // A widget that already produced a token has to be reset before it can
      // issue another one.
      api.reset(widgetId)
      api.execute(widgetId, { action })
    })
  }, [action, settle])

  // Stable across renders: callers put the handle in callback/effect deps
  // (e.g. the auto-started checkout on /cart?pay=1).
  return useMemo(() => ({ containerRef, getToken, enabled: TURNSTILE_ENABLED }), [getToken])
}
