---
id: TASK-012
title: Add Cloudflare Turnstile to login and checkout entry points
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-22 22:32'
updated_date: '2026-07-29 01:09'
labels:
  - 'epic:anti-bot'
  - feature
milestone: m-1
dependencies: []
priority: medium
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CLAUDE.md specifies Turnstile as the anti-bot layer for registration and checkout. As the marketplace opens to more sellers and real transactions, both the magic-link login request and checkout entry need bot protection. The 'turnstile-spin' Claude Code skill may be useful for scaffolding this end-to-end (widget + managed siteverify Worker).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Turnstile widget added to the /login and /register forms
- [ ] #2 Turnstile widget added to checkout entry point
- [ ] #3 Server-side siteverify check enforced in the Worker before accepting login/register/checkout requests
- [ ] #4 Turnstile site/secret keys managed via Cloudflare secrets, not hardcoded
- [ ] #5 Graceful failure UX in place (Spanish copy) if Turnstile verification fails
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-07-24 04:18
---
Login moved from magic-link to email+password auth (see this session's work). Target forms are now /login and /register instead of the old magic-link request form. Note: apps/api/src/lib/rate-limit.ts (KV-based) was added as an interim/complementary brute-force deterrent on /auth/login, /auth/register, /auth/password/forgot, /auth/password/reset — Turnstile in this task is still the primary anti-bot layer, not superseded by it.
---
<!-- COMMENTS:END -->
