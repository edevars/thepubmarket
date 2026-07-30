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
 *   <input onFocus={turnstile.prewarm} … />         // start the round trip early
 *   const token = await turnstile.getToken()
 *   if (turnstile.enabled && !token) { show verification error; return }
 *   ...
 *   <div ref={turnstile.containerRef} className={TURNSTILE_SLOT_CLASS} />
 *
 * `prewarm()` matters for perceived speed: minting a token is a round trip to
 * Cloudflare, and doing it on submit puts that round trip in front of the user
 * while they stare at a spinner. Started on first focus, it is almost always
 * finished by the time they click. `getToken()` still yields exactly one
 * single-use token per submit either way.
 *
 * With no site key configured (`TURNSTILE_ENABLED === false`) the hook is inert
 * and `getToken()` resolves `null`, which callers send as "no header".
 */

import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react'
import { loadTurnstile, TURNSTILE_ENABLED, turnstileSiteKey } from '@/lib/turnstile'

/** Empty until a challenge is required, so it must not reserve vertical space. */
export const TURNSTILE_SLOT_CLASS = 'empty:hidden'

/**
 * How long to wait for a token before giving up.
 *
 * This used to be 60s, on the theory that a visitor might need that long to
 * solve a puzzle. In practice the timeout does not fire while someone is
 * working on a challenge — it fires when the widget is broken and will never
 * call back at all, which is what an ad blocker does to it. A minute of a
 * frozen button is indistinguishable from a crashed page, so the wait is now
 * short enough to read as a failure and hand the user an error they can act on.
 * A visitor genuinely mid-puzzle can retry; a visitor staring at a dead button
 * cannot.
 */
const TOKEN_TIMEOUT_MS = 12_000

export interface TurnstileHandle {
  /** Attach to the element that hosts the widget. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Mints a fresh token, or resolves `null` if it can't (disabled, failed, timed out). */
  getToken: () => Promise<string | null>
  /**
   * Starts minting a token *now*, so `getToken()` at submit time can consume a
   * token that is already in flight instead of starting a round trip to
   * Cloudflare while the user watches a spinner.
   *
   * Call it on first interaction with the form (focus, first keystroke). Safe to
   * call repeatedly: it is a no-op while a token is already pending or ready.
   */
  prewarm: () => void
  /** Whether a site key is configured at all. */
  enabled: boolean
}

export function useTurnstile(action: string): TurnstileHandle {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Resolves with the widget id once rendered, or null if rendering failed.
  const widgetRef = useRef<Promise<string | null> | null>(null)
  const pendingRef = useRef<((token: string | null) => void) | null>(null)
  // A token minted ahead of submit. Consumed once; tokens are single-use.
  const warmRef = useRef<Promise<string | null> | null>(null)

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

  const mint = useCallback(async (): Promise<string | null> => {
    if (!TURNSTILE_ENABLED) return null

    // Waits out the script load, so an auto-started checkout (/cart?pay=1)
    // doesn't race the widget's first render.
    const widgetId = await widgetRef.current
    const api = typeof window === 'undefined' ? undefined : window.turnstile
    if (!widgetId || !api) return null

    // A widget whose container React has since removed is dead: Turnstile logs
    // "Cannot find Widget <id>" and then fires no callback at all, so the only
    // thing that would end the wait is the timeout. Bail immediately instead.
    if (!containerRef.current?.isConnected) {
      console.warn('turnstile: widget container is detached — cannot mint a token')
      return null
    }

    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => settle(null), TOKEN_TIMEOUT_MS)
      pendingRef.current = (token) => {
        clearTimeout(timer)
        resolve(token)
      }
      // A widget that already produced a token has to be reset before it can
      // issue another one. Both calls can throw if the widget is in a bad
      // state; that must end the wait rather than escape into the caller.
      try {
        api.reset(widgetId)
        api.execute(widgetId, { action })
      } catch (err) {
        console.error('turnstile: execute failed', err)
        settle(null)
      }
    })
  }, [action, settle])

  const prewarm = useCallback(() => {
    if (!TURNSTILE_ENABLED || warmRef.current) return
    warmRef.current = mint()
  }, [mint])

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!TURNSTILE_ENABLED) return null

    // Consume the pre-warmed token if one is in flight or ready. Cleared first:
    // Turnstile tokens are single-use, so a retry after a wrong password must
    // not resend the one the server already burned.
    const warm = warmRef.current
    warmRef.current = null
    if (warm) {
      const token = await warm
      if (token) return token
      // Pre-warm failed (blocked widget, timeout). Fall through and try once
      // more now, so a transient failure doesn't cost the user the submit.
    }

    return mint()
  }, [mint])

  // Stable across renders: callers put the handle in callback/effect deps
  // (e.g. the auto-started checkout on /cart?pay=1).
  return useMemo(
    () => ({ containerRef, getToken, prewarm, enabled: TURNSTILE_ENABLED }),
    [getToken, prewarm],
  )
}
