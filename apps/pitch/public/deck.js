// The Pub Market — pitch deck. Vanilla, sin dependencias.
// Revelado al hacer scroll, count-up de cifras, navegación lateral y por teclado.

const sections = Array.from(document.querySelectorAll('.slide'))
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------- navegación lateral por puntos ----------
const dotsNav = document.getElementById('dots')
for (const section of sections) {
  const label = section.dataset.dot || section.id
  const dot = document.createElement('a')
  dot.href = `#${section.id}`
  dot.dataset.target = section.id
  dot.setAttribute('aria-label', label)
  dot.innerHTML = `<span>${label}</span>`
  dotsNav.appendChild(dot)
}
const dots = Array.from(dotsNav.querySelectorAll('a'))

function setActiveDot(id) {
  for (const dot of dots) {
    dot.classList.toggle('active', dot.dataset.target === id)
  }
}

// ---------- count-up ----------
function animateCount(el) {
  const target = Number.parseFloat(el.dataset.count)
  const decimals = Number.parseInt(el.dataset.decimals || '0', 10)
  if (Number.isNaN(target)) return

  if (prefersReduced) {
    el.textContent = target.toFixed(decimals)
    return
  }

  const duration = 1400
  let startTime = null

  function frame(now) {
    if (startTime === null) startTime = now
    const progress = Math.min((now - startTime) / duration, 1)
    // ease-out cúbico
    const eased = 1 - (1 - progress) ** 3
    el.textContent = (target * eased).toFixed(decimals)
    if (progress < 1) requestAnimationFrame(frame)
    else el.textContent = target.toFixed(decimals)
  }

  requestAnimationFrame(frame)
}

// ---------- revelado + disparo de count-up ----------
const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-visible')
      const counter = entry.target.querySelector?.('[data-count]')
      if (counter && !counter.dataset.done) {
        counter.dataset.done = '1'
        animateCount(counter)
      }
      // los contadores que son el propio elemento revelado
      if (entry.target.matches('[data-count]') && !entry.target.dataset.done) {
        entry.target.dataset.done = '1'
        animateCount(entry.target)
      }
      revealObserver.unobserve(entry.target)
    }
  },
  { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
)

for (const el of document.querySelectorAll('[data-reveal]')) {
  revealObserver.observe(el)
}
// contadores observados directamente (por si no comparten el wrapper revelado)
for (const el of document.querySelectorAll('[data-count]')) {
  revealObserver.observe(el)
}

// ---------- punto activo según sección visible ----------
const activeObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) setActiveDot(entry.target.id)
    }
  },
  { threshold: 0.5 },
)
for (const section of sections) {
  activeObserver.observe(section)
}

// ---------- barra de progreso ----------
const progress = document.getElementById('progress')
function updateProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight
  const ratio = scrollable > 0 ? window.scrollY / scrollable : 0
  progress.style.width = `${Math.min(ratio * 100, 100)}%`
}
window.addEventListener('scroll', updateProgress, { passive: true })
window.addEventListener('resize', updateProgress)
updateProgress()

// ---------- navegación por teclado ----------
function currentIndex() {
  const mid = window.scrollY + window.innerHeight / 2
  let index = 0
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].offsetTop <= mid) index = i
  }
  return index
}

function goTo(index) {
  const clamped = Math.max(0, Math.min(index, sections.length - 1))
  sections[clamped].scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' })
}

window.addEventListener('keydown', (event) => {
  const next = ['ArrowDown', 'ArrowRight', 'PageDown']
  const prev = ['ArrowUp', 'ArrowLeft', 'PageUp']
  if (next.includes(event.key)) {
    event.preventDefault()
    goTo(currentIndex() + 1)
  } else if (prev.includes(event.key)) {
    event.preventDefault()
    goTo(currentIndex() - 1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    goTo(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    goTo(sections.length - 1)
  }
})
