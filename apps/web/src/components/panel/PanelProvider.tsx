'use client'

import type {
  InventoryItem,
  SellerOrder,
  SellerPanelMe,
  UpdateListingRequest,
} from '@thepubmarket/shared'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  collectOrder,
  deliverOrder,
  fetchSellerInventory,
  fetchSellerOrders,
  readyOrder,
  shipOrder,
  updateListing,
} from '@/lib/client-api'

/**
 * Estado compartido del Panel del Vendedor: identidad de tienda, inventario y
 * órdenes. Se carga una vez al montar el shell; las vistas mutan vía las
 * acciones expuestas (que sincronizan el estado local con la respuesta real).
 */
interface PanelContextValue {
  token: string
  me: SellerPanelMe
  inventory: InventoryItem[]
  orders: SellerOrder[]
  /** Carga inicial de inventario+órdenes en curso. */
  loadingData: boolean
  /** Órdenes pagadas sin enviar (badge del sidebar / banner del resumen). */
  pendingCount: number
  refresh: () => Promise<void>
  /** PATCH de un item propio; actualiza el estado local con la fila real. */
  patchItem: (id: string, body: UpdateListingRequest) => Promise<boolean>
  /** Inserta el item recién publicado al inicio (flujo Agregar). */
  addItem: (item: InventoryItem) => void
  /** Envío a domicilio: marca enviada con guía y paquetería opcional. */
  markShipped: (id: string, trackingNumber: string, carrier?: string | null) => Promise<boolean>
  /** Envío a domicilio: cierra la orden como entregada. */
  markDelivered: (id: string) => Promise<boolean>
  /** Recolección: la orden ya está en la tienda destino y se puede recoger. */
  markReady: (id: string) => Promise<boolean>
  /** Recolección: el comprador ya se la llevó. */
  markCollected: (id: string) => Promise<boolean>
}

const PanelContext = createContext<PanelContextValue | null>(null)

interface PanelProviderProps {
  token: string
  me: SellerPanelMe
  children: React.ReactNode
}

export function PanelProvider({ token, me, children }: PanelProviderProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const refresh = useCallback(async () => {
    const [inv, ords] = await Promise.all([
      fetchSellerInventory(token).catch(() => [] as InventoryItem[]),
      fetchSellerOrders(token).catch(() => [] as SellerOrder[]),
    ])
    setInventory(inv)
    setOrders(ords)
  }, [token])

  useEffect(() => {
    refresh().finally(() => setLoadingData(false))
  }, [refresh])

  const patchItem = useCallback(
    async (id: string, body: UpdateListingRequest) => {
      const updated = await updateListing(token, id, body)
      if (!updated) return false
      setInventory((prev) => prev.map((i) => (i.id === id ? updated : i)))
      return true
    },
    [token],
  )

  const addItem = useCallback((item: InventoryItem) => {
    setInventory((prev) => [item, ...prev])
  }, [])

  /**
   * Aplica el resultado de una transición a la orden en memoria. Solo se llama
   * cuando la API confirmó el cambio: si respondió 409 (la acción no aplicaba a
   * esa orden) el estado local no se toca y la vista sigue mostrando la verdad.
   */
  const patchOrder = useCallback((id: string, patch: Partial<SellerOrder>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  }, [])

  const markShipped = useCallback(
    async (id: string, trackingNumber: string, carrier?: string | null) => {
      const ok = await shipOrder(token, id, trackingNumber, carrier)
      if (ok) {
        patchOrder(id, {
          status: 'shipped',
          trackingNumber,
          carrier: carrier?.trim() || null,
          shippedAt: Math.floor(Date.now() / 1000),
        })
      }
      return ok
    },
    [token, patchOrder],
  )

  const markDelivered = useCallback(
    async (id: string) => {
      const ok = await deliverOrder(token, id)
      if (ok) patchOrder(id, { status: 'delivered', deliveredAt: Math.floor(Date.now() / 1000) })
      return ok
    },
    [token, patchOrder],
  )

  const markReady = useCallback(
    async (id: string) => {
      const ok = await readyOrder(token, id)
      if (ok) patchOrder(id, { status: 'ready', readyAt: Math.floor(Date.now() / 1000) })
      return ok
    },
    [token, patchOrder],
  )

  const markCollected = useCallback(
    async (id: string) => {
      const ok = await collectOrder(token, id)
      if (ok) patchOrder(id, { status: 'delivered', deliveredAt: Math.floor(Date.now() / 1000) })
      return ok
    },
    [token, patchOrder],
  )

  const pendingCount = orders.filter((o) => o.status === 'paid').length

  return (
    <PanelContext.Provider
      value={{
        token,
        me,
        inventory,
        orders,
        loadingData,
        pendingCount,
        refresh,
        patchItem,
        addItem,
        markShipped,
        markDelivered,
        markReady,
        markCollected,
      }}
    >
      {children}
    </PanelContext.Provider>
  )
}

export function usePanel(): PanelContextValue {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel debe usarse dentro de <PanelProvider>')
  return ctx
}
