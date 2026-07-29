---
id: TASK-016
title: 'Send real transactional email: infrastructure and password reset delivery'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-29 01:59'
updated_date: '2026-07-29 02:02'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Research findings (2026-07-29)

- `apps/api/src/lib/email.ts` already exists as a stub: `sendPasswordResetEmail()` just `console.log`s the link. Called from `POST /auth/password/forgot` (`apps/api/src/routes/auth.ts:194`), inside the `if (existing)` branch, so the neutral-response property (AC #4) is already correct and must be preserved.
- No `send_email` binding in `apps/api/wrangler.jsonc`. Wrangler 4.105.0 supports `wrangler email sending` (open beta).
- **DNS state of `thepubmarket.com`** (checked via dig): nameservers are Cloudflare, but inbound mail is Namecheap forwarding — `MX 10 eforward1..5.registrar-servers.com` and a single SPF TXT `v=spf1 include:spf.efwd.registrar-servers.com ~all`. No `_dmarc` record.
  - Email Sending does not need MX, so the existing forwarding stays untouched.
  - It does need SPF. A second SPF TXT record on the apex is an RFC violation and would break the existing one, so the Cloudflare include must be **merged into the existing record**, not added alongside it.
- **Access blocker:** the wrangler OAuth token returns `2036 Unauthorized` on `/accounts/*/email/sending/zones`, and the existing scoped token in `~/.cf-turnstile-token` is Turnstile-only (`10000 Authentication error` on the same endpoint). Domain onboarding needs either the Dashboard or a new scoped API token. Same shape of problem as TASK-012.

## Approach

1. **Onboard the sender domain** — apex `thepubmarket.com`, so the From address is DMARC-aligned with the site. Read the required records with `wrangler email sending dns get`, hand-merge the Cloudflare include into the existing SPF TXT, add the DKIM records, and add a `_dmarc` TXT at `p=none` to start. Verify with dig before claiming it works.
2. **Binding** — `send_email` named `EMAIL` in `wrangler.jsonc`, restricted via `allowed_sender_addresses` to the single no-reply sender so a future bug cannot send as an arbitrary address. Regenerate `worker-configuration.d.ts` with `wrangler types`.
3. **Shared helper** — rewrite `apps/api/src/lib/email.ts` around one `sendEmail(env, message)` that is the only caller of the binding. It never throws: on failure it logs recipient, subject and provider error code, and returns a result the caller ignores. Templates live beside it as pure functions returning `{subject, html, text}` (Spanish copy, both HTML and plain text).
4. **Mode switch** — an `EMAIL_MODE` var. Anything other than `send` means log-only: the helper prints the full message body so the reset link stays usable in local dev with no credentials. Deployed config sets `send`; `.dev.vars.example` documents `log`.
5. **Wire password reset** — `sendPasswordResetEmail` keeps its call site but takes the env and delegates to the helper. The send goes through `executionCtx.waitUntil` so the endpoint's neutral `{ok: true}` response is returned at the same latency whether or not delivery succeeds.
6. **Verify** — locally: reset flow end to end in log mode, plus probes confirming Turnstile 403 and the KV rate limits still fire, and that an unregistered email sends nothing. Deployed: real reset email to a controlled inbox, follow the link, complete a reset.
7. **Document** — new `docs/ingenieria/email.md` (English) covering domain onboarding, the DNS merge, sender identity, the mode switch, limits and diagnostics. Update `estado-actual.md` and `checklist-go-live-real.md` to drop "sin envío real de correo" as an open gap.

## Risks

- Merging SPF by hand on a zone that already forwards mail: a wrong edit silently breaks inbound forwarding auth. Capture the current record verbatim before editing.
- Cloudflare Email Sending is open beta; limits and error codes may differ from the skill reference. Trust `wrangler email sending settings` / the live API over documentation.
- Onboarding is blocked until a token with Email Sending permission exists or the user completes it in the Dashboard. Everything from step 2 onward can be built and locally verified without it.
<!-- SECTION:PLAN:END -->
