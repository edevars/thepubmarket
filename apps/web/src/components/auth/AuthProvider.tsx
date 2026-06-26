'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  type AuthUser,
  clearToken,
  fetchMe,
  getToken,
  logoutRequest,
  setToken,
} from '@/lib/session'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  /** Registra la sesión recién creada (tras verificar el magic link). */
  signIn: (sessionToken: string, user: AuthUser) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    fetchMe(token)
      .then((u) => {
        if (u) setUser(u)
        else clearToken()
      })
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback((sessionToken: string, u: AuthUser) => {
    setToken(sessionToken)
    setUser(u)
  }, [])

  const signOut = useCallback(async () => {
    const token = getToken()
    if (token) await logoutRequest(token)
    clearToken()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
