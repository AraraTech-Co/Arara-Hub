'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { arara, ARARA_SLUG } from './client'
import {
  clearAuth,
  crmRole,
  getAppApiKey,
  getCrmProfile,
  getJwt,
  getStoredUser,
  hasAppAccess,
  setAppApiKey,
  setCrmProfile,
  setMemberships,
  setStoredUser,
  type AraraUser,
  type CrmProfile,
} from './auth-storage'
import { normalizeRole } from '@/lib/canonical-roles'

type AuthState = {
  ready: boolean
  user: AraraUser | null
  profile: CrmProfile | null
  role: CrmProfile['role']
  jwt: string | null
  appSlug: string
  appApiKey: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<AraraUser | null>(null)
  const [profile, setProfile] = useState<CrmProfile | null>(null)
  const [jwt, setJwtState] = useState<string | null>(null)
  const [appApiKey, setAppKeyState] = useState<string | null>(null)

  const refreshMe = useCallback(async () => {
    const token = getJwt()
    if (!token) {
      setUser(null)
      setJwtState(null)
      setProfile(null)
      return
    }
    try {
      const me = await arara.me()
      if (me.user) {
        setUser(me.user)
        setStoredUser(me.user)
      }
      if (me.memberships) setMemberships(me.memberships)
      setJwtState(token)
      try {
        const p = await arara.myProfile()
        const normalized: CrmProfile = {
          id: String(p.id),
          email: p.email,
          fullName: p.fullName,
          role: normalizeRole(p.role) || crmRole(null, me.user),
          teamId: p.teamId,
        }
        setProfile(normalized)
        setCrmProfile(normalized)
      } catch {
        const fallback: CrmProfile = {
          id: me.user.id,
          email: me.user.email,
          fullName: me.user.name,
          role: crmRole(null, me.user),
        }
        setProfile(fallback)
        setCrmProfile(fallback)
      }
    } catch {
      clearAuth()
      setUser(null)
      setJwtState(null)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    setJwtState(getJwt())
    setUser(getStoredUser())
    setProfile(getCrmProfile())
    setAppKeyState(getAppApiKey(ARARA_SLUG))
    refreshMe().finally(() => setReady(true))
  }, [refreshMe])

  const login = useCallback(async (email: string, password: string) => {
    const data = await arara.login(email, password)
    setUser(data.user)
    setJwtState(data.token)
    if (data.memberships) setMemberships(data.memberships)
    if (hasAppAccess(ARARA_SLUG, data.user)) {
      try {
        const created = await arara.createAppKey(ARARA_SLUG, `crm-ui-${data.user.email}`)
        arara.bindAppKey(ARARA_SLUG, created.apiKey.key)
        setAppKeyState(created.apiKey.key)
      } catch {
        // JWT membership may still allow /v1/r
      }
    }
    try {
      const p = await arara.myProfile()
      const normalized: CrmProfile = {
        id: String(p.id),
        email: p.email,
        fullName: p.fullName,
        role: normalizeRole(p.role) || crmRole(null, data.user),
        teamId: p.teamId,
      }
      setProfile(normalized)
      setCrmProfile(normalized)
    } catch {
      const fallback: CrmProfile = {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.name,
        role: crmRole(null, data.user),
      }
      setProfile(fallback)
      setCrmProfile(fallback)
    }
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setUser(null)
    setJwtState(null)
    setProfile(null)
    setAppKeyState(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      ready,
      user,
      profile,
      role: crmRole(profile, user),
      jwt,
      appSlug: ARARA_SLUG,
      appApiKey,
      login,
      logout,
      refreshMe,
    }),
    [ready, user, profile, jwt, appApiKey, login, logout, refreshMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
