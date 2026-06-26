# The Pub Market — One-Pager

*Marketplace curado de Trading Card Games para México, anclado en The Pub Game Store (CDMX).*

---

## El problema

El comercio de cartas de TCG (singles y sellado) en México vive en canales rotos: **grupos de Facebook y WhatsApp** (sin confianza, sin escrow, fraude común), **Mercado Libre** (no diseñado para singles, mal manejo de condición/edición, comisiones altas) y **tiendas locales sin presencia digital**. No existe un equivalente local a **TCGplayer** o **Cardmarket**: un lugar curado, confiable y especializado para comprar y vender cartas con la edición, idioma y condición correctas.

## La solución

Un marketplace **vertical y curado**, bilingüe (ES/EN), enfocado primero en **MTG singles** y producto sellado, con catálogo estructurado (edición, idioma, condición, foil), pagos seguros y vendedores **invitados y verificados** — no un bazar abierto. Ancla: The Pub Game Store, con inventario y comunidad activa desde el día uno.

## El modelo

- **Comisión sobre ventas** (application fee): ~9% en singles, ~5% en sellado. Take rate efectivo ~7%.
- **Sin custodia de fondos.** Stripe Connect con *direct charges*: el dinero va directo comprador → vendedor; la plataforma solo cobra su comisión. Esto mantiene a The Pub Market **fuera de los requisitos IFPE de la Ley Fintech** y elimina el riesgo regulatorio de capital.
- **Costo de operación cercano a cero.** Stack 100% Cloudflare; operable por una sola persona.

## La ventaja

- **CAC ≈ $0 al arranque.** The Pub Game Store ya tiene la comunidad física de jugadores en CDMX — el activo más caro de cualquier marketplace ya está pagado.
- **Curación como foso.** Modelo vetted: confianza y calidad que un marketplace abierto no puede replicar rápido.
- **Liquidez desde el día uno.** El seller ancla garantiza catálogo y ventas sin esperar a la masa crítica.

## El plan

Llegar a la primera venta real rápido (ancla única) → sumar 3-5 sellers vetted → construir liquidez y recurrencia en MTG → expandir a otros TCG. Objetivo de tracción: cruzar **~$300-500K MXN/mes de GMV** apalancando la comunidad existente antes de invertir en adquisición pagada.

## El "ask"

The Pub Market **no requiere capital de operación significativo** (infra ~$300-800 MXN/mes, sin inventario propio nuevo, sin custodia). No es un caso de venture capital de crecimiento ilimitado. El encaje correcto es un **socio estratégico / inversionista ángel del ecosistema The Pub**: capital ligero para acelerar desarrollo, onboarding de sellers y marketing de lanzamiento, a cambio de participación en el valor combinado tienda + plataforma. Ver el "ask" detallado en [`business-plan.md`](./business-plan.md) §Capital.

> **Honestidad de la tesis:** el upside está acotado por diseño (nicho TCG, México, sellers vetted, un operador). A cambio, el riesgo a la baja es casi nulo y el retorno sobre capital invertido es alto. Es una apuesta de **asimetría favorable**, no un cohete. Ver [`tesis-de-negocio.md`](./tesis-de-negocio.md).

---

*MXN salvo indicación contraria. Números ilustrativos. No es asesoría legal/fiscal formal.*
