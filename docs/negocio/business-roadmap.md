# Roadmap comercial — The Pub Market

Roadmap de **negocio**: en qué orden se construye tracción, qué hito comercial define cada etapa y qué objetivos (GMV, sellers, compradores) la cierran. Es el complemento de negocio del [`../../ROADMAP.md`](../../ROADMAP.md) técnico — no lo repite; lo traduce a metas comerciales.

> Objetivos en **MXN, ilustrativos**, a recalibrar con datos reales de The Pub Game Store. Las etapas comerciales se montan sobre las fases técnicas; abajo se mapean.

---

## Mapeo técnico ↔ comercial

| Fase técnica ([`ROADMAP.md`](../../ROADMAP.md)) | Etapa comercial (este doc) |
|---|---|
| Fase 0 — Fundaciones ✅ | (sin actividad comercial) |
| Fase 1 — Catálogo, vendedor único | **E1 — Validación de catálogo** |
| Fase 2 — Núcleo transaccional | **E2 — Primera venta real** |
| Fase 3 — Onboarding de sellers | **E3 — Marketplace multi-seller** |
| Fase 4 — Operación y confianza | **E4 — Tracción y recurrencia** |
| Fase 5 — Escala selectiva | **E5 — Expansión** |

---

## E1 — Validación de catálogo
**Hito:** el catálogo real de The Pub Game Store está online y la comunidad lo usa para descubrir inventario (aún sin checkout).

- **Objetivo comercial:** validar que la gente *busca y encuentra* lo que quiere. Medir búsquedas, items vistos, tasa de "sin resultados".
- **Acción de negocio:** catalogar el inventario MTG real de la tienda; comunicar a la comunidad que el catálogo existe ("ve nuestro inventario online").
- **Métricas de cierre:** catálogo con profundidad creíble (objetivo ilustrativo: ≥500-1,000 singles únicos), tráfico inicial de la comunidad, lista de "más buscado sin stock" para guiar inventario.
- **KPIs:** profundidad de catálogo, tasa de fill, sesiones. Ver [`metricas.md`](./metricas.md).

## E2 — Primera venta real
**Hito:** transacción de extremo a extremo confiable. The Pub Game Store vende online con pago real, sin custodia.

- **Objetivo comercial:** **probar el flujo de dinero** y la disposición a pagar online. Es el hito más importante del roadmap.
- **Acción de negocio:** lanzar checkout a la comunidad; empujar las primeras ventas con inventario atractivo y precios competitivos; recoger fricción del comprador.
- **Métricas de cierre (ilustrativas):** primeras ~50-100 órdenes reales; tasa de conversión medible; AOV inicial establecido; cero incidentes de custodia/regulatorios.
- **KPIs:** GMV inicial, conversión, AOV, disputas/reembolsos.

## E3 — Marketplace multi-seller
**Hito:** deja de ser tienda única. 3-5 sellers vetted vendiendo, cada uno con su Connect account.

- **Objetivo comercial:** demostrar que el modelo de **dos lados** funciona y que la oferta crece sin abrir el registro.
- **Acción de negocio:** ejecutar [`estrategia-sellers.md`](./estrategia-sellers.md): identificar, invitar, vettar y onboardear los primeros sellers; definir términos comerciales; gestionar que el catálogo gane profundidad y variedad.
- **Métricas de cierre (ilustrativas):** 3-5 sellers activos; el GMV de no-ancla empieza a ser visible (objetivo: ≥15-20% del GMV total); profundidad de catálogo crece notablemente.
- **KPIs:** sellers activos, **concentración de GMV** (vigilar dependencia del ancla), profundidad de catálogo.

## E4 — Tracción y recurrencia
**Hito:** el marketplace es usable de verdad (órdenes, envíos, devoluciones, soporte) y los compradores **vuelven**.

- **Objetivo comercial:** construir **recurrencia** (el motor que sostiene el GMV) y subir el GMV hacia el break-even de sueldo.
- **Acción de negocio:** pulir experiencia post-venta; activar GTM de recurrencia (ver [`go-to-market.md`](./go-to-market.md)); empezar a medir CAC/LTV; primeras pruebas de adquisición pagada *solo* si LTV lo justifica.
- **Métricas de cierre (ilustrativas):** GMV cruzando ~$300-500K MXN/mes en trayectoria a ~$550K (break-even de sueldo); compradores recurrentes >X% (definir baseline en E2-E3); concentración de GMV bajando.
- **KPIs:** GMV, compradores recurrentes, take rate efectivo, CAC vs LTV, margen económico.

## E5 — Expansión
**Hito:** el flujo de MTG está pulido y rentable; se replica a más TCG y/o se optimiza el motor.

- **Objetivo comercial:** crecer GMV expandiendo catálogo (otros TCG: Pokémon, One Piece, Lorcana, etc.) y profundizando sellers, sin romper la tesis.
- **Acción de negocio:** abrir un nuevo TCG **solo** cuando MTG esté pulido; sumar sellers vetted especializados; evaluar (no ejecutar por impulso) palancas de mayor alcance.
- **Guardarraíl:** revisar [`tesis-de-negocio.md`](./tesis-de-negocio.md) §5 antes de cualquier expansión que toque las restricciones duras (abrir sellers, salir de MX, estructura/nómina).
- **KPIs:** GMV total y por TCG, mix de sellado vs singles (afecta take efectivo), margen económico.

---

## Principios del roadmap comercial

1. **Llegar a la venta real rápido** (E2 es el corazón). Todo antes es preparación; todo después es crecimiento.
2. **Oferta vía invitación, nunca apertura.** Si la oferta es el cuello de botella, invita más sellers vetted.
3. **No gastar en adquisición hasta entender LTV.** La comunidad física es CAC ≈ $0; explótala primero.
4. **El GMV es el rey.** El fee ya es bueno; el trabajo es subir el volumen sin inflar costos.
5. **Disciplina sobre crecimiento.** Expandir solo cuando lo actual esté pulido y sin romper la tesis.

---

*Relacionados: [`accionables.md`](./accionables.md) (el qué-hacer-ahora), [`modelo-financiero.md`](./modelo-financiero.md) (los números), [`metricas.md`](./metricas.md) (qué medir).*
