# Estrategia de sellers — The Pub Market

Cómo se consigue, vetta, onboardea y retiene la **oferta**. En un marketplace de dos lados, la oferta vetted es el cuello de botella del GMV — y la curación es el foso. Este doc gobierna ese lado del mercado.

> **Restricción dura:** sellers **por invitación, vetted, sin auto-registro**. No es marketplace abierto. Romper esto rompe la tesis ([`tesis-de-negocio.md`](./tesis-de-negocio.md) §5).

---

## 1. Filosofía

- **Curación > volumen de oferta.** Cada seller es una extensión de la marca; un mal seller daña la confianza de *toda* la plataforma. Pocos sellers excelentes valen más que muchos mediocres.
- **The Pub Game Store es el ancla.** Es el seller de referencia y el que garantiza liquidez. Los demás se suman alrededor, no lo reemplazan.
- **Crecer la oferta = invitar más vetted, nunca abrir el registro.** Si la oferta limita el GMV, la respuesta es ampliar la lista de invitación, no las puertas.

---

## 2. Perfil del seller ideal

- Vendedor de TCG **conocido y de alta reputación** (tienda física, vendedor establecido en la comunidad, organizador de eventos).
- Inventario real y profundo en los TCG soportados (MTG primero).
- Capacidad y disciplina operativa: envía a tiempo, describe condición con honestidad, responde.
- Reputación verificable en la comunidad de CDMX / online.
- Alineado con el estándar de calidad y confianza de The Pub.

**Anti-perfil (no invitar):** revendedores oportunistas sin historial, inventario dudoso, mala reputación de envío/condición, quien vea la plataforma solo como canal de descarga de stock muerto.

---

## 3. Criterios de vetting (checklist)

Antes de invitar/aprobar un seller, verificar:

1. **Reputación** — referencias en la comunidad, historial en otros canales (grupos, ML, eventos), sin señales de fraude.
2. **Inventario** — profundidad y calidad real; aporta variedad o profundidad que el catálogo necesita.
3. **Capacidad operativa** — puede cumplir tiempos de envío y estándar de empaque/condición.
4. **Identidad y fiscal** — puede completar el onboarding de Stripe Connect (KYC) y tiene situación fiscal en regla (es responsable de sus obligaciones — ver [`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md)).
5. **Alineación** — entiende y acepta el modelo (no-custodia, fees, estándar de calidad, términos).

---

## 4. Onboarding comercial (no técnico)

> El onboarding técnico (Connect, KYC, portal) vive en [`../../ROADMAP.md`](../../ROADMAP.md) Fase 3. Aquí, lo comercial:

1. **Invitación** — contacto directo, explicación del modelo y la propuesta de valor para el seller.
2. **Acuerdo de términos** — fees aplicables, estándar de calidad/envío, política de devoluciones, expectativas. Por escrito.
3. **Alta de catálogo** — apoyar la carga inicial de inventario (catalogación, fotos si aplica). Es la barrera práctica de arranque; reducir fricción aquí acelera el GMV.
4. **Primera venta acompañada** — seguir de cerca las primeras órdenes para asegurar buena experiencia y corregir temprano.

**Incentivos de arranque (opcionales, con fecha de fin):** fee reducido temporal, apoyo de fotografía/catalogación, destaque en el catálogo. Ver palancas en [`pricing-y-comisiones.md`](./pricing-y-comisiones.md) §4.

---

## 5. Términos comerciales (marco)

- **Comisión:** según [`pricing-y-comisiones.md`](./pricing-y-comisiones.md) (9% singles / 5% sellado / mínimo por orden).
- **Pagos:** directo a la cuenta Connect del seller (no-custodia); el seller paga la comisión de Stripe.
- **Estándar de calidad:** descripción honesta de condición, tiempos de envío comprometidos, empaque adecuado.
- **Obligaciones fiscales:** del seller. La plataforma cobra una comisión de servicio tecnológico. (Vigilar retenciones de plataforma — Art. 18-J LIVA — en [`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md).)
- **Causales de baja:** incumplimiento reiterado de envío/condición, disputas excesivas, fraude. La curación se mantiene **expulsando**, no solo invitando.

---

## 6. Gestión de concentración de GMV

El riesgo estructural del arranque: **The Pub Game Store será ~90-100% del GMV al inicio** → es una tienda con extras, no un marketplace.

- **No es malo al inicio** (es la fuente de liquidez), pero hay que **vigilarlo** y reducirlo en E3-E4 del [`business-roadmap.md`](./business-roadmap.md).
- **Métrica:** % de GMV del top seller. Objetivo de diversificación: que el no-ancla llegue a ≥15-20% en E3 y siga subiendo.
- **Acción:** sumar sellers que aporten **profundidad/variedad complementaria** (no que compitan de frente con el ancla en lo mismo), para que cada uno expanda el catálogo total.

---

## 7. Retención y expansión de sellers

- **Retención:** pagos confiables, flujo de ventas real (depende del GMV/demanda), buena herramienta de gestión, y fee competitivo. Un seller se queda si vende; vuelve al punto de que **el trabajo es traer compradores** (ver [`go-to-market.md`](./go-to-market.md)).
- **Palanca de retención:** fee reducido selectivo para sellers valiosos (no general).
- **Expansión:** a medida que se abren nuevos TCG (E5), invitar sellers especializados en cada uno. Crecer la oferta es siempre **vía invitación calibrada a la demanda**, no apertura.

---

## 8. Cadencia operativa

- **Mantener una lista viva de sellers candidatos** (priorizada por encaje y por hueco de catálogo que llenan).
- **Invitar al ritmo que la demanda absorbe.** Sumar oferta sin demanda frustra al seller (no vende) y no mueve el GMV.
- **Revisar desempeño de sellers periódicamente** (cumplimiento, disputas, contribución a GMV).

---

*Relacionados: [`go-to-market.md`](./go-to-market.md) · [`pricing-y-comisiones.md`](./pricing-y-comisiones.md) · [`metricas.md`](./metricas.md) (concentración de GMV, sellers activos) · [`business-roadmap.md`](./business-roadmap.md) (E3).*
