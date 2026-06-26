# Modelo financiero — The Pub Market

Los **números**. Las definiciones y el vocabulario están en [`metricas.md`](./metricas.md); la política de tarifas en [`pricing-y-comisiones.md`](./pricing-y-comisiones.md). Este doc convierte ambos en proyecciones.

> ⚠️ **Todos los números son supuestos ilustrativos**, etiquetados como tales, para estructurar el razonamiento. **No** son proyecciones validadas. Se refinan con datos reales de The Pub Game Store (ventas TCG/mes, # clientes activos, ticket promedio, # de sellers candidatos). MXN salvo indicación.

---

## 1. Supuestos (ilustrativos — reemplazar con datos reales)

| Supuesto | Valor ilustrativo | Cómo validarlo |
|---|---|---|
| AOV (ticket promedio) | $400 MXN | Promedio de ventas reales de la tienda |
| Take rate singles | 9% | Decisión de política ([`pricing-y-comisiones.md`](./pricing-y-comisiones.md)) |
| Take rate sellado | 5% | Decisión de política |
| Mix de GMV (singles/sellado) | 60% / 40% | Composición real de ventas |
| **Take rate efectivo** | **7.4%** | `0.60×9% + 0.40×5%` |
| Comisión Stripe (la paga el seller) | ~3.6% + $3 MXN | **Verificar pricing Stripe MX vigente** |
| Costo fijo mensual | ~$500 MXN | Cloudflare + dominio + email + Turnstile |
| Costo variable por orden | ≈ $0 | Direct charges: Stripe lo paga el seller |
| Sueldo objetivo del operador | $40,000 MXN/mes | Costo de oportunidad de mercado |

---

## 2. Unit economics (una orden típica de singles)

```
Precio carta:              $400 MXN
─ Comisión Stripe (~3.6%+$3): ~$17   → la paga el SELLER (no tú)
─ Tu application fee (9%):    $36     → tu ingreso bruto
Neto al seller:            ~$347      (~87%, competitivo vs ~87% en TCGplayer)
Tu costo variable:           ~$0
Tu contribución por orden:    $36
```

**Lectura:** cada orden te deja ~$36 a costo marginal ~0. El negocio no tiene problema de margen unitario; tiene que **acumular volumen**.

---

## 3. Proyección por escenario (mensual, estado estable de cada etapa)

Fórmula: `Ingreso = GMV × 7.4%`, `Utilidad neta = Ingreso − $500`, `Margen económico = (Utilidad − $40,000) / GMV`.

| Escenario | Órdenes/mes | GMV (MXN) | Ingreso | Utilidad neta | Margen/GMV | Tras sueldo |
|---|---|---|---|---|---|---|
| **Conservador** (arranque) | 200 | $80,000 | $5,920 | $5,420 | 6.8% | −$34,580 ⚠️ |
| **Base** (tracción) | 830 | $332,000 | $24,568 | $24,068 | 7.2% | −$15,932 |
| **Optimista** (escala) | 3,000 | $1,200,000 | $88,800 | $88,300 | 7.4% | +$48,300 ✅ |

> "Tras sueldo" = utilidad neta − $40,000 de sueldo del operador. Negativo no significa pérdida de caja (el negocio es rentable en caja desde el escenario conservador); significa que **aún no paga un sueldo de mercado completo**. Es el termómetro de viabilidad económica real.

---

## 4. Los dos break-even

- **Break-even de caja** (ingreso = costo fijo): `$500 / ($400 × 7.4%) ≈ 17 órdenes/mes`. **Trivial.** El negocio no quiebra; sobrevive con casi nada.
- **Break-even de sueldo** (utilidad = sueldo objetivo): `($40,000 + $500) / 7.4% ≈ $547,000 MXN/mes de GMV`, o **~1,370 órdenes/mes** a AOV $400. **Este es el objetivo real**: el GMV donde el negocio te paga un sueldo digno además de existir.

```
GMV de break-even de sueldo = (sueldo + costo fijo) / take rate efectivo
                            = ($40,000 + $500) / 0.074
                            ≈ $547,000 MXN/mes
```

---

## 5. Sensibilidad (qué mueve la aguja)

| Palanca | Efecto | Comentario |
|---|---|---|
| **↑ GMV** | Lineal y directo | El único driver que importa de verdad. Foco #1. |
| **↑ Take efectivo** (más mix singles, o subir fee) | Lineal sobre ingreso | Limitado: subir fee arriesga sellers; el mix depende del comportamiento. |
| **↑ AOV** | Menos órdenes para el mismo GMV | Empujar bundles, sellado, clientes de mayor valor. |
| **↓ Costo fijo** | Marginal | Ya es ~0; no es palanca. |
| **↓ Sueldo asumido** | Cambia solo el break-even de sueldo | Decisión personal, no del negocio. |

**Conclusión:** el modelo es robusto en márgenes y frágil en volumen. Toda la energía de negocio va a **GMV** (ver [`go-to-market.md`](./go-to-market.md) y [`estrategia-sellers.md`](./estrategia-sellers.md)).

---

## 6. Notas para el inversionista

- El negocio es **rentable en caja casi de inmediato**; el capital no se necesita para sobrevivir, solo para **acelerar el GMV** (ver [`business-plan.md`](./business-plan.md) §Capital).
- El margen "sobre ingreso" (~99% en escala) es real pero **engañoso** — refleja que la infra es casi gratis, no poder de fijación de precios. El número honesto es el **margen sobre GMV (~7%)** y, tras sueldo, el **margen económico**.
- El retorno para el inversionista proviene de **flujo de caja y del valor del ecosistema combinado**, no de un múltiplo de salida (ver [`tesis-de-negocio.md`](./tesis-de-negocio.md) §4).

---

## 7. Pendientes para aterrizar el modelo

1. Cargar ventas reales de The Pub Game Store (12 meses) → AOV, mix, estacionalidad reales.
2. Verificar pricing y disponibilidad de Stripe Connect MX (*direct charges* + application fee + payout).
3. Dimensionar la comunidad (clientes activos) → estimar órdenes/mes alcanzables bottom-up.
4. Definir el sueldo objetivo real del operador.
5. Construir una hoja viva (o script) que tome estos inputs y regenere las tablas 3-4 automáticamente.

---

*Relacionados: [`metricas.md`](./metricas.md) · [`pricing-y-comisiones.md`](./pricing-y-comisiones.md) · [`business-plan.md`](./business-plan.md).*
