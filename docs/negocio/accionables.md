# Accionables — The Pub Market

El doc más operativo: **qué hacer ahora.** Destila el resto de la suite en acciones priorizadas, cada una con horizonte, dueño y definición de "hecho". Es una lista viva — actualízala al ejecutar.

> Dueño por defecto: **el operador** (tú). Horizontes desde hoy. Marca ✅ al cerrar y mueve lo nuevo que surja al backlog.

---

## Prioridad #0 — Antes que nada (desbloquean todo lo demás)

Estos no son negociables y bloquean decisiones grandes:

| Acción | Por qué | Hecho cuando |
|---|---|---|
| **Cargar datos reales de The Pub Game Store** (ventas TCG 12m, # clientes activos, AOV, mix singles/sellado) | Todo el [`modelo-financiero.md`](./modelo-financiero.md) y los objetivos del [`business-roadmap.md`](./business-roadmap.md) son placeholders hasta tenerlos | Las tablas del modelo usan números reales, no ilustrativos |
| **Consultar a contador/fiscalista sobre retención IVA/ISR (Art. 18-J)** bajo direct charges | Único frente regulatorio abierto; puede afectar el flujo ([`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md) §2b) | Tienes claridad escrita de cómo se cumple y quién retiene |
| **Verificar Stripe Connect MX** (disponibilidad, direct charges, application fee, payout, pricing vigente) | Sostiene el modelo de no-custodia y el take rate | Confirmado que el esquema asumido es operable en MX |

---

## 30 días — Fundación comercial

- [ ] **Definir el sueldo objetivo del operador** → fija el break-even de sueldo real ([`modelo-financiero.md`](./modelo-financiero.md) §4). *(Dueño: tú)*
- [ ] **Construir hoja/script vivo del modelo financiero** que tome inputs reales y regenere escenarios y break-even. *Hecho:* metes AOV/mix/órdenes y salen los 3 márgenes.
- [ ] **Redactar borrador de Términos y Condiciones** (seller = vendedor/responsable fiscal; plataforma = comisión; no-custodia) + **aviso de privacidad** (LFPDPPP). *Hecho:* borradores listos para revisión legal.
- [ ] **Listar sellers candidatos** priorizados por encaje y hueco de catálogo que llenan ([`estrategia-sellers.md`](./estrategia-sellers.md)). *Hecho:* lista viva con ≥5-10 nombres y notas de vetting.
- [ ] **Confirmar la política de pricing** (9%/5%/mínimo) contra datos reales de AOV. *Hecho:* política firmada en [`pricing-y-comisiones.md`](./pricing-y-comisiones.md).

## 60 días — Catálogo y validación (E1)

- [ ] **Catalogar el inventario MTG real** de The Pub Game Store en el sistema. *Hecho:* ≥500-1,000 singles únicos online.
- [ ] **Comunicar el catálogo a la comunidad** (tienda, eventos, grupos) y medir uso. *Hecho:* tráfico inicial medible + lista de "más buscado sin stock".
- [ ] **Definir el estándar de calidad/envío** que se exigirá a sellers. *Hecho:* documento de estándar para onboarding.
- [ ] **Cerrar revisión legal** de T&C, privacidad y modelo no-custodia. *Hecho:* visto bueno del abogado.

## 90 días — Camino a la primera venta (E2)

- [ ] **Preparar el lanzamiento de checkout** a la comunidad (plan de activación de [`go-to-market.md`](./go-to-market.md)). *Hecho:* plan de lanzamiento con canales CAC≈0 listo.
- [ ] **Completar el checklist regulatorio pre-transacción** ([`riesgos-y-cumplimiento.md`](./riesgos-y-cumplimiento.md) §3). *Hecho:* todas las casillas marcadas.
- [ ] **Empujar las primeras ventas reales** con inventario atractivo. *Hecho:* primeras ~50-100 órdenes; conversión y AOV reales medidos; cero incidentes de custodia.
- [ ] **Establecer el tablero de KPIs** ([`metricas.md`](./metricas.md)): GMV, órdenes, AOV, conversión, disputas. *Hecho:* puedes ver estos números semanalmente.

---

## Backlog priorizado (post-primera venta)

**Alto (E3 — multi-seller):**
- [ ] Invitar y onboardear los primeros 3-5 sellers vetted.
- [ ] Empezar a medir **concentración de GMV** y bajarla (objetivo: no-ancla ≥15-20%).
- [ ] Definir incentivos de arranque para sellers (con fecha de fin).

**Medio (E4 — tracción/recurrencia):**
- [ ] Activar palancas de recurrencia (restock/wishlist, contenido bilingüe).
- [ ] Empezar a medir **CAC vs LTV**.
- [ ] Pulir post-venta (envíos, devoluciones, incidencias).

**Bajo / condicional (E5 — expansión):**
- [ ] Evaluar segundo TCG (solo con MTG pulido).
- [ ] Evaluar adquisición pagada (solo con LTV probado).
- [ ] Revisar [`tesis-de-negocio.md`](./tesis-de-negocio.md) §5-6 antes de cualquier movimiento que toque las restricciones duras.

---

## Inversionista / socio (paralelo, opcional)

- [ ] Pulir [`one-pager.md`](./one-pager.md) y [`business-plan.md`](./business-plan.md) §Capital con números reales antes de cualquier conversación.
- [ ] Definir el monto y el uso de fondos concreto (acelerar dev / onboarding sellers / marketing).
- [ ] Definir la estructura de participación (recordar: valor en el **ecosistema combinado**, no solo plataforma).

---

## Reglas de ejecución (recordatorios)

1. **El GMV es el rey** — prioriza acciones que lo muevan sobre features o pulido.
2. **No gastes en ads sin LTV** — exprime CAC≈0 primero.
3. **Oferta vía invitación, nunca apertura.**
4. **Marca lo regulatorio** en cada decisión nueva.
5. **Disciplina sobre crecimiento** — relee la tesis antes de romper una restricción.

---

*Relacionados: toda la suite ([`README.md`](./README.md)). Especialmente [`business-roadmap.md`](./business-roadmap.md) (las etapas) y [`metricas.md`](./metricas.md) (qué medir).*
