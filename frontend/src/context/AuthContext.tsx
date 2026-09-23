import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  loginUser,
  fetchMe,
  getStoredToken,
  setStoredToken,
  type UserProfile,
  type LoginRequest,
  type UserRole
} from '../services/api'

interface AuthContextType {
  user: UserProfile | null
  token: string | null
  loading: boolean
  error: string | null
  login: (req: LoginRequest) => Promise<void>
  logout: () => void
  hasRole: (...roles: UserRole[]) => boolean
  canOperate: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadUserProfile = useCallback(async () => {
    const currentToken = getStoredToken()
    if (!currentToken) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const profile = await fetchMe()
      setUser(profile)
      setToken(currentToken)
    } catch {
      // Invalid or expired token
      setStoredToken(null)
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUserProfile()
  }, [loadUserProfile])

  const login = async (req: LoginRequest) => {
    setError(null)
    try {
      const response = await loginUser(req)
      setToken(response.token)
      setUser(response.user)
    } catch (err: any) {
      const msg = err.message || 'Falha ao autenticar'
      setError(msg)
      throw new Error(msg)
    }
  }

  const logout = () => {
    setStoredToken(null)
    setToken(null)
    setUser(null)
    setError(null)
  }

  const hasRole = (...roles: UserRole[]) => {
    if (!user) return false
    return roles.includes(user.role)
  }

  const canOperate = user?.role === 'admin' || user?.role === 'noc_operator'
  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        login,
        logout,
        hasRole,
        canOperate,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
