/**
 * Durable Object de reserva de inventario (Fase 2). Un DO por item de inventario
 * (`RESERVATION.idFromName(inventoryId)`); su ejecución single-threaded evita la
 * doble venta del mismo single. Mantiene holds con TTL y los libera vía alarm.
 *
 * Implementación completa en el Bloque 3.
 */
import { DurableObject } from 'cloudflare:workers'

export class InventoryReservation extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    return new Response('not_implemented', { status: 501 })
  }
}
