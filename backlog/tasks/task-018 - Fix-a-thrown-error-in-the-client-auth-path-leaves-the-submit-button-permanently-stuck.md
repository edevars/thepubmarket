---
id: TASK-018
title: >-
  Fix: a thrown error in the client auth path leaves the submit button
  permanently stuck
status: To Do
assignee: []
created_date: '2026-07-30 03:08'
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
- [ ] #1 The trigger for the observed production hang is identified from browser Console/Network evidence and recorded in the task notes
- [ ] #2 A thrown error anywhere in a submit handler leaves the button re-enabled and shows the user an actionable message, on all four auth screens: login, register, forgot-password, reset-password
- [ ] #3 The fetch helpers in lib/session.ts no longer let a network-level rejection escape to callers; a transport failure is distinguishable from an API error response
- [ ] #4 Recognized API error codes (invalid_credentials, rate_limited, turnstile_failed, invalid_or_expired) still map to their existing specific messages, not to a generic failure message
- [ ] #5 POST /auth/password/forgot still returns the same neutral confirmation regardless of whether the account exists, and the UI reveals nothing more than it does today
- [ ] #6 A double submit cannot fire a second request against an already-consumed reset token
- [ ] #7 Reproduced and verified in the browser against the deployed site, with the before/after behavior recorded in the task notes
<!-- AC:END -->
