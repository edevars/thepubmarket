# Contexto del proyecto

The Pub Market es un marketplace curado de Trading Card Games enfocado en México, comenzando con la venta de singles y producto cerrado como booster box. Los principales TCG que maneja son Yu-Gi-Oh!, Magic: The Gathering (MTG), Pokémon TCG, One Piece Card Game, Disney Lorcana, Riftbound TCG. Está vinculado a The Pub Game Store, un negocio físico (restaurante casual + tienda TCG/retail) en Ciudad de México que ya atiende a una comunidad de jugadores de Magic, Yu-Gi-Oh!, Riftbound, MTG y Dungeons and dragons: D&D.

# Modelo de negocio

- RESTRICCIÓN CRÍTICA: la plataforma NO custodia fondos en ningún momento. El dinero fluye directamente entre comprador y vendedor a través del procesador de pagos. Esto es deliberado para mantenerse fuera de los requisitos de IFPE de la Ley Fintech mexicana. Cualquier propuesta técnica o de producto debe respetar esta restricción.
- Modelo store-first con vendedores por invitación (vetted sellers): The Pub Game Store es el vendedor ancla, y se suman sellers adicionales solo por invitación, conocidos directamente por The Pub Game Store y con alta reputación. No es un marketplace abierto ni de auto-registro.
- Como hay múltiples sellers liquidando fondos, la restricción de no custodia es crítica desde el día uno: usar Stripe Connect con direct/destination charges y application fee, de modo que el dinero nunca pase por una cuenta controlada por la plataforma.
- Cada seller es una cuenta conectada (Connect account) con su propio onboarding, payout y obligaciones fiscales propias. The Pub Market solo cobra su comisión vía application fee.
- Mercado inicial: México. Producto inicial: singles de MTG.

## Stack recomendado — The Pub Market sobre Cloudflare

### Compute y API
- Cloudflare Workers + Hono — backend, API del marketplace
- Workflows — procesos durables con reintentos (flujo de orden post-pago)

### Datos
- D1 — base transaccional principal (vendedores, inventario, órdenes, usuarios)
- KV — sesiones, cache de catálogo, feature flags
- R2 — imágenes de cartas y assets (sin costo de egress)
- Durable Objects — reserva de inventario para evitar doble compra del mismo single

### Frontend
- Cloudflare Pages + Next.js — sitio bilingüe, CI/CD y previews por rama

### Pagos
- Stripe Connect o Mercado Pago — webhooks recibidos en Workers, modelo sin custodia de fondos (application fee)

### IA
- Workers AI — labeling de imágenes y detección de condición de cartas
- Vectorize — búsqueda por similitud y recomendaciones

### Búsqueda
- D1 + índices al inicio; servicio de búsqueda externo cuando crezca el catálogo (única pieza probable fuera del ecosistema)

### Seguridad
- Cloudflare Access / Zero Trust — paneles de admin y portal de vendedores
- Turnstile — anti-bot en registro y checkout
- WAF + rate limiting — incluidos

# Cómo quiero que me ayudes

- Sé directo y técnico. Asume nivel senior.
- Cuando propongas arquitectura o features, considera el costo operativo y la carga de mantenimiento para una sola persona.
- Señala siempre cualquier implicación regulatoria (Ley Fintech, custodia de fondos, CNBV) que toque una decisión.
- Para temas legales o fiscales en México, dame el análisis pero recuérdame que no es asesoría legal formal.
- Responde en español por defecto; usa inglés para términos técnicos cuando sea natural.