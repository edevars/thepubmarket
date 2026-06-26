'use client'

import type { Condition, Finish, InventoryItem } from '@thepubmarket/shared'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface CartItem {
  inventoryId: string
  name: string
  priceCents: number
  imageUrl: string | null
  sellerId: string
  /** Máximo disponible al momento de agregar (para topar la cantidad). */
  maxQuantity: number
  quantity: number
  // --- Campos de display (opcionales: retrocompat con carritos ya guardados) ---
  /** Condición física, para el badge de la línea. */
  condition?: Condition
  /** Acabado ofrecido; `'foil'` muestra el tag FOIL. */
  finish?: Finish
  /** Idioma del single ofrecido (p. ej. 'es', 'en'). */
  language?: string
  /** Código de set (p. ej. 'MH2') para la línea de set. */
  setCode?: string
  /** Número de coleccionista para la línea de set. */
  collectorNumber?: string
  /**
   * Nombre y verificación del vendedor. El modelo `InventoryItem` aún no los
   * expone (solo `sellerId`), así que hoy llegan `undefined` y la fila de
   * vendedor se omite. Punto de extensión para cuando el catálogo los provea.
   */
  sellerName?: string
  sellerVerified?: boolean
}

interface CartContextValue {
  items: CartItem[]
  count: number
  subtotalCents: number
  add: (item: InventoryItem, quantity?: number) => void
  setQuantity: (inventoryId: string, quantity: number) => void
  remove: (inventoryId: string) => void
  clear: () => void
  /** Estado del carrito deslizable (drawer). */
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
}

const CartContext = createContext<CartContextValue | null>(null)
const STORAGE_KEY = 'tpm_cart'

function load(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Hidrata desde localStorage tras el montaje (evita desajuste SSR).
  useEffect(() => {
    setItems(load())
  }, [])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const add = useCallback((item: InventoryItem, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.inventoryId === item.id)
      if (existing) {
        const next = Math.min(existing.quantity + quantity, item.quantity)
        return prev.map((i) => (i.inventoryId === item.id ? { ...i, quantity: next } : i))
      }
      return [
        ...prev,
        {
          inventoryId: item.id,
          name: item.card.name,
          priceCents: item.priceCents,
          imageUrl: item.card.imageUrl,
          sellerId: item.sellerId,
          maxQuantity: item.quantity,
          quantity: Math.min(quantity, item.quantity),
          condition: item.condition,
          finish: item.finish,
          language: item.language,
          setCode: item.card.setCode,
          collectorNumber: item.card.collectorNumber,
        },
      ]
    })
  }, [])

  const setQuantity = useCallback((inventoryId: string, quantity: number) => {
    setItems((prev) =>
      prev.flatMap((i) => {
        if (i.inventoryId !== inventoryId) return [i]
        const q = Math.max(0, Math.min(quantity, i.maxQuantity))
        return q === 0 ? [] : [{ ...i, quantity: q }]
      }),
    )
  }, [])

  const remove = useCallback((inventoryId: string) => {
    setItems((prev) => prev.filter((i) => i.inventoryId !== inventoryId))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((s, i) => s + i.quantity, 0)
    const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0)
    return {
      items,
      count,
      subtotalCents,
      add,
      setQuantity,
      remove,
      clear,
      drawerOpen,
      openDrawer,
      closeDrawer,
    }
  }, [items, add, setQuantity, remove, clear, drawerOpen, openDrawer, closeDrawer])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>')
  return ctx
}
