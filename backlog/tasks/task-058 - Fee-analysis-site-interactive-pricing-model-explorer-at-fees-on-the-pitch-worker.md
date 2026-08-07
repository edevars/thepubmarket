---
id: TASK-058
title: >-
  Fee-analysis site: interactive pricing model explorer at /fees on the pitch
  worker
status: Done
assignee:
  - claude
created_date: '2026-08-07 04:52'
updated_date: '2026-08-07 05:03'
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
- [x] #1 /fees/ page served by the pitch worker (wrangler dev + dry-run build pass) without touching the existing deck routes
- [x] #2 Shows the 5 policy bundles with platform net take, monthly net per GMV scenario, and salary break-even GMV, matching the committed model script output at default assumptions
- [x] #3 Interactive controls for at least: singles/sealed fee levels, fees.payer config A/B, mix, refund rate, and GMV — results recompute live without page reload
- [x] #4 States assumptions and caveats visibly: ex-IVA treatment, illustrative distributions, no demand-elasticity data, not formal tax advice
- [x] #5 Spanish UI; visual quality per frontend-design skill and audited against web-design-guidelines (micro-interactions, prefers-reduced-motion respected)
- [x] #6 Model logic committed as scripts/fee-model.mjs and referenced from the page/docs so numbers are reproducible
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Branch task/TASK-058-fees-site off main.
2. Commit the analysis model as scripts/fee-model.mjs (verbatim from session, deterministic; node scripts/fee-model.mjs regenerates all tables).
3. Build apps/pitch/public/fees/ as a self-contained page (index.html + fees.css + fees.js) served by the existing assets-only worker — no wrangler changes needed (assets dir already ./public; /fees/ resolves to fees/index.html).
4. fees.js ports the model 1:1 (same constants/distributions/defaults) and renders: hero with the central finding; assumptions strip; bundle comparison cards (P0–P4) with monthly net per scenario + salary break-even; interactive explorer (config A/B toggle, singles/sealed fee sliders, mix, refund, GMV) recomputing live; sensitivity table; MSI note; caveats block (ex-IVA, illustrative, no elasticity, not tax advice).
5. Aesthetic: reuse deck tokens (Mística TCG premium — same palette/fonts/clip-path language, dark), micro-interactions with prefers-reduced-motion guards. frontend-design skill for build, web-design-guidelines audit before close.
6. Verify: node script output matches page defaults; wrangler dev smoke (curl /fees/) + dry-run build; deck routes untouched.
7. Commit → merge to main → deploy pitch worker.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification evidence: (1) wrangler dev + curl — /fees/, /fees/fees.css, /fees/fees.js and / (deck) all 200, deck untouched; dry-run build passes (7 assets). (2) Model parity — extracted the model section of fees.js and ran it in node: all five bundles reproduce scripts/fee-model.mjs T4 exactly (P0 $12,034/3.6% … P4 $21,844/6.6% at Base, break-evens $1.08M–$610k). (3) Interactivity verified at logic level (renderExplorer pure recompute + input/change listeners) per project no-browser-testing policy. (4) web-design-guidelines audit run; fixes applied: skip link, theme-color meta, scroll-margin-top, text-wrap balance, tabular-nums coverage, touch-action, curly quotes, radio change listener. (5) Allocation-bar palette validated with dataviz validator (dark, #0c1322): seller #2fae74 / platform #3b7bff / stripe #b8862e, all checks PASS. Deployed: https://thepubmarket-pitch.enrique-devars-cee.workers.dev/fees/ (prod 200).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Interactive fee-analysis explorer shipped at /fees/ on the pitch worker (assets-only, vanilla HTML/CSS/JS, zero build).

What changed:
- scripts/fee-model.mjs — the deterministic cost model from the pricing analysis (ex-IVA, Stripe MX Aug-2026 rates, configs A/B), now the reproducible source of truth (`node scripts/fee-model.mjs`).
- apps/pitch/public/fees/{index.html,fees.css,fees.js} — Spanish dashboard extending the deck's Mística TCG tokens. Signature: the five pricing bundles rendered as cards graded by condition (P1=DMG "los docs tal cual" → P4=NM foil "la recomendada"), rank = the model's real verdict. Sections: thesis hero (config A vs B take), assumptions strip, hand of cards, three-scenario table, live explorer (config toggle, fee/mix/refund/intl/GMV sliders, parity chip vs TCGplayer 87%, $400-order allocation bar), sensitivity table, MSI note, three pending decisions, caveats + sources.

Why: pricing decision support — the analysis showed who pays Stripe (fees.payer) matters ~3 GMV points vs ~0.8 per fee point; the page makes that legible and shareable with partners.

Verification: page JS reproduces the committed script's tables exactly at defaults (node eval check); curl smoke on dev and prod (all 200, deck intact); dry-run build passes; web-design-guidelines audit applied; allocation palette CVD-validated. Deployed to https://thepubmarket-pitch.enrique-devars-cee.workers.dev/fees/.

Risks/follow-ups: distributions and mix remain illustrative until real store data lands; the three decision tasks (migrate fees.payer, per-category fee + minimum, IVA-inclusive pricing) are not yet created in Backlog.
<!-- SECTION:FINAL_SUMMARY:END -->
