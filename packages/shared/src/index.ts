/**
 * Tipos compartidos entre el Worker (apps/api) y el frontend (apps/web).
 *
 * Mantener este paquete mínimo y sin dependencias: es solo un contrato.
 * En Fase 0 únicamente define la respuesta del health check, que la web
 * consume para verificar el wiring end-to-end con el Worker.
 */

/** Estado de un subsistema verificado por el health check. */
export type HealthStatus = 'ok' | 'error'

/** Respuesta de `GET /health` del Worker. */
export interface HealthResponse {
  /** Estado global del servicio. */
  status: HealthStatus
  /** Conectividad con D1 (base transaccional). */
  db: HealthStatus
  /** Marca de tiempo unix en segundos. */
  timestamp: number
}
