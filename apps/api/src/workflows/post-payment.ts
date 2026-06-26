/**
 * Workflow durable post-pago (Fase 2). Se dispara desde el webhook al confirmarse
 * el pago. Orquesta de forma idempotente y con reintentos:
 *   1. settle: marca la orden `paid` y descuenta inventario en UN batch atómico
 *      de D1 (todo-o-nada). Solo transiciona pending→paid (idempotente).
 *   2. commit-reservations: confirma (libera) los holds en los Durable Objects
 *      DESPUÉS de descontar D1 → sin ventana de sobreventa.
 *   3. notify: recibo al comprador (stub en Fase 2).
 *
 * Idempotencia en capas: webhook deduplica por event.id; la instancia del
 * workflow usa `id = orderId` (no se crea dos veces); cada `step.do` queda
 * checkpointed; y el settle solo aplica si la orden seguía `pending`.
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { createDb, orderItems, orders } from '@thepubmarket/db'
import { eq } from 'drizzle-orm'

export interface PostPaymentParams {
  orderId: string
}

export class PostPaymentWorkflow extends WorkflowEntrypoint<Env, PostPaymentParams> {
  override async run(event: WorkflowEvent<PostPaymentParams>, step: WorkflowStep): Promise<void> {
    const { orderId } = event.payload
    const db = createDb(this.env.DB)

    // 1. Confirmar orden + descontar inventario (atómico). Idempotente.
    await step.do('settle-order', async () => {
      const order = await db.select().from(orders).where(eq(orders.id, orderId)).get()
      if (!order) throw new Error(`order ${orderId} no encontrada`)
      if (order.status !== 'pending') return // ya liquidada

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all()

      // Batch atómico de D1: pending→paid + decrementos. Todo o nada.
      const stmts = [
        this.env.DB.prepare(
          "UPDATE orders SET status = 'paid', updated_at = unixepoch() WHERE id = ? AND status = 'pending'",
        ).bind(orderId),
        ...items
          .filter((it) => it.inventoryId)
          .map((it) =>
            this.env.DB.prepare(
              'UPDATE inventory SET quantity = quantity - ?, updated_at = unixepoch() WHERE id = ?',
            ).bind(it.quantity, it.inventoryId),
          ),
      ]
      await this.env.DB.batch(stmts)
    })

    // 2. Confirmar reservas (liberar holds) tras descontar D1.
    await step.do('commit-reservations', async () => {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all()
      await Promise.all(
        items
          .filter((it) => it.inventoryId)
          .map((it) =>
            this.env.RESERVATION.get(
              this.env.RESERVATION.idFromName(it.inventoryId as string),
            ).commit(orderId),
          ),
      )
    })

    // 3. Notificar (stub). TODO(prod): recibo por email al comprador/seller.
    await step.do('notify', async () => {
      console.log(`[post-payment] orden ${orderId} liquidada`)
    })
  }
}
