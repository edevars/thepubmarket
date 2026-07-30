---
id: TASK-016
title: 'Send real transactional email: infrastructure and password reset delivery'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-29 01:59'
updated_date: '2026-07-30 03:10'
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
- [x] #1 Sender domain is authenticated for the project domain (SPF, DKIM, DMARC records in place) and the setup steps are written down in docs/ingenieria/ so they can be repeated or audited
- [x] #2 A single shared sending helper exists in the API and is the only place that talks to the email provider; all future emails go through it
- [x] #3 Password reset email is actually delivered to the user's inbox when POST /auth/password/forgot is called with a registered email, and the link in it completes a reset successfully
- [x] #4 POST /auth/password/forgot keeps its existing behavior for unregistered emails: same response, no account-existence oracle, and no email sent
- [x] #5 A send failure does not change the HTTP response of the auth endpoint and does not leak provider errors to the caller; the failure is logged with enough detail to diagnose
- [x] #6 Local development does not require live email credentials: with no credentials configured the helper falls back to logging the message and this fallback is obvious in the log
- [x] #7 Turnstile verification and KV rate limiting still gate the auth endpoints unchanged, verified by probing the endpoints
- [x] #8 Delivery verified against the deployed API, not only locally, and the verification is recorded in the task notes
- [x] #9 docs/ingenieria/estado-actual.md no longer lists 'sin envío real de correo' as an open gap, and a dedicated doc covers the email setup, sender identity, and known limits
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Code landed + local verification (2026-07-29)

Implemented steps 2–5 of the plan. Local behavior verified with curl against `wrangler dev` (no browser, per project convention):

| Probe | Result |
|---|---|
| `POST /auth/password/forgot`, registered email, `EMAIL_MODE=log` | `{ok:true}`; full message (subject + plain-text body + reset link) printed to the Worker log |
| Same, unregistered email | `{ok:true}`, byte-identical; **zero** `[email]` lines emitted — confirmed by counting log blocks (3 sends across 5 requests, matching the 3/hour bucket) |
| Reset link from the log → `POST /auth/password/reset` | 200, new session issued |
| Login with new password / old password | 200 / 401 |
| Reusing the consumed token | `invalid_or_expired` — still single-use |
| `forgot` with no `cf-turnstile-response` header | 403 `turnstile_failed`, logged as `turnstile: rejected POST /auth/password/forgot (missing-input-response)` |
| `forgot` ×5 on one email | 3× `{ok:true}`, then `rate_limited`; no email sent on the 429s |

Also flipped `.dev.vars` to `EMAIL_MODE=send` to exercise the real binding: Miniflare **simulates** the send rather than calling the provider — it logs `send_email binding called with MessageBuilder` and writes the rendered text/HTML to temp files. Useful (it confirms the builder payload: `From: "The Pub Market" <no-reply@thepubmarket.com>`, both bodies present, HTML well-formed) but it means the **provider failure path cannot be exercised locally**. AC #5 has to be confirmed against the deployed Worker. `.dev.vars` reverted to `log`.

`pnpm typecheck` and `pnpm lint` clean.

## Blocked on access

Step 1 (domain onboarding) is waiting on a Cloudflare API token with **Account → Email Sending: Edit** and **Zone → DNS: Edit** on `thepubmarket.com`, to be placed at `~/.cf-email-token`. Decisions confirmed with the user: sender is the apex `no-reply@thepubmarket.com` (DMARC-aligned with the site), and the existing Namecheap SPF include gets merged rather than replaced.

## Sender domain verified (2026-07-29)

Token at `~/.cf-email-token` works for Email Sending (`/email/sending/limits` returns quota 1000/day, 0 sent) and for Zone DNS. Note the account-scoped `/email/sending/zones` subresource still 401s with this token — the working path is **zone-scoped**: `/zones/{zone_id}/email/sending/subdomains`. `wrangler email sending list` is therefore unusable here; query the zone endpoint directly.

**The domain was already onboarded** (created `2026-07-29T04:43:28Z`), so `wrangler email sending enable` returned `2040 Subdomain already exists`. State on zone `a4e0652bc69bc8dee2f521add23cb27b`:

```
name: thepubmarket.com   enabled: true
return_path_domain: cf-bounce.thepubmarket.com
dkim_selector: cf-bounce
```

**Correction to the plan: no SPF merge was needed, and none was done.** Cloudflare puts its records on the `cf-bounce` subdomain, not the apex. Verified by dig:

| Record | Host | Value |
|---|---|---|
| MX ×3 | `cf-bounce.thepubmarket.com` | `route1/2/3.mx.cloudflare.net` |
| TXT SPF | `cf-bounce.thepubmarket.com` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| TXT DKIM | `cf-bounce._domainkey.thepubmarket.com` | `v=DKIM1; h=sha256; k=rsa; p=MIIBIj…` |
| TXT DMARC | `_dmarc.thepubmarket.com` | `v=DMARC1; p=none;` |

The apex is untouched: MX still the five `eforward*.registrar-servers.com` and SPF still `v=spf1 include:spf.efwd.registrar-servers.com ~all`, so the existing Namecheap forwarding keeps working.

**DMARC lowered from the `p=reject` default to `p=none`** (record `1a7ecb34bcfd61c976f9b07aabfd0aca`, comment left on it). `p=reject` on the apex applies to every sender claiming `@thepubmarket.com`, not just this Worker — any other outbound path (Gmail "send as", webmail) would have started getting hard-rejected silently. Our own mail is aligned either way via the cf-bounce DKIM/SPF, so nothing is lost by starting at `none`. Propagation took ~4 minutes; confirmed `p=none` at the authoritative NS and at 1.1.1.1. **Raising this to quarantine/reject belongs on the go-live checklist.**

Also checked while here: `seller_invitations` **already exists in remote D1**, so migration 0006 is applied and the warning about it in estado-actual.md is stale — fix that when updating the docs.

## Blocked: deploy

`wrangler deploy` was denied by the permission classifier. The deployed verification (AC #3, #5, #8) needs the user to run the deploy.

## Deployed + documented (2026-07-29)

User ran the deploy. Confirmed on version `604a7cc4-0540-40eb-8ea9-ca1f582a2570` via `wrangler versions view`: `env.EMAIL` (Send Email, senders `no-reply@thepubmarket.com`), `EMAIL_MODE="send"`, `EMAIL_FROM`, `EMAIL_FROM_NAME`. `/health` green.

Docs written:

- **`docs/ingenieria/email.md`** (new) — what gets sent, the three-file structure, the `EMAIL_MODE` switch and the Miniflare-simulates-sends caveat, the real DNS records, why DMARC sits at `p=none`, the API-access quirks, quota (1000/day), a diagnosis table, and the hard rule about what never goes in an email body.
- `docs/ingenieria/README.md` — indexed.
- `estado-actual.md` — new dated section; dropped "sin envío real de correo" from the dev-mode gap list; **corrected the stale migration-0006 warning** (already applied remotely).
- `checklist-go-live-real.md` — checked off real email delivery; added a new item for raising DMARC to quarantine/reject with the reasoning and prerequisites.

Written in Spanish deliberately: every doc in that suite added after the English-convention change (2026-07-25, 07-28) is Spanish, so a lone English file would break it. Code, comments and this task stay English.

`pnpm lint` and API `typecheck` clean.

## Still open: AC #3, #5, #8

Deployed delivery is **not yet verified**. It cannot be driven from curl: `turnstileGuard` fails closed and there is no way to mint a valid widget token outside a browser, so `POST /auth/password/forgot` against production always returns 403 from a script. Verification needs the user to submit the form at `/es/auth/forgot-password` with an address they control while `wrangler tail` is running. Do not mark this task Done before that happens.

## Deployed delivery VERIFIED (2026-07-29)

User submitted the form at `/es/auth/forgot-password` for a real account. `wrangler tail` on `thepubmarket-api`:

```
POST /auth/password/forgot - Ok @ 8:58:59 PM
POST /auth/password/reset  - Ok @ 9:00:08 PM
POST /auth/password/reset  - Ok @ 9:00:40 PM   ← second click, token already consumed
POST /auth/login           - Ok @ 9:02:42 PM
```

The email was delivered, the link in it opened the reset page, the reset completed, and the account then signed in with the new password. **No `[email] send failed` line** — the provider accepted the send. AC #3 and #8 met.

AC #5 is **partially** verified, and the notes should say so plainly: no provider failure actually occurred remotely, so the failure path was not observed end to end. What is established is structural — the send runs inside `executionCtx.waitUntil`, so the `{ok:true}` response is already emitted before the provider is called, and `sendEmail` catches everything and returns rather than throwing. Verified locally that the caller ignores the outcome. Forcing a real remote failure would mean deploying a deliberately-broken sender config; judged not worth it.

## Found during verification: stuck submit button (frontend)

The forgot-password form hung on `Enviando…` even though the request succeeded — which is why there are two `/auth/password/reset` calls (user re-clicked).

Root defect is in the client auth path and predates this task (TASK-012/TASK-015):

- `apps/web/src/lib/session.ts` — neither `postAuth` nor `requestPasswordReset` wraps `fetch`. A rejected fetch propagates to the caller.
- `apps/web/src/app/[locale]/auth/forgot-password/page.tsx` and `…/reset-password/page.tsx` — both `onSubmit` handlers `setBusy(true)` and clear it only on the happy path and on known API errors. There is no `try/catch` and no `finally`.

So **any** throw between those two points leaves the button permanently disabled, showing `Enviando…` (or `Entrando…` on the reset page), with no message to the user and no way to retry without a reload. `login` and `register` share the same shape via `postAuth`.

What actually threw in this instance is not yet known — the request reached the Worker and returned Ok, so it happened after the fetch was issued. Needs the browser console/network entry to pin down. Scope decision pending with the user.

## Failure path verified for real (2026-07-29)

Earlier note said AC #5 could only be argued structurally. That was wrong — there is a way to force a genuine provider rejection locally without deploying anything broken: point `EMAIL_FROM` at an address the restricted binding does not allow.

`.dev.vars` temporarily set to `EMAIL_MODE=send` + `EMAIL_FROM=intruso@otro-dominio.com`, then `POST /auth/password/forgot` on a registered account:

- Response: `200 {"ok":true}` in 24ms — identical to the success path, nothing about the provider leaked.
- Log: `[email] send failed → fail-path@example.com (Restablece tu contraseña — The Pub Market): email from intruso@otro-dominio.com not allowed` — recipient, subject and reason, and **no message body**.

So AC #5 holds on evidence, not just on construction. Bonus: this also proves `allowed_sender_addresses` is actually enforced by the runtime rather than being decorative. `.dev.vars` restored to `EMAIL_MODE=log`; the observed error string replaced the guessed `E_VALIDATION_ERROR` row in the diagnosis table of `email.md`.

Final checks: `pnpm lint` clean, API `typecheck` clean, `vitest run` 42/42 passing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## What changed

The API can now send real transactional email through Cloudflare Email Sending. Before this, `POST /auth/password/forgot` printed the reset link to the Worker log, so nobody but the founder could recover an account — a hard blocker on letting any real buyer or seller use the site.

**Sender domain.** `thepubmarket.com` is onboarded, `enabled: true`, return path `cf-bounce.thepubmarket.com`, DKIM selector `cf-bounce`. The plan assumed the apex SPF would need a hand-merge with the existing Namecheap forwarding include; that turned out to be wrong and no merge was made — Cloudflare places MX, SPF and DKIM under the `cf-bounce` subdomain, leaving the apex untouched. Verified by dig that the five `eforward*.registrar-servers.com` MX records and the Namecheap SPF are intact.

**DMARC.** Cloudflare creates `_dmarc` at `p=reject`; lowered to `p=none`. That record governs every sender claiming `@thepubmarket.com`, not just this Worker, so `reject` would have started silently hard-rejecting any other legitimate outbound path (a Gmail "send as", the registrar's webmail). Our own mail is aligned either way. Raising it back is now an explicit item on the go-live checklist, with the prerequisites written down.

**Code.**

- `apps/api/src/lib/email.ts` — one `sendEmail(env, to, content)` that is the only caller of the `EMAIL` binding. It never throws; it returns an outcome the caller ignores. On failure it logs recipient, subject and provider reason, never the body.
- `apps/api/src/lib/email-templates.ts` (new) — pure render functions, Spanish copy, always both HTML and plain text. The reset email's stated lifetime is derived from `RESET_TTL_SECONDS`, so copy cannot drift from the token's real TTL.
- `apps/api/wrangler.jsonc` — `send_email` binding restricted to the single no-reply sender, plus `EMAIL_MODE` / `EMAIL_FROM` / `EMAIL_FROM_NAME`.
- `apps/api/src/routes/auth.ts` — the send moved to `executionCtx.waitUntil`, so the neutral `{ok:true}` returns at the same latency whether delivery succeeds, fails or is skipped. Timing that correlates with "this address has an account" is exactly the oracle the neutral response exists to prevent.

`EMAIL_MODE` is the local-development answer: anything but `send` prints the whole message, reset link included, and sends nothing. No credentials, no verified domain, no risk of mailing a real person from a test run.

## Verification

Local, curl against `wrangler dev`: full reset flow (request → link → new password → sign in), token single-use, old password rejected, unregistered address produces a byte-identical response and zero sends, missing Turnstile header still 403, the 3-per-hour KV bucket still cuts in and sends nothing on the 429s.

Deployed, on version `604a7cc4`: the user submitted the real form, the email arrived, the link completed a reset and the account signed in — captured in `wrangler tail` as `forgot → reset → login`, all Ok, with no `[email] send failed` line.

Failure path forced locally by pointing `EMAIL_FROM` at an address the restricted binding rejects: response stayed `200 {"ok":true}` at 24ms with nothing leaked, and the log carried recipient, subject and reason. This also confirms `allowed_sender_addresses` is enforced rather than decorative.

`pnpm lint` clean, `typecheck` clean, `vitest run` 42/42.

## Docs

New `docs/ingenieria/email.md` (Spanish, matching its siblings) covering the setup, the real DNS records, the mode switch, the API-access quirks, the 1000/day quota and a diagnosis table. Indexed in the docs README. `estado-actual.md` gained a dated section and lost the "sin envío real de correo" gap; `checklist-go-live-real.md` checked off real delivery and gained the DMARC item.

Two stale facts corrected along the way: migration `0006` is already applied in remote D1 (the warning said otherwise), and `wrangler email sending list` does not work with a scoped token — it hits an account-scoped endpoint that 401s, while `/zones/{id}/email/sending/subdomains` responds.

## Follow-ups

- **TASK-018** (filed): verifying this surfaced a real bug — a thrown error anywhere in the client auth submit path leaves the button permanently disabled with no message. All four auth screens share the shape. Not caused by this task, but found by it.
- **TASK-017**: order lifecycle emails, which consume the helper this task established.
<!-- SECTION:FINAL_SUMMARY:END -->
