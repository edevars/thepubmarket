---
id: TASK-018
title: >-
  Fix: a thrown error in the client auth path leaves the submit button
  permanently stuck
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-30 03:08'
updated_date: '2026-07-30 03:54'
labels:
  - web
  - auth
  - ux
milestone: m-2
dependencies:
  - TASK-016
references:
  - apps/web/src/lib/session.ts
  - 'apps/web/src/app/[locale]/auth/forgot-password/page.tsx'
  - 'apps/web/src/app/[locale]/auth/reset-password/page.tsx'
  - 'apps/web/src/app/[locale]/login/page.tsx'
  - 'apps/web/src/app/[locale]/register/page.tsx'
  - apps/web/src/components/security/useTurnstile.ts
priority: high
type: bug
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed in production on 2026-07-29 while verifying TASK-016: submitting the password-reset request form left the button stuck on `Enviando…` forever, even though the request had actually succeeded — `wrangler tail` shows `POST /auth/password/forgot` returning Ok and the email was delivered. The user saw no confirmation and no error, re-clicked through the flow, and ended up firing a second `POST /auth/password/reset` against an already-consumed token.

The defect is structural, not specific to that one screen:

- `apps/web/src/lib/session.ts` — `postAuth` and `requestPasswordReset` call `fetch` with no error handling, so a rejected fetch propagates to the caller.
- The `onSubmit` handlers in `login/`, `register/`, `auth/forgot-password/` and `auth/reset-password/` all set `busy = true` and clear it only on the happy path and on recognized API error codes. There is no `try/catch` and no `finally`.

So any throw between those two points — a network blip, a CORS failure, a Turnstile call that rejects — disables the submit button for the rest of the page's life, with no message and no way to retry short of a reload. All four authentication screens share the shape, so this is the whole client auth surface, not one form.

What actually threw in the observed instance is not yet identified: the request reached the Worker and returned Ok, so it happened after the fetch was issued. Reproducing with DevTools open (Console + Network) is the first step — fixing the stuck-button symptom without knowing the trigger risks converting a visible hang into a silent wrong error message.

Constraints:
- User-facing strings in Spanish, matching the rest of the auth UI; code and comments in English.
- Do not weaken the existing behavior: the neutral response of `/auth/password/forgot` must stay neutral, and a real API error code must still map to its specific message rather than a generic one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The trigger for the observed production hang is identified from browser Console/Network evidence and recorded in the task notes
- [ ] #2 A thrown error anywhere in a submit handler leaves the button re-enabled and shows the user an actionable message, on all four auth screens: login, register, forgot-password, reset-password
- [ ] #3 The fetch helpers in lib/session.ts no longer let a network-level rejection escape to callers; a transport failure is distinguishable from an API error response
- [ ] #4 Recognized API error codes (invalid_credentials, rate_limited, turnstile_failed, invalid_or_expired) still map to their existing specific messages, not to a generic failure message
- [ ] #5 POST /auth/password/forgot still returns the same neutral confirmation regardless of whether the account exists, and the UI reveals nothing more than it does today
- [ ] #6 A double submit cannot fire a second request against an already-consumed reset token
- [ ] #7 Reproduced and verified in the browser against the deployed site, with the before/after behavior recorded in the task notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Browser evidence, first pass (2026-07-29)

User supplied two console lines:

```
Failed to load resource: net::ERR_BLOCKED_BY_CLIENT
[Cloudflare Turnstile] Cannot find Widget cf-chl-widget-iuwx6,
  consider using turnstile.remove() to clean up a widget.
```

### The hang is 60 seconds, not infinite

`Cannot find Widget` means `turnstile.reset()`/`execute()` ran against a widget whose DOM node is gone. In that state Turnstile fires **none** of its callbacks — not `callback`, not `error-callback`, not `timeout-callback`. `useTurnstile.getToken()` only settles from those callbacks or from its own `setTimeout(…, TOKEN_TIMEOUT_MS)`, and that constant is **60_000**. So the button sits on `Enviando…` for a full minute with no feedback before finally resolving `null`.

That revises the original diagnosis: the missing `try/catch`/`finally` is real and still worth fixing, but it is not what produced *this* symptom. The proximate cause is a Turnstile widget bound to a detached node plus a 60s backstop that is far too long to read as anything but a freeze.

Two candidate mechanisms for the detached widget, not yet distinguished:

1. **Extension blocked a Turnstile resource.** `ERR_BLOCKED_BY_CLIENT` is an extension (ad blocker) killing a request. If it hit `challenges.cloudflare.com`, the widget half-initializes and `execute()` becomes a no-op.
2. **Container unmounted under the hook.** In `forgot-password/page.tsx` the widget container lives inside the `<form>`, which unmounts when `sent` becomes true. `useTurnstile`'s cleanup only runs on component unmount or when `[action, settle]` change — neither happens — so the hook keeps a widget id pointing at a node React already removed. This one is a latent defect regardless of whether it caused this instance.

### Escalation: Turnstile + ad blockers may lock real buyers out entirely

Bigger than the stuck button. `turnstileGuard` **fails closed** server-side: no token → `403`. If a common ad blocker blocks the Turnstile challenge, an affected visitor cannot sign in, register, reset a password, **or check out** — the gate covers `POST /checkout` too. That is a whole segment of buyers unable to transact, and it is invisible from server logs (it just looks like 403s).

Needs a decision on posture before launch: keep failing closed, or degrade to the KV rate limits when the widget cannot load. Not in scope of this task; flag it to the user.

### Missing to close AC #1

- The **URL** of the request that returned `ERR_BLOCKED_BY_CLIENT` (Network tab). If it is `challenges.cloudflare.com`, mechanism 1 is confirmed.
- Whether it reproduces in an incognito window with extensions disabled. Clean run there → extension is the trigger and our bug is the lack of resilience; still broken there → mechanism 2 or something else.

## Trigger identified (2026-07-29)

Clean-ish Chrome run without the ad blocker: **the flow works**. No `Cannot find Widget`, no `ERR_BLOCKED_BY_CLIENT`, and the form completed normally.

The only console output was Google Tag Assistant (`content_script_bin.js`, `tag_assistant_api_bin.js`) failing to inject into Turnstile's challenge iframe against its `trusted-types vOmE5 default` CSP. That is Cloudflare's CSP working as intended — unrelated noise, not a defect. Note Tag Assistant was still enabled, so this was not a fully extension-free run; it did not need to be, since the flow succeeded.

**Conclusion: mechanism 1.** An ad blocker blocks a Turnstile resource → the widget half-initializes → `execute()` fires no callback → `getToken()` sits on its 60s `TOKEN_TIMEOUT_MS` → the button reads `Enviando…` for a minute with no feedback. Mechanism 2 (container unmounting under the hook when `sent` flips) is **not** what fired here, but it remains a latent defect worth fixing in the same pass.

So the bug to fix is resilience, not a crash:

1. `TOKEN_TIMEOUT_MS` of 60s is a freeze from the user's seat. Needs to be short enough to feel like a failure, with a message.
2. A widget that cannot initialize should be detectable up front rather than only by timeout.
3. The missing `try`/`catch`/`finally` in the four submit handlers still needs fixing — it is what would turn any *other* throw into the same silent hang.
4. `useTurnstile` should not keep a widget id bound to a detached container.

Still unresolved and **larger than this task**: with `turnstileGuard` failing closed server-side, a visitor whose blocker kills Turnstile gets `403` on login, register, password reset **and checkout**. They cannot buy, and it looks like an ordinary 403 in the logs. Needs a product decision on posture before launch.
<!-- SECTION:NOTES:END -->
