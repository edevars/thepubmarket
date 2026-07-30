/**
 * The states an auth form passes through between click and navigation.
 *
 * A single `busy` boolean made every wait look identical: minting a Turnstile
 * token, waiting on the API and navigating away all rendered as one frozen
 * button. When a step stalls — an ad blocker breaking the widget is the real
 * case that prompted this — the user has no way to tell "working on it" from
 * "hung", so they re-click and fire a duplicate request.
 *
 * `done` is terminal on purpose: the page is navigating away, so the form must
 * not become interactive again. That is also what stops a second submit from
 * hitting an already-consumed password-reset token.
 */
export type AuthPhase = 'idle' | 'verifying' | 'submitting' | 'done'

/** Whether the form should be locked. Everything but `idle` counts. */
export function isBusy(phase: AuthPhase): boolean {
  return phase !== 'idle'
}
