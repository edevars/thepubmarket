# Métricas — The Pub Market

Documento clave. Define el vocabulario económico y los KPIs del marketplace. Léelo antes de fijar tarifas, proyectar ingresos o decidir en qué métrica enfocar el producto.

Contexto del modelo (ver [`../../CLAUDE.md`](../../CLAUDE.md)): marketplace curado de TCG, store-first, sellers vetted, **sin custodia de fondos**. Pagos vía **Stripe Connect con direct charges + application fee**. The Pub Game Store es el seller ancla.

> **Relacionados:** [`modelo-financiero.md`](./modelo-financiero.md) (los números), [`pricing-y-comisiones.md`](./pricing-y-comisiones.md) (la política de fees), [`business-roadmap.md`](./business-roadmap.md) (los objetivos por etapa).

---

## 1. Glosario — términos económicos

| Término | Qué significa en The Pub Market |
|---|---|
| **GMV** (Gross Merchandise Value) | Valor total transaccionado en la plataforma en un periodo. **No es tu dinero** — es el dinero que pasó por la plataforma. Es la métrica madre del marketplace. |
| **Take rate** | El % del GMV que te quedas como plataforma (tu fee nominal: 9% singles, 5% sellado). |
| **Take rate efectivo** | El take rate *real* tras mezclar tarifas distintas, **ponderado por GMV** de cada tipo de producto. Es el número que de verdad multiplica tu GMV. Ej: `0.60×9% + 0.40×5% = 7.4%`. |
| **AOV** (Average Order Value) | Ticket promedio. `GMV ÷ número de órdenes`. |
| **Application fee** | Mecanismo de Stripe Connect con el que cobras tu comisión sin tocar el dinero del seller. Es tu take rate implementado en código. |
| **Direct charges** | Modo de Stripe donde el seller es el vendedor oficial y paga la comisión de Stripe; tú cobras tu application fee encima. Te mantiene **fuera del flujo de fondos** (crítico para no-custodia). |
| **Margen sobre ingreso** | De cada peso que *cobras de fee*, cuánto te queda tras costos. Alto (~90%+) y engañoso, porque Cloudflare es casi gratis. No lo uses para decidir. |
| **Margen sobre GMV** | De cada peso *transaccionado*, cuánto te queda. ≈ tu take rate efectivo. El número honesto. |
| **Margen económico** | El margen sobre GMV **después de restar tu sueldo**. El que decide si el negocio vale tu tiempo. |
| **Unit economics** | Rentabilidad de *una sola orden*. Si una orden no es rentable, escalar amplifica la pérdida. |
| **Break-even** | Punto de equilibrio: volumen donde ingresos igualan costos. Distingue break-even de *caja* (cubrir infra, trivial) del break-even de *sueldo* (cubrir tu salario objetivo). |
| **CAC** (Costo de Adquisición de Cliente) | Cuánto gastas en traer un comprador nuevo. Al inicio ≈ $0 por la comunidad física de The Pub. |
| **LTV** (Lifetime Value) | Cuánto te deja un comprador en fees a lo largo de su vida. Si `CAC > LTV`, cada cliente nuevo te empobrece. |

---

## 2. Las fórmulas

```
GMV                = AOV × órdenes/mes
Take rate efectivo = Σ (take_rate_i × % de GMV del tipo i)
Ingreso plataforma = GMV × take rate efectivo
Costo variable     ≈ 0   (con direct charges, el seller paga Stripe; Cloudflare por-request es ruido)
Costo fijo (F)     ≈ Cloudflare base + dominio + email + Turnstile  ≈ $300–800 MXN/mes
Utilidad neta      = Ingreso − F
Margen / ingreso   = Utilidad neta / Ingreso        (engañoso, ~90%+)
Margen / GMV       = Utilidad neta / GMV             (≈ take rate efectivo, el honesto)
Margen económico   = (Utilidad neta − tu sueldo) / GMV   (el que decide viabilidad)
```

**Clave del modelo direct charges:** el seller paga Stripe sobre el cargo completo, así que tu application fee **no** vuelve a pasar por el descuento de Stripe. Tu costo variable real es ~$0.

---

## 3. KPIs — qué vigilar y cada cuánto

### Diario / semanal (pulso)
- **GMV** — métrica madre; todo se deriva de aquí.
- **Órdenes** y **AOV** — GMV puede crecer por más órdenes *o* por ticket más alto; se atacan distinto.
- **Tasa de conversión** — búsquedas/visitas que terminan en compra. Baja = problema de precio, inventario o fricción en checkout.

### Mensual (monetización y salud)
- **Take rate efectivo** — vigila que no se erosione si el sellado (5%) crece más rápido que los singles (9%).
- **Ingreso neto y margen económico** — ingreso − costos − tu sueldo.
- **GMV de break-even de sueldo** — el GMV mensual necesario para pagarte el sueldo objetivo. Termómetro de viabilidad.

### Salud del marketplace (lo que mata o salva un negocio de dos lados)
- **Sellers activos** — vendedores con ≥1 venta en el mes. En modelo vetted es pequeño y crítico.
- **Concentración de GMV** — % del GMV que viene del top seller. Si es ~90% The Pub Game Store, es una tienda con extras, no un marketplace. No es malo al inicio, pero vigílalo.
- **Profundidad de catálogo** — SKUs/singles únicos en venta. "Tienen la carta que busco" es ~80% de la retención del comprador.
- **Tasa de fill / sin stock** — búsquedas que no encuentran la carta. Demanda que dejas ir.

### Retención y eficiencia (mediano plazo)
- **Compradores recurrentes** — % que vuelve a comprar. TCG es compra repetida; si no vuelven, es problema de experiencia, no de adquisición.
- **CAC vs LTV** — al inicio CAC ≈ $0 por la comunidad física. Mídelo y explótalo antes de pagar publicidad.

### Operación / riesgo
- **Tasa de disputas y reembolsos** — chargebacks de Stripe. En direct charges los absorbe el seller, pero ensucian la plataforma y, si suben, Stripe te marca.
- **Cumplimiento del seller** — % de órdenes enviadas a tiempo. Un mal seller daña *tu* marca.

---

## 4. Si tuvieras que memorizar 3

1. **GMV** — el tamaño real del negocio.
2. **Take rate efectivo** — cuánto de ese GMV es tuyo.
3. **Compradores recurrentes** — si el motor se sostiene solo o llenas una cubeta agujereada.

Todo lo demás son diagnósticos de por qué esos tres se mueven.

---

## 5. Referencia rápida de escenarios

Supuestos ilustrativos: AOV $400 MXN, take efectivo 7.4%, fijo ~$500 MXN/mes. (Refinar con datos reales de la tienda — ver [`modelo-financiero.md`](./modelo-financiero.md).)

| Etapa | Órdenes/mes | GMV (MXN) | Ingreso | Utilidad neta | Margen/GMV |
|---|---|---|---|---|---|
| Arranque | 200 | $80,000 | $5,920 | $5,520 | 6.9% |
| Objetivo | 830 | $332,000 | $24,568 | $24,068 | 7.2% |
| Escala | 3,000 | $1,200,000 | $88,800 | $88,000 | 7.3% |

**Advertencia:** estos márgenes ignoran el costo de tu tiempo. Con sueldo de mercado (~$40,000 MXN/mes), el negocio no te paga hasta cruzar ~$550K MXN/mes de GMV. **El fee no es el problema — el GMV sí.**

---

*Benchmarks de referencia del sector (take total al seller): TCGplayer ~12–13%, eBay ~13%, Cardmarket ~5%. Un seller en TCGplayer neta ~87%; ese es el techo psicológico al comparar. Ver [`analisis-competitivo.md`](./analisis-competitivo.md).*
