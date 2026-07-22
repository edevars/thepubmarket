---
id: TASK-010
title: Formalize admin invitation flow for vetted sellers (no self-registration)
status: To Do
assignee: []
created_date: '2026-07-22 22:32'
labels:
  - 'epic:identity'
  - feature
milestone: m-1
dependencies: []
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today, linking a seller account to a login email happens via a raw internal endpoint (POST /admin/sellers/:id/link with an x-admin-key header, see docs/ingenieria/estado-actual.md). This is functional but not a proper, auditable admin workflow. Per CLAUDE.md's 'vetted sellers / no self-registration' rule, this must remain admin-invite-only — this task formalizes that into a real, auditable flow (not necessarily a full UI, but at minimum logging/audit trail and guardrails), and must explicitly prevent any path to public self-registration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Admin invite-and-link action (building on POST /admin/sellers/:id/link) is auditable — who invited whom, when, recorded
- [ ] #2 Explicit safeguards confirmed preventing any public self-registration path for sellers
- [ ] #3 Documented process for how a new vetted seller gets invited end-to-end (admin action -> seller receives access)
- [ ] #4 x-admin-key protection reviewed and confirmed adequate, or upgraded if found insufficient
<!-- AC:END -->
