---
id: TASK-058
title: >-
  Fee-analysis site: interactive pricing model explorer at /fees on the pitch
  worker
status: To Do
assignee: []
created_date: '2026-08-07 04:52'
labels:
  - 'epic:pricing'
  - pitch
milestone: m-0
dependencies: []
references:
  - docs/negocio/pricing-y-comisiones.md
  - docs/negocio/modelo-financiero.md
  - apps/pitch/README.md
  - 'https://docs.stripe.com/connect/direct-charges-fee-payer-behavior'
  - 'https://stripe.com/mx/pricing'
  - 'https://stripe.com/mx/connect/pricing'
priority: medium
type: feature
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the deep fee/cost analysis (Stripe MX costs vs platform take under both fees.payer configs) as an interactive static page so the operator can review the pricing proposals calmly and share them with partners.

Context (durable decisions from the analysis, source of numbers):
- Model is ex-IVA throughout (IVA creditable for RFC-registered parties). Stripe MX: 3.6% + $3 card processing (fees exclude IVA, 16% added on top), Connect: $35/mo active account + 0.25% + $12 per payout, $150 dispute fee.
- Config A = current implementation: controller.fees.payer 'application' (platform pays processing/disputes/intl). Config B = 'application_express' via legacy type:'express' (seller pays processing; platform pays Connect only).
- Current code reality: flat 10% fee (PLATFORM_FEE_BPS=1000), no singles/sealed split, no minimum fee, config A. Docs say 9%/5% — drift exists.
- Five policy bundles compared (P0 today, P1 docs as-written, P2 A-repriced 13/7, P3 B 9/5, P4 recommended B 10/6 min $15) across three GMV scenarios (80k/332k/1.2M), with salary break-even GMV, sensitivity (refunds, intl share, disputes, mix, AOV) and MSI exposure.
- Recommendation: bundle P4. Competitive constraint: RFC-registered seller effective net >= 87% (TCGplayer parity); 10% IVA-inclusive saturates it exactly.
- Reference model script: /tmp/fee-model.mjs from the analysis session (port its logic into the page; also commit as scripts/fee-model.mjs so numbers are reproducible).

The page lives in apps/pitch/public/fees/ (assets-only Worker, vanilla HTML/CSS/JS, zero build step, aesthetic aligned with the deck and apps/web tokens). Spanish UI. Interactive: user can adjust assumptions (mix, AOV scale, refund rate, intl share, GMV) and see bundle outcomes recompute live. Static tables must match the committed script output at default assumptions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /fees/ page served by the pitch worker (wrangler dev + dry-run build pass) without touching the existing deck routes
- [ ] #2 Shows the 5 policy bundles with platform net take, monthly net per GMV scenario, and salary break-even GMV, matching the committed model script output at default assumptions
- [ ] #3 Interactive controls for at least: singles/sealed fee levels, fees.payer config A/B, mix, refund rate, and GMV — results recompute live without page reload
- [ ] #4 States assumptions and caveats visibly: ex-IVA treatment, illustrative distributions, no demand-elasticity data, not formal tax advice
- [ ] #5 Spanish UI; visual quality per frontend-design skill and audited against web-design-guidelines (micro-interactions, prefers-reduced-motion respected)
- [ ] #6 Model logic committed as scripts/fee-model.mjs and referenced from the page/docs so numbers are reproducible
<!-- AC:END -->
