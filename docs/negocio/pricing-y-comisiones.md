# Pricing y comisiones — The Pub Market

Política formal de tarifas. Es la fuente de verdad de **cuánto cobra la plataforma y por qué**. Cambios a esta política se decanten aquí y se reflejan en [`modelo-financiero.md`](./modelo-financiero.md).

> Cifras de política con base en análisis ilustrativo; el mecanismo (no-custodia, quién paga Stripe) es **firme** y no negociable. No es asesoría legal/fiscal formal.

---

## 1. Estructura de comisión

| Tipo de producto | Application fee (take rate) | Razón |
|---|---|---|
| **Singles** | **9%** | Margen alto tolerable; es donde la plataforma aporta más valor (curación, condición, búsqueda, confianza). |
| **Producto sellado** (booster box, etc.) | **5%** | Mercado hipercompetitivo en precio; un fee alto saca de mercado frente a tiendas que venden sellado casi a costo. |

- **Take rate efectivo** = promedio ponderado **por GMV**, no por número de órdenes. Ej: 60% singles + 40% sellado → `0.60×9% + 0.40×5% = 7.4%`. Es el número que multiplica el GMV en [`modelo-financiero.md`](./modelo-financiero.md).
- **Fee mínimo por orden:** **$10-15 MXN**. Evita que cartas baratas dejen ingreso ridículo frente al costo cognitivo/operativo de procesar la orden. (Ej: una carta de $50 al 9% deja $4.50 — por debajo del piso; se cobra el mínimo.)

---

## 2. Quién paga la comisión de Stripe (decisión firme)

**Modelo: Stripe Connect con _direct charges_.**

- El **seller es el merchant of record** y **paga la comisión de Stripe** (~3.6% + $3 MXN, **verificar vigente**) sobre el cargo completo.
- La plataforma cobra su **application fee** por encima, que **no** vuelve a pasar por el descuento de Stripe → costo variable de la plataforma ≈ $0.
- El dinero entra a la cuenta del seller; Stripe deduce su fee de ahí; a la plataforma se le transfiere solo su application fee. **La plataforma nunca toca el principal.**

**Por qué direct charges y no destination charges:**
- Refuerza el argumento de **no-custodia** (la plataforma es claramente intermediario tecnológico, no procesador) → fuera de IFPE/Ley Fintech. Ver [`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md).
- Con *destination charges* la plataforma pagaría la comisión de Stripe y la absorbería contra su fee, aplastando el margen.

> 🚩 **Línea roja:** nunca *separate charges and transfers* ni cualquier esquema donde el dinero aterrice, aunque sea un instante, en una cuenta controlada por la plataforma. Ver [`tesis-de-negocio.md`](./tesis-de-negocio.md) §5.

---

## 3. Cómo se compara (contexto para sellers)

| Canal | Take total al seller | Neto al seller |
|---|---|---|
| The Pub Market (singles) | 9% fee + ~4% Stripe ≈ **13%** | **~87%** |
| TCGplayer | ~12-13% | ~87% |
| eBay | ~13% | ~87% |
| Mercado Libre | ~13-16% + cargos | <87% |
| Cardmarket (EU) | ~5% | ~95% |

El neto al seller (~87%) es **competitivo con TCGplayer/eBay** y mejor que Mercado Libre, con la ventaja de ser un canal curado y especializado. Cardmarket es más barato pero no opera en MX ni con esta curación. Ver [`analisis-competitivo.md`](./analisis-competitivo.md).

---

## 4. Cuándo y cómo ajustar

**Palancas disponibles (en orden de preferencia):**

1. **Bajar fee como retención**, no como adquisición. Tienes margen para bajar singles de 9% a 7% para retener un seller vetted valioso, sin tocar la estructura general. Úsalo selectivamente, no como tarifa general.
2. **No subir el fee para "ganar más".** Subir arriesga sellers y compradores; el negocio se hace con **GMV**, no con un punto extra de take. Ver [`modelo-financiero.md`](./modelo-financiero.md) §5.
3. **Ajustar el mínimo por orden** si el AOV real resulta mucho más bajo de lo asumido.
4. **Promociones de lanzamiento** (fee reducido temporal para primeros sellers) como incentivo de [`estrategia-sellers.md`](./estrategia-sellers.md) — siempre con fecha de fin explícita.

**Cuándo revisar esta política:**
- Al cargar datos reales de AOV y mix (puede mover el mínimo y el take efectivo objetivo).
- Si Stripe MX cambia su pricing (afecta el neto al seller y la competitividad).
- Al expandir a un nuevo TCG con dinámica de margen distinta.

---

## 5. Resumen operativo

- Singles **9%**, sellado **5%**, mínimo **$10-15 MXN/orden**.
- Seller paga Stripe (direct charges); plataforma cobra application fee; **cero custodia**.
- Neto al seller ~87% en singles: competitivo.
- El fee ya es bueno: **el trabajo es subir el GMV, no el take**.

---

*Relacionados: [`modelo-financiero.md`](./modelo-financiero.md) · [`metricas.md`](./metricas.md) · [`estrategia-sellers.md`](./estrategia-sellers.md) · [`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md).*
