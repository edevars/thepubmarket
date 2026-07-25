---
id: TASK-009
title: Put seller portal /panel behind Cloudflare Access / Zero Trust
status: In Progress
assignee: []
created_date: '2026-07-22 22:32'
updated_date: '2026-07-25 01:55'
labels:
  - 'epic:seller-portal'
  - feature
milestone: m-1
dependencies: []
priority: high
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The seller portal /panel already has application-level auth (sellerAuth middleware: magic-link session + sellers.user_id, see apps/api/src/middleware/seller-auth.ts and PanelShell guard in apps/web/src/components/panel/). Per CLAUDE.md's security stack, admin/seller panels should additionally sit behind Cloudflare Access / Zero Trust as a network-level layer, not rely solely on application auth. This is additive hardening, not a replacement for the existing magic-link flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /panel/* routes gated by Cloudflare Access in addition to existing sellerAuth magic-link check
- [ ] #2 Access policies defined for which identities (invited/vetted sellers) may reach the portal
- [x] #3 Local dev workflow for testing /panel without fighting Access documented (e.g. bypass or local Access emulation)
- [x] #4 No regression to existing PanelShell guard / magic-link session behavior
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code shipped on this branch (uncommitted as of 2026-07-24):
- apps/web/src/lib/cloudflare-access.ts — verifyAccessJwt() via jose, real JWKS verification (aud/iss/exp), never throws.
- apps/web/src/lib/panel-access-guard.ts — guardPanelAccess(), gates /panel and /{locale}/panel. Fail-closed 503 in production if CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD unset; dev-only ACCESS_LOCAL_BYPASS escape hatch (no-op in production).
- apps/web/src/middleware.ts — composes the guard with the existing next-intl middleware; i18n behavior on non-/panel routes unchanged.
- Test infra bootstrapped from scratch for apps/web (vitest — repo had none before): 18 tests across cloudflare-access.test.ts (JWT verification: valid/expired/wrong-aud/wrong-iss/key-not-found/malformed/JWKS-fetch-failure) and panel-access-guard.test.ts (path matching, bypass, fail-closed config, 401/403/pass-through). Verified live against the actual built Worker via `opennextjs-cloudflare build` + `wrangler dev` (not just unit tests).
- apps/api/src/middleware/seller-auth.ts — fixed stale "magic-link" docblock comment (actual mechanism is email+password, TASK-015).
- docs/ingenieria/cloudflare-access-panel.md — runbook: architecture reasoning (Access gates web /panel pages only, not the API, because cross-origin fetch() calls can't follow Access's hosted-login redirect), manual dashboard steps, workers.dev bypass gap this code closes, local dev workflow.
- docs/ingenieria/checklist-go-live-real.md updated.

REMAINING — cannot be done without Cloudflare account access:
- AC #1: create the Access Application(s) + Policy in the Zero Trust dashboard (allow-list of vetted seller emails), then fill real CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD into apps/web/wrangler.jsonc. Until this is done, the vars are empty placeholders.
- AC #2: policy identities (which vetted sellers) must be entered by hand in the dashboard per the runbook.

⚠️ DEPLOY-ORDER RISK: apps/web/wrangler.jsonc currently ships CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD as empty strings. Per the fail-closed design (intentional, mirrors admin-auth.ts), if this reaches production via Workers Builds auto-deploy on push to main BEFORE the dashboard Access Application is created and real values are filled in, ALL /panel requests will return 503 — including for The Pub Game Store, the current real seller. Do not merge/push to main until the dashboard step is done and wrangler.jsonc has real values, or deploy web separately after that step.
<!-- SECTION:NOTES:END -->
