/**
 * Durable Object de reserva de inventario (Fase 2). Un DO por item de inventario
 * (`RESERVATION.idFromName(inventoryId)`). Su ejecución single-threaded serializa
 * las reservas del mismo single → imposible venderlo dos veces.
 *
 * Modelo: un "hold" por orden (`holds[orderId] = { qty, expiresAt }`).
 *   - reserve: comprueba disponibilidad = quantity(D1) − Σ holds activos, y crea
 *     el hold con TTL. Idempotente por orderId.
 *   - release: quita el hold (pago cancelado/fallido o expiración).
 *   - commit: quita el hold (la venta ya se reflejó al descontar D1). El Workflow
 *     descuenta D1 ANTES de llamar a commit, así no hay ventana de sobreventa.
 * Un alarm libera holds vencidos.
 */

import { DurableObject } from 'cloudflare:workers'
import { createDb, inventory } from '@thepubmarket/db'
import { eq } from 'drizzle-orm'

/** TTL de la reserva: 15 min (decisión de Fase 2). */
const RESERVATION_TTL_MS = 15 * 60 * 1000

interface Hold {
  qty: number
  expiresAt: number
}
type HoldMap = Record<string, Hold>

export interface ReserveResult {
  ok: boolean
  reason?: 'not_found' | 'insufficient'
  available?: number
}

export class InventoryReservation extends DurableObject<Env> {
  /** Carga holds y descarta los vencidos. */
  private async activeHolds(now: number): Promise<HoldMap> {
    const holds = (await this.ctx.storage.get<HoldMap>('holds')) ?? {}
    let changed = false
    for (const [orderId, h] of Object.entries(holds)) {
      if (h.expiresAt <= now) {
        delete holds[orderId]
        changed = true
      }
    }
    if (changed) await this.ctx.storage.put('holds', holds)
    return holds
  }

  private async scheduleAlarm(holds: HoldMap): Promise<void> {
    const next = Math.min(...Object.values(holds).map((h) => h.expiresAt))
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next)
  }

  /** Reserva `qty` del item para `orderId` (idempotente por orderId). */
  async reserve(inventoryId: string, orderId: string, qty: number): Promise<ReserveResult> {
    const now = Date.now()
    const holds = await this.activeHolds(now)

    const db = createDb(this.env.DB)
    const row = await db
      .select({ quantity: inventory.quantity, status: inventory.status })
      .from(inventory)
      .where(eq(inventory.id, inventoryId))
      .get()
    if (row?.status !== 'active') return { ok: false, reason: 'not_found' }

    const reservedByOthers = Object.entries(holds)
      .filter(([id]) => id !== orderId)
      .reduce((sum, [, h]) => sum + h.qty, 0)
    const available = row.quantity - reservedByOthers
    if (qty > available) return { ok: false, reason: 'insufficient', available }

    holds[orderId] = { qty, expiresAt: now + RESERVATION_TTL_MS }
    await this.ctx.storage.put('holds', holds)
    await this.scheduleAlarm(holds)
    return { ok: true, available: available - qty }
  }

  /** Libera el hold de una orden (cancelación/fallo/expiración). Idempotente. */
  async release(orderId: string): Promise<void> {
    const holds = (await this.ctx.storage.get<HoldMap>('holds')) ?? {}
    if (holds[orderId]) {
      delete holds[orderId]
      await this.ctx.storage.put('holds', holds)
    }
  }

  /**
   * Confirma la venta: quita el hold. El Workflow descuenta `inventory.quantity`
   * en D1 ANTES de llamar a commit, por lo que la disponibilidad queda correcta
   * sin ventana de sobreventa. Idempotente.
   */
  async commit(orderId: string): Promise<void> {
    await this.release(orderId)
  }

  override async alarm(): Promise<void> {
    const holds = await this.activeHolds(Date.now())
    if (Object.keys(holds).length > 0) await this.scheduleAlarm(holds)
  }
}
