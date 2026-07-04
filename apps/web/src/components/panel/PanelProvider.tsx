'use client'

import type {
  InventoryItem,
  SellerOrder,
  SellerPanelMe,
  UpdateListingRequest,
} from '@thepubmarket/shared'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  deliverOrder,
  fetchSellerInventory,
  fetchSellerOrders,
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
  markShipped: (id: string, trackingNumber: string) => Promise<boolean>
  markDelivered: (id: string) => Promise<boolean>
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

  const markShipped = useCallback(
    async (id: string, trackingNumber: string) => {
      const ok = await shipOrder(token, id, trackingNumber)
      if (ok) {
        const now = Math.floor(Date.now() / 1000)
        setOrders((prev) =>
          prev.map((o) =>
            o.id === id ? { ...o, status: 'shipped', trackingNumber, shippedAt: now } : o,
          ),
        )
      }
      return ok
    },
    [token],
  )

  const markDelivered = useCallback(
    async (id: string) => {
      const ok = await deliverOrder(token, id)
      if (ok) {
        const now = Math.floor(Date.now() / 1000)
        setOrders((prev) =>
          prev.map((o) => (o.id === id ? { ...o, status: 'delivered', deliveredAt: now } : o)),
        )
      }
      return ok
    },
    [token],
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
