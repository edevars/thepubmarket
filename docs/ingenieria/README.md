# Ingeniería — The Pub Market

Documentación **técnica viva** del proyecto: estado real, continuidad entre
sesiones y notas de implementación. Capa de ejecución, complementaria a la capa
estratégica ([`../negocio/`](../negocio/)) y a las reglas de decisión
([`../../CLAUDE.md`](../../CLAUDE.md)) y fases ([`../../ROADMAP.md`](../../ROADMAP.md)).

A diferencia de `docs/negocio/` (escrita para un externo), esta suite está escrita
para **quien retoma el código** —el fundador o un agente Claude— y debe poder
ponerse al día sin recargar todo el contexto.

---

## Orden de lectura para retomar trabajo

1. [`../../CLAUDE.md`](../../CLAUDE.md) — reglas de decisión no negociables (no
   custodia, vetted sellers, Cloudflare-first…). **Siempre primero.**
2. [`../../ROADMAP.md`](../../ROADMAP.md) — en qué fase estamos y qué falta.
3. [`estado-actual.md`](./estado-actual.md) — snapshot técnico fechado: qué corre,
   qué está hecho, qué está mockeado, gotchas.
4. [`handoff.md`](./handoff.md) — el "harness" para continuar: arranque, mapa del
   repo, próximos pasos concretos y cómo verificar.

---

## Mapa: qué doc responde qué pregunta

| Pregunta | Documento |
|---|---|
| ¿En qué fase estamos y qué falta para cerrarla? | [`../../ROADMAP.md`](../../ROADMAP.md) |
| ¿Qué corre hoy y qué está mockeado? | [`estado-actual.md`](./estado-actual.md) |
| ¿Cómo arranco y por dónde sigo? | [`handoff.md`](./handoff.md) |
| ¿Qué reglas no puedo romper? | [`../../CLAUDE.md`](../../CLAUDE.md) |
| ¿Qué falta para cobrar dinero real (no test)? | [`checklist-go-live-real.md`](./checklist-go-live-real.md) |
| ¿Qué se validó del flujo E2E (pago fallido, idempotencia, TTL)? | [`validacion-e2e-task-005.md`](./validacion-e2e-task-005.md) |

---

## Mantenimiento

- **Al cerrar un bloque de trabajo:** actualiza `estado-actual.md` (fecha + lo
  hecho/pendiente) y, si cambian los próximos pasos, `handoff.md`.
- **Al completar una fase:** marca el estado en `ROADMAP.md`.
- Mantén estos docs **cortos y de alta señal**: son para orientarse rápido, no un
  manual exhaustivo (el código es la fuente de verdad).

*Estructura definida: junio 2026.*
