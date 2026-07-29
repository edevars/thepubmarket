---
id: TASK-012
title: Add Cloudflare Turnstile to login and checkout entry points
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 22:32'
updated_date: '2026-07-29 01:32'
labels:
  - 'epic:anti-bot'
  - feature
milestone: m-1
dependencies: []
modified_files:
  - apps/api/src/lib/turnstile.ts
  - apps/api/src/lib/turnstile.test.ts
  - apps/api/src/middleware/turnstile.ts
  - apps/api/src/routes/auth.ts
  - apps/api/src/routes/checkout.ts
  - apps/api/worker-configuration.d.ts
  - apps/api/wrangler.jsonc
  - apps/web/src/lib/turnstile.ts
  - apps/web/src/components/security/useTurnstile.ts
  - apps/web/src/lib/session.ts
  - apps/web/src/lib/client-api.ts
  - 'apps/web/src/app/[locale]/login/page.tsx'
  - 'apps/web/src/app/[locale]/register/page.tsx'
  - 'apps/web/src/app/[locale]/auth/forgot-password/page.tsx'
  - 'apps/web/src/app/[locale]/auth/reset-password/page.tsx'
  - 'apps/web/src/app/[locale]/cart/page.tsx'
  - apps/web/messages/es.json
  - apps/web/messages/en.json
  - apps/web/.env.example
  - apps/web/.env.production
  - docs/ingenieria/turnstile.md
  - docs/ingenieria/estado-actual.md
  - docs/ingenieria/checklist-go-live-real.md
  - docs/ingenieria/README.md
  - README.md
priority: medium
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CLAUDE.md specifies Turnstile as the anti-bot layer for registration and checkout. As the marketplace opens to more sellers and real transactions, both the magic-link login request and checkout entry need bot protection. The 'turnstile-spin' Claude Code skill may be useful for scaffolding this end-to-end (widget + managed siteverify Worker).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Turnstile widget added to the /login and /register forms
- [x] #2 Turnstile widget added to checkout entry point
- [x] #3 Server-side siteverify check enforced in the Worker before accepting login/register/checkout requests
- [x] #4 Turnstile site/secret keys managed via Cloudflare secrets, not hardcoded
- [x] #5 Graceful failure UX in place (Spanish copy) if Turnstile verification fails
- [x] #6 Turnstile widget added to the /auth/forgot-password and /auth/reset-password forms
- [x] #7 Server-side siteverify enforced on /auth/password/forgot and /auth/password/reset
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Approach

Token travels in the `cf-turnstile-response` **request header**, not in the JSON body → no changes to `@thepubmarket/shared` request types, and one uniform mechanism for auth + checkout. CORS is currently open (`cors()`), which reflects requested headers, so no preflight work.

### API (apps/api)
1. `src/lib/turnstile.ts` — `verifyTurnstile(secret, token, ip)`: POST form-encoded to `https://challenges.cloudflare.com/turnstile/v0/siteverify`, returns `{ ok } | { ok: false, reason }`. If `TURNSTILE_SECRET_KEY` is unset → `console.warn` + pass (keeps local dev / existing curl flows working; prod must set the secret — go-live checklist entry).
2. `src/middleware/turnstile.ts` — `turnstileGuard` Hono middleware: reads the header, 403 `turnstile_failed` on rejection.
3. Wire it **before** the KDF/auth work on `POST /auth/register`, `POST /auth/login`, `POST /checkout`.
4. `src/lib/turnstile.test.ts` — vitest with a stubbed `fetch` (missing token, siteverify failure, success, secret-unset bypass).

### Web (apps/web)
5. `src/lib/turnstile.ts` — site key from `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + singleton loader for `api.js?render=explicit`.
6. `src/components/security/useTurnstile.ts` — explicit render into a ref'd div with `execution: 'execute'` + `appearance: 'interaction-only'`; `getToken()` resets and executes the widget, resolving the fresh token (with timeout). No site key configured → `getToken()` resolves `null` (dev without keys). Tokens are single-use, so execute-on-submit avoids stale-token bugs.
7. `/login` and `/register`: widget container + `getToken()` on submit; Spanish error copy on `turnstile_failed`.
8. `/cart` (the checkout entry point, incl. the `?pay=1` auto-start path from the drawer): same, before `createCheckout`.
9. `src/lib/session.ts` and `src/lib/client-api.ts`: accept an optional token and send the header.
10. i18n: `auth.errorVerification` + `cart.checkoutErrorVerification` in `messages/es.json` and `messages/en.json`.

### Config / docs
11. `apps/web/.env.example` (site key), `apps/api/.dev.vars` note, `apps/api/wrangler.jsonc` secrets comment, `docs/ingenieria/checklist-go-live-real.md`, and a short `docs/ingenieria/turnstile.md` runbook (widget creation in the dashboard, keys, dummy test keys).

### Verification
`pnpm typecheck`, `pnpm lint`, `pnpm --filter @thepubmarket/api test`, plus curl against `wrangler dev` proving reject-without-token / accept-with-dummy-key. No browser testing.

### Regulatory
None — Turnstile does not touch the fund flow. Non-custodial invariant unaffected.

### Open questions (pending user)
- Whether to also gate `/auth/password/forgot` and `/auth/password/reset` (not in the current AC).
- Whether real Turnstile keys exist yet or the widget creation stays a manual dashboard step on the go-live checklist.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-28 — Scope decision (user): extend the gate to `/auth/password/forgot` and `/auth/password/reset` on top of login/register/checkout. forgot-password triggers an outbound email, which is the cheapest abuse surface of the set. Two acceptance criteria added (#6, #7).

2026-07-28 — Code complete on both sides. API: `lib/turnstile.ts` + `middleware/turnstile.ts`, mounted before the expensive work on the 5 endpoints. Web: `lib/turnstile.ts` + `components/security/useTurnstile.ts` (explicit render, execution:'execute', appearance:'interaction-only', fresh token per submit), wired into /login, /register, /auth/forgot-password, /auth/reset-password and /cart. Token travels in the `cf-turnstile-response` header, so no `@thepubmarket/shared` request type changed.

2026-07-28 — Verified against local `wrangler dev` with Cloudflare's dummy always-pass secret (so siteverify is really called, not bypassed): all 5 endpoints return 403 `turnstile_failed` without the header and fall through to their normal 401/400 with it; `/health` and `/auth/me` unaffected. Also green: `pnpm typecheck`, `pnpm lint`, 42 API tests (8 new in `lib/turnstile.test.ts`), 23 web tests, `apps/web` production build.

2026-07-28 — BLOCKED on prod keys: creating the widget via the Cloudflare API needs a token with `Account.Turnstile:Edit`; the `wrangler login` OAuth token does not carry that scope (confirmed via the turnstile-spin skill's auth probe). User chose to hand over an API token via `~/.cf-turnstile-token`. Everything else is done and works with the dummy test keys.

2026-07-28 — Prod keys done. Widget `thepubmarket` (managed, no_clearance) created via the Cloudflare API with a scoped `Account.Turnstile:Edit` token: site key `0x4AAAAAAEAZkoBZ4yQKkn4x`, domains thepubmarket.com / www.thepubmarket.com / localhost / 127.0.0.1. Deployed in the only safe order — site key into `.env.production` → build + deploy `thepubmarket-web` → `wrangler secret put TURNSTILE_SECRET_KEY` → deploy `thepubmarket-api` — because a secret without a deployed site key 403s every auth/checkout request. The widget secret never touched the repo or the chat (piped from a temp file into wrangler, then deleted).

2026-07-28 — Live verification against https://api.thepubmarket.com: `/auth/{login,register,password/forgot,password/reset}` and `/checkout` return 403 `turnstile_failed` with no header AND with an invalid token (Worker log: `invalid-input-response`, i.e. the real secret is in effect, not a bypass); `/health`, `/catalog` and `/sellers` unaffected. Note: the first probe right after deploy hit the previous version while it propagated — re-ran three times to confirm.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-24 04:18
---
Login moved from magic-link to email+password auth (see this session's work). Target forms are now /login and /register instead of the old magic-link request form. Note: apps/api/src/lib/rate-limit.ts (KV-based) was added as an interim/complementary brute-force deterrent on /auth/login, /auth/register, /auth/password/forgot, /auth/password/reset — Turnstile in this task is still the primary anti-bot layer, not superseded by it.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Turnstile end-to-end, live in production

Anti-bot layer over every browser-facing endpoint a bot would target, verified server-side with real keys.

### API (`apps/api`)
- `src/lib/turnstile.ts` — `verifyTurnstile()` against Cloudflare's siteverify. **Fails closed** on a missing, rejected, or unverifiable token; the single bypass is an unset `TURNSTILE_SECRET_KEY`, which logs a warning per request and exists so `wrangler dev` and the curl runbooks stay usable.
- `src/middleware/turnstile.ts` — `turnstileGuard`, mounted **before** the expensive work (KDF derivations, KV, inventory Durable Objects, Stripe) on `POST /auth/register`, `/auth/login`, `/auth/password/forgot`, `/auth/password/reset` and `/checkout`. Rejection is `403 turnstile_failed`, deliberately distinct from the `429 rate_limited` of the KV counters, which stay in place.
- `src/lib/turnstile.test.ts` — 8 tests: accept, form encoding, remoteip omission, missing token, siteverify rejection, HTTP error, unreachable, secret-unset bypass.

### Web (`apps/web`)
- `src/lib/turnstile.ts` + `src/components/security/useTurnstile.ts` — explicit render (`api.js?render=explicit`), `execution: 'execute'` + `appearance: 'interaction-only'`: nothing is drawn and no challenge is spent until submit, and UI only appears when Cloudflare demands a challenge. A **fresh token per submit** removes the `timeout-or-duplicate` failure class.
- Wired into `/login`, `/register`, `/auth/forgot-password`, `/auth/reset-password` and `/cart` — including the `?pay=1` auto-checkout, where the token is minted *before* the phase switch so the widget stays mounted if a challenge appears.
- Spanish + English copy (`auth.errorVerification`, `cart.checkoutErrorVerification`).

### Design decisions
- **Token in the `cf-turnstile-response` header, not the body** — no `@thepubmarket/shared` request type changed, and one uniform mechanism for auth and checkout.
- **Scope extended** beyond the original AC to `/auth/password/{forgot,reset}`: forgot-password sends mail, the cheapest abuse surface of the set.
- **Both keys move together**: site key without secret = no protection (logged); secret without site key = 403 on everything. Called out in the runbook, the checklist, `.env.production`, `wrangler.jsonc` and the README.

### Production
Widget `thepubmarket` (managed) created via the Cloudflare API for `thepubmarket.com`, `www.thepubmarket.com`, `localhost`, `127.0.0.1`. Site key `0x4AAAAAAEAZkoBZ4yQKkn4x` in `apps/web/.env.production`; secret set with `wrangler secret put` and never written to the repo. Both Workers deployed in the order that avoids a 403 window (web first, then the secret, then the API).

**Verified live**: all five endpoints 403 without a token and with an invalid one (`invalid-input-response` in the Worker log — the real secret is enforcing, not bypassing); `/health`, `/catalog`, `/sellers` unaffected. Green locally: typecheck, lint, 42 API tests, 23 web tests, production build.

### Regulatory
None. Turnstile sits before the fund flow and does not touch it; the non-custodial direct-charge model is unchanged.

### Docs
New [`docs/ingenieria/turnstile.md`](../../docs/ingenieria/turnstile.md) (what it protects, how the token travels, keys per environment, dummy test keys, diagnostics table). Updated: `estado-actual.md`, `checklist-go-live-real.md` (item now `[x]`), `docs/ingenieria/README.md`, root `README.md`, `apps/api/wrangler.jsonc`, `apps/web/.env.example`.

### Follow-up (not in this task)
`/admin/*` still rides on `ADMIN_API_KEY` and is not behind Turnstile — it is a machine-to-machine surface awaiting Cloudflare Access service tokens (already tracked in the go-live checklist).
<!-- SECTION:FINAL_SUMMARY:END -->
