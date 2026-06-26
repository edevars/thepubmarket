# Plan de negocio — The Pub Market

Documento completo y presentable. Para el pitch de una página ver [`one-pager.md`](./one-pager.md); para la lógica estratégica de fondo ver [`tesis-de-negocio.md`](./tesis-de-negocio.md).

> Números **ilustrativos**, etiquetados como tales, a refinar con datos reales de The Pub Game Store. MXN salvo indicación. No es asesoría legal/fiscal formal.

---

## 1. Resumen ejecutivo

The Pub Market es un **marketplace curado de Trading Card Games para México**, anclado en **The Pub Game Store** (restaurante casual + tienda TCG/retail en CDMX, con comunidad activa de jugadores). Vende **singles y producto sellado**; arranca con **MTG singles**.

El mercado mexicano de TCG carece de un canal confiable y especializado: el comercio vive en grupos de Facebook/WhatsApp (sin confianza ni protección), Mercado Libre (no diseñado para singles) y tiendas sin presencia digital. The Pub Market ocupa ese hueco con un catálogo estructurado, pagos seguros y **vendedores invitados y verificados**.

El modelo es **comisión sobre ventas sin custodia de fondos** (Stripe Connect *direct charges* + application fee), lo que mantiene a la plataforma fuera de la Ley Fintech y a costo de operación cercano a cero (stack Cloudflare, un operador). La ventaja decisiva: The Pub Game Store aporta **liquidez y comunidad desde el día uno**, resolviendo el problema clásico del marketplace (CAC ≈ $0, oferta inmediata).

No es un caso venture-scale; es **infraestructura estratégica del ecosistema The Pub** con asimetría riesgo/recompensa favorable.

---

## 2. Problema y oportunidad

### El problema
Comprar y vender cartas de TCG en México es ineficiente y riesgoso:
- **Grupos de Facebook/WhatsApp:** sin escrow, sin verificación, fraude frecuente, descubrimiento de precio caótico, sin estructura de condición/edición/idioma.
- **Mercado Libre / eBay:** no diseñados para singles; mala taxonomía de cartas, comisiones altas (~13-16%), experiencia genérica.
- **Tiendas locales (LGS):** inventario real pero **sin presencia digital** ni alcance más allá del mostrador.

No existe un **TCGplayer/Cardmarket mexicano**: especializado, confiable, con catálogo estructurado.

### La oportunidad
- TCG en México crece (MTG, Pokémon, One Piece con comunidades activas y en expansión).
- The Pub Game Store ya capta parte de esa demanda **offline**; digitalizarla y abrirla a otros vendedores verificados captura valor hoy desperdiciado.
- Ser el **primer canal curado y confiable** crea ventaja de marca local difícil de desalojar.

---

## 3. Propuesta de valor

**Para compradores:** catálogo estructurado y confiable (edición, idioma, condición, foil), vendedores verificados, pagos seguros, experiencia bilingüe, respaldo de una marca local reconocida.

**Para vendedores (vetted):** acceso a una base de compradores existente sin montar su propia tienda online, pagos y payouts gestionados por Stripe, exposición bajo una marca de confianza, sin custodia (cobran directo).

**Para el ecosistema The Pub:** extiende el alcance de la tienda más allá del tráfico físico, agrega una capa de ingreso de alto margen sobre ventas de terceros, y crea un foso digital frente a otros LGS.

---

## 4. Modelo de negocio

- **Fuente de ingreso:** comisión (application fee) sobre cada venta. ~9% singles, ~5% sellado; take rate efectivo ~7%. Detalle en [`pricing-y-comisiones.md`](./pricing-y-comisiones.md).
- **Sin custodia de fondos:** Stripe Connect *direct charges*. El vendedor es merchant of record, paga la comisión de Stripe; el dinero va directo comprador → vendedor; la plataforma retiene solo su application fee. Nunca toca el principal.
- **Estructura de costos:** infra Cloudflare (~$300-800 MXN/mes), dominio, email transaccional, Turnstile. Sin inventario propio nuevo, sin nómina al inicio. Costo variable por orden ≈ $0.
- **Unidad económica:** ver [`modelo-financiero.md`](./modelo-financiero.md). El negocio es rentable en caja con docenas de órdenes/mes; el reto no es el margen sino el **GMV**.

---

## 5. Mercado (TAM / SAM / SOM)

> Marco ilustrativo — **pendiente de dimensionar con datos reales** (ventas de la tienda, tamaño de la comunidad, encuestas a jugadores). Las cifras son placeholders para estructurar el análisis, no estimaciones validadas.

- **TAM** — Gasto anual total en TCG en México (singles + sellado, todos los TCG, todos los canales). *[Dimensionar.]*
- **SAM** — Porción direccionable: compradores/vendedores de TCG dispuestos a transaccionar online de forma curada, en los TCG soportados, en zonas con logística viable (arranque CDMX/zona metropolitana). *[Dimensionar.]*
- **SOM** — Lo realmente capturable a 12-24 meses: comunidad de The Pub Game Store + red de sellers vetted invitables + su alcance. **Esta es la cifra que importa al arranque**, y se estima desde la base real de la tienda, no top-down.

**Enfoque correcto:** bottom-up desde el GMV actual de The Pub Game Store y su comunidad, no top-down desde el TAM. Ver [`modelo-financiero.md`](./modelo-financiero.md) §Supuestos.

---

## 6. Ventaja competitiva

1. **Liquidez y comunidad día uno** (seller ancla) — resuelve el problema huevo/gallina.
2. **CAC ≈ $0 al arranque** — la comunidad física ya existe.
3. **Curación como foso** — confianza que un marketplace abierto no replica.
4. **No-custodia** — barrera regulatoria que frena a competidores que custodian.
5. **Costo casi nulo** — sobrevive con poco GMV; aguanta más que competidores con estructura pesada.

Panorama y posicionamiento detallado en [`analisis-competitivo.md`](./analisis-competitivo.md).

---

## 7. Go-to-market (resumen)

Lanzamiento apalancando la comunidad física de The Pub (eventos, torneos, señalización en tienda, boca a boca), seguido de incorporación gradual de 3-5 sellers vetted y construcción de recurrencia en MTG antes de cualquier gasto de adquisición pagada. Detalle en [`go-to-market.md`](./go-to-market.md) y secuencia en [`business-roadmap.md`](./business-roadmap.md).

---

## 8. Resumen financiero

Ver [`modelo-financiero.md`](./modelo-financiero.md) para escenarios completos. En síntesis (ilustrativo):

| Etapa | GMV/mes | Ingreso plataforma/mes | Margen económico (tras sueldo) |
|---|---|---|---|
| Arranque | $80K | ~$5.9K | negativo (subsidiado por tiempo) |
| Tracción | $332K | ~$24.6K | cercano a break-even de sueldo |
| Escala | $1.2M | ~$88.8K | positivo |

**Break-even de caja:** trivial (~30 órdenes/mes cubren la infra). **Break-even de sueldo** (~$40K MXN/mes para el operador): requiere cruzar **~$550K MXN/mes de GMV**. El driver del negocio es el **GMV**, no el fee.

---

## 9. Capital — necesidades y uso de fondos ("el ask")

**The Pub Market no requiere capital de operación significativo.** Infra ~$300-800 MXN/mes, sin custodia, sin inventario nuevo. No es un caso de venture capital.

El encaje correcto es un **socio estratégico / inversionista ángel del ecosistema The Pub** que aporte capital ligero para **acelerar**, no para sostener operación. Uso de fondos propuesto (ilustrativo, ajustar al monto real):

| Destino | Para qué | Por qué acelera |
|---|---|---|
| **Desarrollo / tiempo** | Liberar tiempo del operador o contratar dev puntual para llegar antes a Fase 2 transaccional | Reduce el costo de oportunidad, principal riesgo del proyecto |
| **Onboarding de sellers** | Incentivos de arranque, soporte de catalogación, fotografía de inventario | Acelera la oferta vetted, el cuello de botella del GMV |
| **Marketing de lanzamiento** | Eventos, contenido, activaciones en la comunidad TCG de CDMX | Convierte la comunidad física en compradores recurrentes online |

**Contraparte:** participación en el valor combinado **tienda + plataforma**, no solo en la plataforma (cuyo valor de salida es deliberadamente acotado — ver [`tesis-de-negocio.md`](./tesis-de-negocio.md)). El retorno esperado para el inversionista es vía **flujo de caja y fortalecimiento del ecosistema**, no vía exit.

> Honestidad ante el inversionista: este proyecto **no necesita su dinero para existir** — funciona bootstrapped. El capital solo compra velocidad. Quien invierta debe entender que apuesta a una asimetría favorable de retorno sobre capital, no a un múltiplo de salida.

---

## 10. Riesgos principales

Detalle y mitigaciones en [`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md). Los críticos:

- **Concentración en el seller ancla** (es tienda con extras, no marketplace, hasta diversificar).
- **GMV insuficiente** (el techo real; mitiga apalancando la comunidad antes de gastar en adquisición).
- **Riesgo de persona clave** (un operador).
- **Regulatorio** (cualquier deriva hacia custodia de fondos; retenciones de IVA/ISR a plataformas, Art. 18-J LIVA).
- **Logística/confianza** (envíos, condición disputada, devoluciones).

---

## 11. Supuestos clave (a validar)

- Existe demanda online suficiente en la comunidad de The Pub para sostener GMV creciente.
- Hay sellers de alta reputación invitables que quieren este canal.
- La logística de envío de cartas en MX es manejable a costo y confianza aceptables.
- Stripe Connect opera en MX con *direct charges* + application fee bajo los términos asumidos (**verificar pricing y disponibilidad vigentes**).
- El take rate ~7% es aceptable para sellers frente a alternativas (~13% ML/eBay).

---

*Relacionados: todos los docs de [`./README.md`](./README.md). Última revisión de estructura: junio 2026.*
