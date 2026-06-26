# Riesgos y cumplimiento — The Pub Market

Qué puede salir mal y el marco regulatorio, en lenguaje de negocio. Las restricciones técnicas derivadas viven en [`../../CLAUDE.md`](../../CLAUDE.md).

> ⚠️ **No es asesoría legal ni fiscal formal.** Es análisis para operar con criterio y para saber *cuándo* consultar a un contador/abogado. Toda decisión con implicación regulatoria debe validarse con un profesional.

---

## 1. Riesgos de negocio

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| **Concentración en el seller ancla** | Alto | Alta (al inicio) | Es inevitable al arranque; diversificar oferta vetted en E3-E4 ([`business-roadmap.md`](./business-roadmap.md)). Vigilar % GMV del top seller. |
| **GMV insuficiente** (el techo real) | Alto | Media | Apalancar comunidad física (CAC≈0) antes de gastar; profundidad de catálogo; recurrencia. El negocio sobrevive en caja con poco, pero no paga sueldo sin GMV. |
| **Riesgo de persona clave** (un operador) | Alto | Media | Mantener todo simple, documentado (esta suite + repo) y de bajo mantenimiento; no crear dependencias que solo una persona sostenga frágilmente. |
| **Logística / disputas de condición** | Medio | Media | Estándar de envío y condición a sellers; post-venta impecable; política de devoluciones clara (refund vía Stripe, sin custodia). |
| **Dependencia de The Pub Game Store** | Alto | Baja | Si el ancla cierra/se vende, la tesis pierde su pilar. Diversificar sellers reduce (no elimina) la exposición. |
| **Dependencia de proveedores** (Stripe, Cloudflare) | Medio | Baja | Riesgo aceptado a cambio de simplicidad; vigilar cambios de pricing/términos de Stripe MX. |
| **Fraude de sellers/compradores** | Medio | Media | Vetting estricto ([`estrategia-sellers.md`](./estrategia-sellers.md)), Turnstile anti-bot, capacidad de expulsar sellers. |
| **Costo de oportunidad del tiempo** | Alto | — | El riesgo más real (ver [`tesis-de-negocio.md`](./tesis-de-negocio.md) §4). Disciplina de mantenibilidad por una persona. |

---

## 2. Marco regulatorio mexicano

### a. Ley Fintech / no custodia de fondos (la restricción madre)
- **El riesgo:** custodiar, retener o redirigir fondos —aunque sea momentáneamente— puede clasificar a la plataforma como **Institución de Fondos de Pago Electrónico (IFPE)** bajo la **Ley Fintech**, sujeta a autorización y supervisión de **CNBV/Banxico**. Esto sería letal para un operador único.
- **La mitigación (de diseño):** **Stripe Connect _direct charges_ + application fee.** El dinero va directo comprador → seller; la plataforma solo cobra comisión y **nunca toca el principal**. Ver [`pricing-y-comisiones.md`](./pricing-y-comisiones.md) §2.
- **🚩 Línea roja:** cualquier diseño que implique que la plataforma toque fondos. Si una decisión lo implica, **detente y señálalo** antes de avanzar ([`tesis-de-negocio.md`](./tesis-de-negocio.md) §5).

### b. Retención de IVA/ISR por plataformas tecnológicas (Art. 18-J LIVA)
- **El punto:** las plataformas digitales de intermediación en México pueden estar obligadas a **retener IVA e ISR** sobre las ventas de sus vendedores personas físicas y a enterarlas al SAT, **aunque no custodien fondos**. Es una obligación de **intermediación**, distinta de la custodia.
- **Por qué importa:** este es el punto regulatorio que **sí podría tocar a The Pub Market** pese al modelo de no-custodia. Con *direct charges* el flujo de dinero no pasa por la plataforma, lo que complica la mecánica de retención — hay que resolver **cómo** se cumpliría (¿lo maneja el seller?, ¿se requiere ajuste de flujo?, ¿aplica el régimen?).
- **Acción:** **consultar a un contador/fiscalista** antes de operar con sellers personas físicas a escala. No asumir que no-custodia = sin obligaciones de plataforma. Documentar en términos quién es responsable fiscal (el seller) y cómo se cumple cualquier retención aplicable.

### c. Obligaciones fiscales de los sellers
- Cada seller es responsable de sus propias obligaciones (Stripe Connect Express gestiona KYC). La plataforma cobra una **comisión de servicio tecnológico**; los términos deben dejar explícito que **el seller es el vendedor y responsable fiscal**.

### d. Protección al consumidor (PROFECO)
- Marketplace con consumidores finales → aplican normas de protección al consumidor (información clara de producto/precio, política de devoluciones, no publicidad engañosa). Mantener términos y políticas claras y cumplibles.

### e. Datos personales (LFPDPPP)
- Manejo de datos de usuarios → aviso de privacidad y cumplimiento de la ley de protección de datos. Necesario antes de captar usuarios.

---

## 3. Checklist regulatorio antes de transaccionar (E2)

Antes de la primera venta real:

- [ ] Confirmar con contador/fiscalista el tratamiento de **retención IVA/ISR (Art. 18-J)** bajo direct charges.
- [ ] Términos y condiciones que dejen explícito: seller = vendedor y responsable fiscal; plataforma = comisión de servicio; no-custodia.
- [ ] Aviso de privacidad (LFPDPPP).
- [ ] Política de devoluciones cumplible (refund vía Stripe, sin custodia).
- [ ] Verificar disponibilidad y términos vigentes de Stripe Connect MX.
- [ ] Validar con abogado que el modelo de no-custodia está correctamente implementado para quedar fuera de IFPE.

---

## 4. Postura general

- **Conservadora en regulatorio.** Ante la duda entre crecer y cumplir, cumplir. Un problema con CNBV/SAT cuesta infinitamente más que el GMV que se sacrifica por prudencia.
- **El diseño ya mitiga lo grande** (no-custodia evita IFPE). El frente abierto a resolver con profesional es **fiscal de intermediación** (18-J), no custodia.
- **Marcar siempre** la implicación regulatoria de cada decisión nueva (regla de [`../../CLAUDE.md`](../../CLAUDE.md)).

---

*Relacionados: [`tesis-de-negocio.md`](./tesis-de-negocio.md) (líneas rojas) · [`pricing-y-comisiones.md`](./pricing-y-comisiones.md) (mecánica no-custodia) · [`estrategia-sellers.md`](./estrategia-sellers.md) (responsabilidad fiscal del seller) · [`../../CLAUDE.md`](../../CLAUDE.md).*
