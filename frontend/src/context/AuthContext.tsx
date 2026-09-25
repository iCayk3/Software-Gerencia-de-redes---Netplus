import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  loginUser,
  fetchMe,
  fetchTenants,
  getStoredToken,
  setStoredToken,
  getActiveTenantId,
  setActiveTenantId as saveActiveTenantId,
  type UserProfile,
  type LoginRequest,
  type UserRole,
  type Tenant,
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
  isSuperAdmin: boolean
  tenants: Tenant[]
  activeTenantId: string | null
  currentTenant: Tenant | null
  setActiveTenant: (tenantId: string | null) => void
  refreshTenants: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(() => getActiveTenantId())

  const refreshTenants = useCallback(async () => {
    try {
      const data = await fetchTenants()
      setTenants(data)
    } catch {
      // Ignorar caso sem permissão
    }
  }, [])

  const checkIsSuperAdmin = (u: UserProfile | null): boolean => {
    if (!u) return false
    if (u.is_superadmin) return true
    if (u.email?.toLowerCase() === 'admin@netpulse.com') return true
    if (u.role === 'admin' && (u.tenant_id === 'default-tenant' || !u.tenant_id)) return true
    return false
  }

  const loadUserProfile = useCallback(async () => {
    const currentToken = getStoredToken()
    if (!currentToken) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const profile = await fetchMe()
      if (checkIsSuperAdmin(profile)) {
        profile.is_superadmin = true
      }
      setUser(profile)
      setToken(currentToken)
      if (profile.role === 'admin' || profile.is_superadmin) {
        refreshTenants()
      }
    } catch {
      // Token inválido ou expirado
      setStoredToken(null)
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [refreshTenants])

  useEffect(() => {
    loadUserProfile()
  }, [loadUserProfile])

  const login = async (req: LoginRequest) => {
    setError(null)
    try {
      const response = await loginUser(req)
      const isSuper = checkIsSuperAdmin(response.user)
      if (isSuper) {
        response.user.is_superadmin = true
      }
      setToken(response.token)
      setUser(response.user)

      // Se for cliente comum, trava no tenant dele
      if (!isSuper) {
        saveActiveTenantId(response.user.tenant_id)
        setActiveTenantIdState(response.user.tenant_id)
      } else {
        refreshTenants()
      }
    } catch (err: any) {
      const msg = err.message || 'Falha ao autenticar'
      setError(msg)
      throw new Error(msg)
    }
  }

  const logout = () => {
    setStoredToken(null)
    saveActiveTenantId(null)
    setToken(null)
    setUser(null)
    setError(null)
    setActiveTenantIdState(null)
    setTenants([])
  }

  const setActiveTenant = (tenantId: string | null) => {
    saveActiveTenantId(tenantId)
    setActiveTenantIdState(tenantId)
    // Disparar recarregamento ou evento para sincronizar consultas
    window.dispatchEvent(new Event('tenant_changed'))
  }

  const hasRole = (...roles: UserRole[]) => {
    if (!user) return false
    return roles.includes(user.role)
  }

  const isSuperAdmin = checkIsSuperAdmin(user)
  const canOperate = isSuperAdmin || user?.role === 'admin' || user?.role === 'noc_operator'
  const isAdmin = isSuperAdmin || user?.role === 'admin'

  // Determinar o Tenant atual em visualização
  const effectiveTenantId = isSuperAdmin ? activeTenantId : user?.tenant_id
  const currentTenant = tenants.find((t) => t.id === effectiveTenantId) || null

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
        isSuperAdmin,
        tenants,
        activeTenantId,
        currentTenant,
        setActiveTenant,
        refreshTenants,
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
