# CLAUDE.md — The Pub Market

Guía operativa para desarrollo asistido por Claude. Léela completa antes de proponer arquitectura, escribir código o tomar decisiones de producto.

## Qué es

Marketplace curado de Trading Card Games enfocado en México. Vende singles y producto cerrado (booster box). TCG soportados: Yu-Gi-Oh!, Magic: The Gathering, Pokémon TCG, One Piece Card Game, Disney Lorcana, Riftbound TCG.

Vinculado a **The Pub Game Store**, negocio físico en CDMX (restaurante casual + tienda TCG/retail) con comunidad activa de jugadores.

- **Mercado inicial:** México.
- **Producto inicial:** singles de MTG.

## Restricción crítica — no custodia de fondos

**La plataforma NO custodia fondos en ningún momento.** El dinero fluye directo entre comprador y vendedor vía el procesador de pagos. Es una decisión deliberada para quedar fuera de los requisitos de IFPE de la Ley Fintech mexicana.

Cualquier propuesta técnica o de producto debe respetar esto. En concreto:

- **Stripe Connect con direct/destination charges + application fee.** El dinero nunca pasa por una cuenta controlada por la plataforma.
- Cada seller es una **Connect account** con su propio onboarding, payout y obligaciones fiscales.
- The Pub Market solo cobra su comisión vía **application fee**.
- Si una decisión de diseño implica que la plataforma toque, retenga o redirija fondos aunque sea momentáneamente, **detente y señálalo** antes de avanzar.

## Modelo de negocio

- **Store-first con sellers por invitación (vetted).** The Pub Game Store es el vendedor ancla. Se suman sellers adicionales solo por invitación, conocidos directamente y de alta reputación. **No es marketplace abierto ni de auto-registro.**
- Múltiples sellers liquidando fondos → la no custodia es crítica desde el día uno.

## Stack — Cloudflare-first

### Compute y API
- **Cloudflare Workers + Hono** — backend y API del marketplace.
- **Workflows** — procesos durables con reintentos (flujo de orden post-pago).

### Datos
- **D1** — base transaccional principal (vendedores, inventario, órdenes, usuarios).
- **KV** — sesiones, cache de catálogo, feature flags.
- **R2** — imágenes de cartas y assets (sin egress).
- **Durable Objects** — reserva de inventario para evitar doble compra del mismo single.

### Frontend
- **Cloudflare Pages + Next.js** — sitio bilingüe, CI/CD y previews por rama.

### Pagos
- **Stripe Connect** (o Mercado Pago) — webhooks recibidos en Workers. Modelo sin custodia, application fee.

### IA
- **Workers AI** — labeling de imágenes y detección de condición de cartas.
- **Vectorize** — búsqueda por similitud y recomendaciones.

### Búsqueda
- **D1 + índices** al inicio. Servicio de búsqueda externo cuando crezca el catálogo (probable única pieza fuera del ecosistema Cloudflare).

### Seguridad
- **Cloudflare Access / Zero Trust** — paneles admin y portal de vendedores.
- **Turnstile** — anti-bot en registro y checkout.
- **WAF + rate limiting** — incluidos.

## Cómo trabajar conmigo

- **Directo y técnico.** Asume nivel senior. Sin preámbulos ni explicaciones de lo obvio.
- **Costo y mantenimiento para una sola persona.** Toda arquitectura o feature se evalúa contra el costo operativo y la carga de mantenimiento de un solo desarrollador. Prefiere lo simple y lo durable sobre lo sofisticado.
- **Marca siempre las implicaciones regulatorias** que toque una decisión: Ley Fintech, custodia de fondos, CNBV, IFPE.
- **Temas legales o fiscales en México:** da el análisis, pero recuérdame que no es asesoría legal formal.
- **Idioma:** español por defecto; inglés para términos técnicos cuando sea natural.

## Reglas de decisión (checklist mental)

Antes de proponer algo, verifica:

1. ¿Mantiene la plataforma **fuera del flujo de fondos**? Si no, alto.
2. ¿Lo puede operar y mantener **una sola persona**?
3. ¿Se queda dentro del **ecosistema Cloudflare** salvo justificación clara?
4. ¿Toca algo **regulatorio**? Si sí, señálalo explícitamente.
5. ¿Respeta el modelo **vetted sellers / no auto-registro**?

## Task management

**Backlog.md is the single source of truth for tasks.** Any work that requires
planning or decision-making — features, fixes, hardening, spikes — must be
tracked as a Backlog.md task via the MCP tools (see guidelines below), not in
ad-hoc notes, comments, or conversation history alone.

- `ROADMAP.md` defines phases and strategy; Backlog.md tracks the concrete,
  actionable tasks within each phase (milestone = phase, `epic:<slug>` label =
  epic within a phase).
- Before starting non-trivial work, search Backlog.md first — do not duplicate
  or silently redo something already tracked there.
- Task status in Backlog.md reflects real project status; don't let it drift
  from what's actually shipped.

<!-- BACKLOG.MD MCP GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.48.0 -->

<CRITICAL_INSTRUCTION>

## BACKLOG WORKFLOW INSTRUCTIONS

This project uses Backlog.md MCP for all task and project management activities.

**CRITICAL GUIDANCE**

- If your client supports MCP resources, read `backlog://workflow/overview` to understand when and how to use Backlog for this project.
- If your client only supports tools or the above request fails, call `backlog.get_backlog_instructions()` to load the tool-oriented overview. Use the `instruction` selector when you need `task-creation`, `task-execution`, or `task-finalization`.

- **First time working here?** Read the overview resource IMMEDIATELY to learn the workflow
- **Already familiar?** You should have the overview cached ("## Backlog.md Overview (MCP)")
- **When to read it**: BEFORE creating tasks, or when you're unsure whether to track work

These guides cover:
- Decision framework for when to create tasks
- Search-first workflow to avoid duplicates
- Links to detailed guides for task creation, execution, and finalization
- MCP tools reference

You MUST read the overview resource to understand the complete workflow. The information is NOT summarized here.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD MCP GUIDELINES END -->
