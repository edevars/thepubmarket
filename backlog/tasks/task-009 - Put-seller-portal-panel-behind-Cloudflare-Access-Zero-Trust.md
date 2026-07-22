---
id: TASK-009
title: Put seller portal /panel behind Cloudflare Access / Zero Trust
status: To Do
assignee: []
created_date: '2026-07-22 22:32'
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
- [ ] #3 Local dev workflow for testing /panel without fighting Access documented (e.g. bypass or local Access emulation)
- [ ] #4 No regression to existing PanelShell guard / magic-link session behavior
<!-- AC:END -->
