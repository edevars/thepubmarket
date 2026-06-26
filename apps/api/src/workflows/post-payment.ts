/**
 * Workflow durable post-pago (Fase 2). Se dispara desde el webhook al confirmarse
 * un pago; orquesta de forma idempotente: confirmar orden `paid` → descontar
 * inventario → confirmar reservas en los DO → notificar. Reintentos idempotentes.
 *
 * Implementación completa en el Bloque 6.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'

export interface PostPaymentParams {
  orderId: string
}

export class PostPaymentWorkflow extends WorkflowEntrypoint<Env, PostPaymentParams> {
  override async run(_event: WorkflowEvent<PostPaymentParams>, _step: WorkflowStep): Promise<void> {
    // Bloque 6: confirmar orden, descontar inventario, confirmar reservas, notificar.
  }
}
