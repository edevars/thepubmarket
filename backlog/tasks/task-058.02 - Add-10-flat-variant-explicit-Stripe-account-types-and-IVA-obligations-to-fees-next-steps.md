---
id: TASK-058.02
title: >-
  Add 10%-flat variant, explicit Stripe account types and IVA obligations to
  /fees next steps
status: In Progress
assignee:
  - claude
created_date: '2026-08-07 22:47'
updated_date: '2026-08-07 22:47'
labels:
  - 'epic:pricing'
  - pitch
  - compliance
milestone: m-0
dependencies: []
references:
  - 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LIVA.pdf'
  - >-
    https://www.sat.gob.mx/minisitio/PlataformasTecnologicas/PlataformasTecnologicas_Intermediacion/documentos/DisposicionesFiscales_intermediacion.pdf
  - 'https://docs.stripe.com/connect/direct-charges-fee-payer-behavior'
  - 'https://docs.stripe.com/connect/migrate-to-controller-properties'
  - apps/api/src/routes/seller-connect.ts
parent_task_id: TASK-058
priority: high
type: enhancement
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the /fees analysis page with three additions requested by the operator.

1. New pricing variant P5: 10% flat on BOTH singles and sealed (config B, min $15). Model result: $26,253/mo at Base vs $21,844 for P4 (10/6); salary break-even drops to $510k. Seller still nets 87.4–87.7% on sealed, so TCGplayer parity holds — but sealed competes on retail price, not seller net, so the page must state that risk honestly.

2. Explicit Stripe account configuration for BOTH sides, since this was ambiguous:
   - Owner/platform: Mexican Stripe account with Connect enabled (platform profile), RFC + Constancia de Situación Fiscal uploaded so Stripe issues CFDI for its fees, negative-balance responsibility acknowledged where applicable.
   - Seller/connected: three real options with different economics — Standard (type:'standard', fees.payer 'account': seller pays Stripe, platform pays zero Connect fees, Stripe carries negative-balance risk, seller gets full dashboard), Express legacy (type:'express' → fees.payer 'application_express': seller pays processing, platform pays Connect fees + carries negative-balance risk), and Express via controller properties (current implementation, fees.payer 'application': platform pays everything — the configuration to move off).
   Model the Standard option as config C (no Connect account/payout fees) so the comparison is numeric.

3. IVA / fiscal section. Legal basis verified in the statute (LIVA texto vigente consolidado 12-11-2021; the 2026 reform raised retention rates and extended them to personas morales — flag as needing re-verification):
   - Art. 1-A BIS LIVA: Mexican-resident intermediation platforms must comply with Art. 18-J obligations.
   - Art. 18-J fracc. I: must publish IVA expressly and separately on the site, OR publish prices with the legend "IVA incluido". The platform currently shows neither — this is a concrete product gap.
   - Art. 18-J fracc. II: IVA retention obligation triggers only "cuando cobren el precio y el IVA... por cuenta del enajenante". Direct charges mean the platform never collects the price, so retention arguably does not trigger — the same non-custodial design that keeps it out of IFPE.
   - Art. 18-J fracc. III: monthly information reporting to SAT is required "aun cuando no hayan efectuado el cobro de la contraprestación y el IVA" — name/RFC/CURP/domicilio fiscal/financial institution and CLABE where deposits are received/amount transacted per seller, by day 10. The CLABE requirement is a real data gap under Stripe Connect.
   - Art. 18-K: sellers must offer prices showing IVA expressly and separately.
   - Platform commission is a taxable service: platform must issue CFDI to the seller for its fee; whoever pays Stripe's fee gets Stripe's CFDI and credits that IVA.
   Everything flagged as analysis, not formal tax advice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 P5 (10% flat, config B) appears as a sixth option in the cards and scenario table with correct model values, plus an explicit note on the sealed retail-price risk
- [ ] #2 Model script gains config C (Standard accounts, no Connect fees) and the new bundles; page reproduces script output at defaults
- [ ] #3 A next-steps section states explicitly what Stripe account the owner/platform needs and what account type each seller needs, comparing Standard vs Express-legacy vs current Express-controller with their economic and risk trade-offs
- [ ] #4 An IVA/fiscal section explains: platform must show 'IVA incluido' or IVA separately (Art. 18-J-I), why direct charges avoid the retention obligation (18-J-II), the monthly SAT reporting that applies anyway including the CLABE data gap (18-J-III), seller obligations (18-K), and CFDI duties on both sides
- [ ] #5 Fiscal content is marked as analysis and not formal tax advice, with the 2026 reform flagged for re-verification
- [ ] #6 Plain language maintained throughout; build, curl smoke and deploy pass; deck routes untouched
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Branch task/TASK-058.02-accounts-iva.
1. scripts/fee-model.mjs: add cfg 'C' (Standard — seller pays processing, platform pays no Connect account/payout fee), add bundles P5 (B 10/10) and P5c (C 10/10); keep existing tables stable so prior numbers still reproduce.
2. fees.js: mirror cfg C, add P5 to BUNDLES (sixth card + table row), make the simulator config control three-way (tú / vendedor Express / vendedor Standard), keep whoPays() labels plain.
3. index.html: (a) sealed-risk note on P5; (b) rewrite next steps into an explicit configuration section — owner account requirements, then a seller account-type comparison table (Standard vs Express legacy vs current Express-controller) with cost, who carries negative balances, dashboard, onboarding friction; (c) new IVA/fiscal section with the four obligations (18-J I/II/III, 18-K), the CFDI duties on both sides, the CLABE data gap, and the "no es asesoría fiscal" marker + 2026 reform caveat.
4. fees.css: styles for the account-type table and the fiscal block, reusing existing tokens.
5. Verify script/page parity in node, dry-run build, curl smoke dev, commit → merge → deploy → prod smoke, close.
<!-- SECTION:PLAN:END -->
