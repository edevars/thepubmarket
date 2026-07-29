---
id: TASK-016
title: 'Send real transactional email: infrastructure and password reset delivery'
status: To Do
assignee: []
created_date: '2026-07-29 01:59'
labels:
  - 'epic:transactional-email'
  - api
  - auth
  - cloudflare
milestone: m-2
dependencies: []
references:
  - apps/api/src/routes/auth.ts
  - apps/api/src/lib/rate-limit.ts
  - ROADMAP.md
documentation:
  - docs/ingenieria/estado-actual.md
  - docs/ingenieria/auth-hardening.md
  - docs/ingenieria/checklist-go-live-real.md
priority: high
type: feature
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The platform currently sends no email at all. Password reset links produced by `POST /auth/password/forgot` are printed to the Worker log instead of being delivered, which means nobody except the founder (who can read the logs) can recover an account. This is a hard blocker for letting any real buyer or seller use the site.

Establish the one email-sending path the whole product will use, on Cloudflare Email Service (Email Sending) to stay inside the Cloudflare ecosystem, and prove it end to end by delivering the password reset email.

Scope is the sending capability plus the auth emails only. Order lifecycle emails are tracked separately and depend on this task providing the shared sending helper.

Constraints:
- Cloudflare-first: use Cloudflare Email Service, not a third-party ESP, unless a blocking limitation is found and documented in the task notes.
- Must be operable and debuggable by a single developer: one sender domain, no queue infrastructure beyond what Workers already provides.
- Email content shown to users is written in Spanish (marketplace UI language); code, comments and docs in English.
- Never put a session token, password, or Stripe identifier in an email body.
- No regression to the existing rate limiting and Turnstile gates on the auth endpoints.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sender domain is authenticated for the project domain (SPF, DKIM, DMARC records in place) and the setup steps are written down in docs/ingenieria/ so they can be repeated or audited
- [ ] #2 A single shared sending helper exists in the API and is the only place that talks to the email provider; all future emails go through it
- [ ] #3 Password reset email is actually delivered to the user's inbox when POST /auth/password/forgot is called with a registered email, and the link in it completes a reset successfully
- [ ] #4 POST /auth/password/forgot keeps its existing behavior for unregistered emails: same response, no account-existence oracle, and no email sent
- [ ] #5 A send failure does not change the HTTP response of the auth endpoint and does not leak provider errors to the caller; the failure is logged with enough detail to diagnose
- [ ] #6 Local development does not require live email credentials: with no credentials configured the helper falls back to logging the message and this fallback is obvious in the log
- [ ] #7 Turnstile verification and KV rate limiting still gate the auth endpoints unchanged, verified by probing the endpoints
- [ ] #8 Delivery verified against the deployed API, not only locally, and the verification is recorded in the task notes
- [ ] #9 docs/ingenieria/estado-actual.md no longer lists 'sin envío real de correo' as an open gap, and a dedicated doc covers the email setup, sender identity, and known limits
<!-- AC:END -->
