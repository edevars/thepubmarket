// Fee model — The Pub Market (TASK-058). Todo ex-IVA (IVA acreditable para negocio registrado).
// Fuente de verdad de los números de apps/pitch/public/fees/ (el JS de la página porta esta
// lógica 1:1; con los defaults, ambos deben producir las mismas tablas).
// Correr: node scripts/fee-model.mjs
// Tarifas Stripe MX verificadas ago 2026: stripe.com/mx/pricing · stripe.com/mx/connect/pricing
//   · docs.stripe.com/connect/direct-charges-fee-payer-behavior
// Tipos de cuenta conectada modelados (docs.stripe.com/connect/direct-charges-fee-payer-behavior):
//   A = Express vía controller properties, fees.payer 'application' (LO IMPLEMENTADO HOY):
//       la plataforma paga processing + disputas + intl + cuotas de Connect.
//   B = Express legacy (type:'express') → fees.payer 'application_express':
//       el seller paga processing/disputas/intl; la plataforma paga las cuotas de Connect.
//   C = Standard (type:'standard') → fees.payer 'account':
//       el seller paga processing/disputas/intl y NO hay cuotas de Connect para la plataforma.
//       Además, Stripe (no la plataforma) es responsable de saldos negativos.
const IVA = 1.16
const S = { proc: 0.036, fix: 3, intl: 0.005, poutPct: 0.0025, poutFix: 12, acct: 35, dispute: 150 }
const FIXED = 500,
  SALARY = 40000

// Distribuciones de tamaño de orden (MXN). Singles media ~$436 (AOV doc: $400). Sellado media ~$2,560.
const SINGLES = [
  [80, 0.15],
  [150, 0.2],
  [250, 0.2],
  [400, 0.2],
  [700, 0.15],
  [1200, 0.07],
  [2500, 0.03],
]
const SEALED = [
  [800, 0.2],
  [1500, 0.3],
  [2500, 0.3],
  [6000, 0.2],
]
const mean = (d) => d.reduce((s, [x, w]) => s + x * w, 0)

const BASE = { refund: 0.04, intlShare: 0.05, disputeRate: 0.003 }

// Por orden de valor X con fee f (IVA incluido en lo cobrado), config, fee mínimo.
function order(X, f, cfg, minFee = 0, a = BASE) {
  const appFee = Math.max(f * X, minFee)
  const rev = ((1 - a.refund) * appFee) / IVA // en refund se devuelve el app fee
  const proc = (S.proc + a.intlShare * S.intl) * X + S.fix // Stripe no devuelve su fee en refunds
  let cost = cfg === 'A' ? proc + a.disputeRate * S.dispute : 0
  const sellerNet = Math.max(1 - f - (cfg === 'A' ? 0 : S.proc + S.fix / X), 0)
  // Standard (C) no genera cuotas de Connect para la plataforma; A y B sí.
  if (cfg !== 'C') cost += S.poutPct * X * sellerNet * (1 - a.refund)
  return { rev, cost, net: rev - cost }
}
const E = (d, f, cfg, mf, a) =>
  d.reduce(
    (o, [X, w]) => {
      const r = order(X, f, cfg, mf, a)
      return { rev: o.rev + w * r.rev, cost: o.cost + w * r.cost, net: o.net + w * r.net }
    },
    { rev: 0, cost: 0, net: 0 },
  )

function month(gmv, mix, fS, fP, cfg, sellers, poutsPerSeller, mf = 0, a = BASE) {
  const gS = gmv * mix,
    gP = gmv * (1 - mix)
  const nS = gS / mean(SINGLES),
    nP = gP / mean(SEALED)
  const eS = E(SINGLES, fS, cfg, mf, a),
    eP = E(SEALED, fP, cfg, mf, a)
  const rev = nS * eS.rev + nP * eP.rev
  const connect = cfg === 'C' ? 0 : sellers * (S.acct + poutsPerSeller * S.poutFix)
  const cost = nS * eS.cost + nP * eP.cost + connect + FIXED
  return { rev, net: rev - cost, pct: ((rev - cost) / gmv) * 100 }
}

const pct = (x) => `${(x * 100).toFixed(2)}%`
const mxn = (x) => `$${Math.round(x).toLocaleString('en')}`

// ── T1: barrido de fee en SINGLES (sobre distribución, sin fee mínimo) ─────────
console.log('\n== T1 SINGLES: take neto plataforma (%GMV singles) y neto del seller ==')
console.log(
  'fee | A: plat | B: plat | seller bruto A | seller efect A* | seller bruto B | seller efect B*',
)
for (const f of [0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.14]) {
  const A = E(SINGLES, f, 'A', 0, BASE),
    B = E(SINGLES, f, 'B', 0, BASE),
    m = mean(SINGLES)
  const sBA = 1 - f,
    sEA = 1 - f / IVA
  const sBB = 1 - f - (S.proc * IVA + (S.fix * IVA) / 400),
    sEB = 1 - f / IVA - S.proc - S.fix / 400
  console.log(
    `${pct(f)} | ${pct(A.net / m)} | ${pct(B.net / m)} | ${pct(sBA)} | ${pct(sEA)} | ${pct(sBB)} | ${pct(sEB)}`,
  )
}
console.log(
  '* efect = seller con RFC que acredita IVA (fee y Stripe ex-IVA). Bruto B a orden de $400.',
)

// ── T2: barrido SELLADO ────────────────────────────────────────────────────────
console.log('\n== T2 SELLADO: take neto plataforma (%GMV sellado) ==')
console.log('fee | A: plat | B: plat | seller bruto B @$2500')
for (const f of [0.04, 0.05, 0.06, 0.07, 0.08]) {
  const A = E(SEALED, f, 'A', 0, BASE),
    B = E(SEALED, f, 'B', 0, BASE),
    m = mean(SEALED)
  console.log(
    `${pct(f)} | ${pct(A.net / m)} | ${pct(B.net / m)} | ${pct(1 - f - (S.proc * IVA + (S.fix * IVA) / 2500))}`,
  )
}

// ── T3: orden mínima viable (contribución marginal ≥ 0, sin costos fijos) ─────
console.log('\n== T3: orden mínima viable por fee/config (solo costo marginal) ==')
for (const [f, cfg] of [
  [0.09, 'A'],
  [0.1, 'A'],
  [0.13, 'A'],
  [0.09, 'B'],
  [0.1, 'B'],
]) {
  let X = 10
  while (X < 2000 && order(X, f, cfg).net < 0) X += 5
  console.log(`fee ${pct(f)} cfg ${cfg}: ~${mxn(X)}`)
}

// ── T4: bundles de política × escenarios ──────────────────────────────────────
const SC = [
  ['Conservador', 80000, 2],
  ['Base', 332000, 5],
  ['Optimista', 1200000, 12],
]
const BUNDLES = [
  ['P0 hoy: A, 10% flat, sin min', 'A', 0.1, 0.1, 0],
  ['P1 docs: A, 9/5, min $15', 'A', 0.09, 0.05, 15],
  ['P2 A repriced: A, 13/7, min $25', 'A', 0.13, 0.07, 25],
  ['P3 B docs: B, 9/5, min $10', 'B', 0.09, 0.05, 10],
  ['P4 B rec: B, 10/6, min $15', 'B', 0.1, 0.06, 15],
  ['P5 B flat: B, 10/10, min $15', 'B', 0.1, 0.1, 15],
]
console.log('\n== T4: neto mensual plataforma (mix 60/40, payout semanal=4.33/seller) ==')
console.log(`bundle | ${SC.map((s) => s[0]).join(' | ')} | GMV break-even sueldo`)
for (const [name, cfg, fS, fP, mf] of BUNDLES) {
  const row = SC.map(([, g, sel]) => {
    const m = month(g, 0.6, fS, fP, cfg, sel, 4.33, mf)
    return `${mxn(m.net)} (${m.pct.toFixed(1)}%)`
  })
  // GMV*: sueldo; sellers escalan ~1 por cada $70k GMV (min 2)
  let g = 100000,
    net = 0
  while (g < 6e6) {
    net = month(g, 0.6, fS, fP, cfg, Math.max(2, Math.round(g / 70000)), 4.33, mf).net
    if (net >= SALARY) break
    g += 10000
  }
  console.log(`${name} | ${row.join(' | ')} | ${mxn(g)}`)
}

// ── T5: sensibilidad del bundle P4 y P2 (escenario Base) ──────────────────────
console.log('\n== T5: sensibilidad (Base $332k, neto mensual) ==')
const VAR = [
  ['refund 0%', { ...BASE, refund: 0 }],
  ['refund 8%', { ...BASE, refund: 0.08 }],
  ['intl 0%', { ...BASE, intlShare: 0 }],
  ['intl 15%', { ...BASE, intlShare: 0.15 }],
  ['disputas 1%', { ...BASE, disputeRate: 0.01 }],
]
for (const [label, a] of VAR) {
  const p2 = month(332000, 0.6, 0.13, 0.07, 'A', 5, 4.33, 25, a),
    p4 = month(332000, 0.6, 0.1, 0.06, 'B', 5, 4.33, 15, a)
  console.log(`${label}: P2(A 13/7) ${mxn(p2.net)} | P4(B 10/6) ${mxn(p4.net)}`)
}
// mix y AOV
for (const mix of [0.8, 0.4]) {
  const p2 = month(332000, mix, 0.13, 0.07, 'A', 5, 4.33, 25),
    p4 = month(332000, mix, 0.1, 0.06, 'B', 5, 4.33, 15)
  console.log(`mix singles ${mix * 100}%: P2 ${mxn(p2.net)} | P4 ${mxn(p4.net)}`)
}
const SMALL = SINGLES.map(([x, w]) => [x * 0.6, w]) // AOV singles ~$262
{
  const eA = E(SMALL, 0.13, 'A', 25, BASE),
    eB = E(SMALL, 0.1, 'B', 15, BASE),
    m = mean(SMALL)
  console.log(`AOV singles −40% (~$262): take/GMV P2 ${pct(eA.net / m)} | P4 ${pct(eB.net / m)}`)
}

// ── T6: MSI (3 meses ~+5% ex-IVA) en sellado, quién lo absorbe ────────────────
console.log('\n== T6: MSI 3m (+5%) en orden sellado $2,500 ==')
for (const [f, cfg] of [
  [0.07, 'A'],
  [0.06, 'B'],
]) {
  const a = { ...BASE }
  const o = order(2500, f, cfg, 0, a)
  const msi = 0.05 * 2500
  const platNet = cfg === 'A' ? o.net - msi : o.net
  const sellerHit = cfg === 'B' ? msi : 0
  console.log(
    `cfg ${cfg} fee ${pct(f)}: neto plataforma ${mxn(platNet)} | costo extra seller ${mxn(sellerHit)}`,
  )
}

// ── T7: tipo de cuenta conectada, a fee fijo 10/6 y 10/10 ─────────────────────
// Compara los tres tipos con el MISMO pricing: aísla el efecto del tipo de cuenta.
console.log('\n== T7: tipo de cuenta del seller (mismo pricing, mix 60/40) ==')
console.log('pricing | cuenta | Conservador | Base | Optimista | GMV break-even sueldo')
for (const [pricing, fS, fP] of [
  ['10/6', 0.1, 0.06],
  ['10/10', 0.1, 0.1],
]) {
  for (const [cfg, label] of [
    ['A', 'Express hoy (plataforma paga)'],
    ['B', 'Express legacy (seller paga)'],
    ['C', 'Standard (seller paga, sin Connect)'],
  ]) {
    const row = SC.map(([, g, sel]) => {
      const m = month(g, 0.6, fS, fP, cfg, sel, 4.33, 15)
      return `${mxn(m.net)} (${m.pct.toFixed(1)}%)`
    })
    let g = 100000
    while (g < 6e6) {
      if (month(g, 0.6, fS, fP, cfg, Math.max(2, Math.round(g / 70000)), 4.33, 15).net >= SALARY)
        break
      g += 10000
    }
    console.log(`${pricing} | ${label} | ${row.join(' | ')} | ${mxn(g)}`)
  }
}

// ── T8: neto del seller con 10% parejo (¿aguanta la paridad en sellado?) ──────
console.log('\n== T8: neto efectivo del seller con RFC, fee 10% (seller paga Stripe) ==')
for (const X of [80, 400, 800, 2500, 6000]) {
  console.log(`orden ${mxn(X)}: ${pct(1 - 0.1 / IVA - S.proc - S.fix / X)}`)
}
console.log('Piso competitivo (TCGplayer): 87.00%')
