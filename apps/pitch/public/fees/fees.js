/* =========================================================================
   The Pub Market — /fees/ · modelo + render (TASK-058)
   Porta 1:1 la lógica de scripts/fee-model.mjs. Con los defaults, esta
   página y el script producen los mismos números.
   ========================================================================= */

// ---------- modelo (idéntico a scripts/fee-model.mjs) ----------
const IVA = 1.16
const S = { proc: 0.036, fix: 3, intl: 0.005, poutPct: 0.0025, poutFix: 12, acct: 35, dispute: 150 }
const FIXED = 500
const SALARY = 40000

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

function order(X, f, cfg, minFee = 0, a = BASE) {
  const appFee = Math.max(f * X, minFee)
  const rev = ((1 - a.refund) * appFee) / IVA
  const proc = (S.proc + a.intlShare * S.intl) * X + S.fix
  let cost = cfg === 'A' ? proc + a.disputeRate * S.dispute : 0
  const sellerNet = Math.max(1 - f - (cfg === 'B' ? S.proc + S.fix / X : 0), 0)
  cost += S.poutPct * X * sellerNet * (1 - a.refund)
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
  const gS = gmv * mix
  const gP = gmv * (1 - mix)
  const nS = gS / mean(SINGLES)
  const nP = gP / mean(SEALED)
  const eS = E(SINGLES, fS, cfg, mf, a)
  const eP = E(SEALED, fP, cfg, mf, a)
  const rev = nS * eS.rev + nP * eP.rev
  const cost = nS * eS.cost + nP * eP.cost + sellers * (S.acct + poutsPerSeller * S.poutFix) + FIXED
  return { rev, net: rev - cost, pct: ((rev - cost) / gmv) * 100 }
}

// sellers escalan ~1 por cada $70k de GMV (mín 2), payout semanal — igual que el script
const sellersFor = (gmv) => Math.max(2, Math.round(gmv / 70000))
const POUTS = 4.33

function salaryBreakeven(mix, fS, fP, cfg, mf, a = BASE) {
  for (let g = 100000; g < 6e6; g += 10000) {
    if (month(g, mix, fS, fP, cfg, sellersFor(g), POUTS, mf, a).net >= SALARY) return g
  }
  return null
}

function minViableOrder(f, cfg, a = BASE) {
  for (let X = 10; X < 2000; X += 5) {
    if (order(X, f, cfg, 0, a).net >= 0) return X
  }
  return null
}

// ---------- formato ----------
const fmtMXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})
const mxn = (x) => fmtMXN.format(Math.round(x))
const pct = (x, d = 1) => `${x.toFixed(d)}%`

// ---------- datos de las propuestas ----------
const SCENARIOS = [
  ['Conservador', 80000],
  ['Base', 332000],
  ['Optimista', 1200000],
]
const SELLERS_BY_SCENARIO = [2, 5, 12]

const BUNDLES = [
  {
    id: 'P1',
    name: 'El plan original, tal cual',
    cfg: 'A',
    fS: 0.09,
    fP: 0.05,
    mf: 15,
    cond: ['DMG', 'var(--cond-dmg)'],
    note: 'Cobrar el 9% y 5% del plan sin cambiar quién paga a Stripe. El sellado sale tablas: la peor opción de la mesa.',
  },
  {
    id: 'P0',
    name: 'Lo que cobra el sistema hoy',
    cfg: 'A',
    fS: 0.1,
    fP: 0.1,
    mf: 0,
    cond: ['HP', 'var(--cond-hp)'],
    note: '10% parejo a todo y tú pagas a Stripe. Funciona de casualidad, pero casi la mitad de tu comisión se va a Stripe.',
  },
  {
    id: 'P2',
    name: 'Subir precios sin migrar',
    cfg: 'A',
    fS: 0.13,
    fP: 0.07,
    mf: 25,
    cond: ['MP', 'var(--cond-mp)'],
    note: 'Cobrar 13% y 7% para compensar que tú pagas a Stripe. Mejora, pero los costos sorpresa siguen siendo tuyos.',
  },
  {
    id: 'P3',
    name: 'Migrar, con los % del plan',
    cfg: 'B',
    fS: 0.09,
    fP: 0.05,
    mf: 10,
    cond: ['LP', 'var(--cond-lp)'],
    note: 'El vendedor paga a Stripe y cobras 9% y 5%. Sólida, pero deja dinero en la mesa frente a la recomendada.',
  },
  {
    id: 'P4',
    name: 'La recomendada',
    cfg: 'B',
    fS: 0.1,
    fP: 0.06,
    mf: 15,
    cond: ['NM', 'var(--cond-nm)'],
    note: 'El vendedor paga a Stripe y cobras 10% y 6%. Al vendedor le quedan 87 de cada 100 pesos: igual que en TCGplayer.',
    foil: true,
  },
]

// etiqueta legible de quién paga a Stripe
const whoPays = (cfg) => (cfg === 'B' ? 'el vendedor' : 'tú')

// ---------- render: hero proof ----------
{
  // ganancia por cada $100 vendidos = take neto en %, expresado como pesos
  const a = month(332000, 0.6, 0.1, 0.1, 'A', 5, POUTS, 0)
  const b = month(332000, 0.6, 0.1, 0.06, 'B', 5, POUTS, 15)
  document.getElementById('proof-a').textContent = `$${a.pct.toFixed(2)}`
  document.getElementById('proof-b').textContent = `$${b.pct.toFixed(2)}`
}

// ---------- render: la mano ----------
{
  const hand = document.getElementById('hand')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  BUNDLES.forEach((bd, i) => {
    const base = month(332000, 0.6, bd.fS, bd.fP, bd.cfg, 5, POUTS, bd.mf)
    const be = salaryBreakeven(0.6, bd.fS, bd.fP, bd.cfg, bd.mf)
    // `li` real dentro del `ul#hand`: antes era un `article` con
    // `role="listitem"` calzado encima. `.fx-card` es `display:flex`, así que
    // no aparece marcador de lista.
    const el = document.createElement('li')
    el.className = `fx-card fx-deal${bd.foil ? ' fx-card--foil' : ''}`
    el.style.setProperty('--cond', bd.cond[1])
    el.style.setProperty('--delay', `${i * 110}ms`)
    el.style.setProperty('--tilt', `${(i - 2) * 1.4}deg`)
    el.innerHTML = `
      <div class="fx-card__rank">
        <span>${bd.id} · paga Stripe: ${whoPays(bd.cfg)}</span>
        <span class="fx-card__cond">${bd.cond[0]}</span>
      </div>
      <h3>${bd.name}</h3>
      <p class="fx-card__fees">${pct(bd.fS * 100, (bd.fS * 100) % 1 ? 1 : 0)} sueltas <span>·</span> ${pct(bd.fP * 100, 0)} sellado <span>·</span> mín ${bd.mf ? mxn(bd.mf) : '—'}</p>
      <p class="fx-card__note">${bd.note}</p>
      <div class="fx-card__stats">
        <span class="fx-card__stat">ganancia/mes (Tracción) <b>${mxn(base.net)}</b></span>
        <span class="fx-card__stat">de cada $100 te quedan <b>$${base.pct.toFixed(2)}</b></span>
        <span class="fx-card__stat">ventas p/ sueldo $40k <b class="${be === null ? 'neg' : ''}">${be === null ? 'inalcanzable' : mxn(be)}</b></span>
      </div>`
    hand.appendChild(el)
  })

  if (reduced) {
    hand.querySelectorAll('.fx-deal').forEach((c) => {
      c.classList.add('is-in')
    })
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.querySelectorAll('.fx-deal').forEach((c) => {
              c.classList.add('is-in')
            })
            io.disconnect()
          }
        })
      },
      { threshold: 0.2 },
    )
    io.observe(hand)
  }
}

// ---------- render: tabla de escenarios ----------
{
  const tbody = document.querySelector('#bundles-table tbody')
  BUNDLES.forEach((bd) => {
    const cells = SCENARIOS.map(([, gmv], i) => {
      const m = month(gmv, 0.6, bd.fS, bd.fP, bd.cfg, SELLERS_BY_SCENARIO[i], POUTS, bd.mf)
      return `<td class="${m.net < 0 ? 'fx-neg' : ''}">${mxn(m.net)} <small>(${pct(m.pct)})</small></td>`
    }).join('')
    const be = salaryBreakeven(0.6, bd.fS, bd.fP, bd.cfg, bd.mf)
    const tr = document.createElement('tr')
    if (bd.foil) tr.className = 'fx-best'
    tr.innerHTML = `
      <td>${bd.id} · ${bd.name}</td>
      <td class="fx-td-text">${whoPays(bd.cfg)}</td>
      <td>${(bd.fS * 100).toFixed(0)}% / ${(bd.fP * 100).toFixed(0)}% · mín ${bd.mf ? `$${bd.mf}` : '—'}</td>
      ${cells}
      <td>${be === null ? '—' : mxn(be)}</td>`
    tbody.appendChild(tr)
  })
}

// ---------- explorador ----------
const $ = (id) => document.getElementById(id)
const controls = {
  feeS: $('feeS'),
  feeP: $('feeP'),
  minFee: $('minFee'),
  mix: $('mix'),
  refund: $('refund'),
  intl: $('intl'),
  gmv: $('gmv'),
}

function readState() {
  return {
    cfg: document.querySelector('input[name="config"]:checked').value,
    fS: Number(controls.feeS.value) / 100,
    fP: Number(controls.feeP.value) / 100,
    mf: Number(controls.minFee.value),
    mix: Number(controls.mix.value) / 100,
    a: {
      refund: Number(controls.refund.value) / 100,
      intlShare: Number(controls.intl.value) / 100,
      disputeRate: BASE.disputeRate,
    },
    gmv: Number(controls.gmv.value),
  }
}

function renderExplorer() {
  const st = readState()
  const sellers = sellersFor(st.gmv)
  const m = month(st.gmv, st.mix, st.fS, st.fP, st.cfg, sellers, POUTS, st.mf, st.a)
  const be = salaryBreakeven(st.mix, st.fS, st.fP, st.cfg, st.mf, st.a)
  const minOrder = minViableOrder(st.fS, st.cfg, st.a)

  // outputs de sliders
  $('v-feeS').textContent = pct(st.fS * 100)
  $('v-feeP').textContent = pct(st.fP * 100)
  $('v-minFee').textContent = mxn(st.mf)
  $('v-mix').textContent = pct(st.mix * 100, 0)
  $('v-refund').textContent = pct(st.a.refund * 100, 0)
  $('v-intl').textContent = pct(st.a.intlShare * 100, 0)
  $('v-gmv').textContent = mxn(st.gmv)
  $('sellers-note').textContent =
    `Supone: ${sellers} vendedores activos (≈1 por cada $70k de ventas) · pago semanal a cada uno · 0.3% de contracargos`

  // tiles
  $('r-take').textContent = `$${m.pct.toFixed(2)}`
  $('r-take').classList.toggle('neg', m.net < 0)
  $('r-net').textContent = mxn(m.net)
  $('r-net').classList.toggle('neg', m.net < 0)
  $('r-breakeven').textContent = be === null ? 'inalcanzable' : mxn(be)
  $('r-breakeven').classList.toggle('neg', be === null)
  $('r-minorder').textContent = minOrder === null ? '—' : mxn(minOrder)

  // paridad: seller con RFC, orden de $400 (fee y Stripe ex-IVA)
  const sellerEff = 1 - st.fS / IVA - (st.cfg === 'B' ? S.proc + S.fix / 400 : 0)
  const ok = sellerEff >= 0.87
  const parity = $('parity')
  parity.classList.toggle('fx-parity--ok', ok)
  parity.classList.toggle('fx-parity--bad', !ok)
  $('parity-chip').textContent = ok ? '✓ competitivo para el vendedor' : '✗ pierde vendedores'
  $('parity-text').innerHTML =
    `Al vendedor le quedan <b>${(sellerEff * 100).toFixed(1)}</b> de cada 100 pesos (con RFC, contando el IVA a favor). El piso es <b>87</b>: lo que le queda en TCGplayer.`

  // barra de asignación: orden de $400 en singles, tarjeta nacional, vista bruta
  const X = 400
  const appFee = Math.max(st.fS * X, st.mf)
  const stripeFee = (S.proc * X + S.fix) * IVA
  const seller = st.cfg === 'B' ? X - appFee - stripeFee : X - appFee
  const platform = st.cfg === 'B' ? appFee : appFee - stripeFee
  const segs = [
    ['seller', 'El vendedor recibe', Math.max(seller, 0)],
    ['platform', 'Tu comisión (bruta)', Math.max(platform, 0)],
    ['stripe', 'Stripe cobra (con IVA)', stripeFee],
  ]
  $('alloc-bar').innerHTML = segs
    .map(
      ([k, , v]) =>
        `<div class="fx-alloc__seg fx-alloc__seg--${k}" style="flex-grow:${v.toFixed(2)}"></div>`,
    )
    .join('')
  $('alloc-legend').innerHTML = segs
    .map(
      ([k, label, v]) =>
        `<li><span class="sw fx-alloc__seg--${k}"></span>${label} <b>${mxn(v)}</b> <span>(${pct((v / X) * 100)})</span></li>`,
    )
    .join('')
}

document.getElementById('controls').addEventListener('input', renderExplorer)
document.getElementById('controls').addEventListener('change', renderExplorer)
renderExplorer()

// ---------- sensibilidad (estática, mismos casos que el script T5) ----------
{
  const P2 = { fS: 0.13, fP: 0.07, cfg: 'A', mf: 25 }
  const P4 = { fS: 0.1, fP: 0.06, cfg: 'B', mf: 15 }
  const at = (b, mix, a) => month(332000, mix, b.fS, b.fP, b.cfg, 5, POUTS, b.mf, a)
  const CASES = [
    ['Nadie devuelve nada (0%)', 0.6, { ...BASE, refund: 0 }, 'las devoluciones pegan parejo'],
    ['El doble de devoluciones (8%)', 0.6, { ...BASE, refund: 0.08 }, ''],
    ['Muchas tarjetas extranjeras (15%)', 0.6, { ...BASE, intlShare: 0.15 }, 'a la recomendada no le afecta: lo paga el vendedor'],
    ['Más contracargos (1%)', 0.6, { ...BASE, disputeRate: 0.01 }, 'a la recomendada no le afecta: lo paga el vendedor'],
    ['Se vende más carta suelta (80%)', 0.8, BASE, 'más cartas sueltas favorece a ambas'],
    ['Se vende más sellado (60%)', 0.4, BASE, 'con mucho sellado, la opción sin migrar sufre más'],
  ]
  const tbody = document.querySelector('#sens-table tbody')
  const baseline = [at(P2, 0.6, BASE).net, at(P4, 0.6, BASE).net]
  tbody.innerHTML =
    `<tr><td>— Todo sale como se supuso</td><td>${mxn(baseline[0])}</td><td>${mxn(baseline[1])}</td><td class="fx-td-text"></td></tr>` +
    CASES.map(([label, mix, a, note]) => {
      const p2 = at(P2, mix, a).net
      const p4 = at(P4, mix, a).net
      return `<tr><td>${label}</td><td>${mxn(p2)}</td><td>${mxn(p4)}</td><td class="fx-td-text">${note}</td></tr>`
    }).join('')

  // MSI: una orden sellada de $2,500 con 3 MSI (~+5% ex-IVA)
  const msi = 0.05 * 2500
  const oA = order(2500, 0.07, 'A', 0, BASE)
  const oB = order(2500, 0.06, 'B', 0, BASE)
  $('msi-text').innerHTML =
    `Vender una caja de <b>$2,500</b> a 3 meses sin intereses cuesta ~<b>${mxn(msi)}</b> extra de comisión. ` +
    `Si tú pagas a Stripe (como hoy), esa venta te deja <b>${mxn(oA.net - msi)}</b>: pierdes dinero. ` +
    `Con la propuesta, tu ganancia queda en <b>${mxn(oB.net)}</b> y el costo extra es del vendedor. ` +
    `Recomendación: MSI apagado al arranque; si se prende para sellado, con acuerdo explícito del vendedor.`
}
