/**
 * Auth storage for CRM (Arara Platform).
 * Users are global; API keys are per-app (portal-crm).
 * Roles: user | support | developer | admin (canonical).
 */

import {
  effectiveRole,
  hasMinRole,
  hasRole,
  normalizeRole,
  type CanonicalRole,
} from '@/lib/canonical-roles'

const JWT_KEY = 'arara_jwt'
const USER_KEY = 'arara_user'
const MEMBERSHIPS_KEY = 'arara_memberships'
const PROFILE_KEY = 'arara_crm_profile'
const appKeyStorage = (slug: string) => `arara_app_key:${slug}`

export type AraraUser = {
  id: string
  email: string
  name: string | null
  roles: string[]
  permissions?: string[]
}

export type AraraMembership = {
  role: string
  app: { slug: string; name: string }
}

export type CrmProfile = {
  id: string
  email?: string | null
  fullName?: string | null
  role: CanonicalRole
  teamId?: string | null
}

export function getMemberships(): AraraMembership[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(MEMBERSHIPS_KEY) || '[]') as AraraMembership[]
  } catch {
    return []
  }
}

export function setMemberships(rows: AraraMembership[] | null) {
  if (typeof window === 'undefined') return
  if (rows?.length) localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(rows))
  else localStorage.removeItem(MEMBERSHIPS_KEY)
}

export function getJwt(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(JWT_KEY)
}

export function setJwt(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) localStorage.setItem(JWT_KEY, token)
  else localStorage.removeItem(JWT_KEY)
}

export function getStoredUser(): AraraUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AraraUser) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: AraraUser | null) {
  if (typeof window === 'undefined') return
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

export function getAppApiKey(slug: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(appKeyStorage(slug))
}

export function setAppApiKey(slug: string, key: string | null) {
  if (typeof window === 'undefined') return
  if (key) localStorage.setItem(appKeyStorage(slug), key)
  else localStorage.removeItem(appKeyStorage(slug))
}

export function getCrmProfile(): CrmProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as CrmProfile) : null
  } catch {
    return null
  }
}

export function setCrmProfile(p: CrmProfile | null) {
  if (typeof window === 'undefined') return
  if (p) localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
  else localStorage.removeItem(PROFILE_KEY)
}

export function clearAuth() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(JWT_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(MEMBERSHIPS_KEY)
  localStorage.removeItem(PROFILE_KEY)
  localStorage.removeItem(appKeyStorage('portal-crm'))
}

export function hasAppAccess(slug: string, user: AraraUser | null): boolean {
  if (!user) return false
  if (hasMinRole(user.roles || [], 'developer')) return true
  return getMemberships().some((m) => m.app?.slug === slug)
}

/** Effective CRM role from profile, membership, or platform roles. */
export function crmRole(profile: CrmProfile | null, user: AraraUser | null): CanonicalRole {
  const fromProfile = normalizeRole(profile?.role)
  if (fromProfile) return fromProfile
  const m = getMemberships().find((x) => x.app?.slug === 'portal-crm')
  const fromMembership = normalizeRole(m?.role)
  if (fromMembership) return fromMembership
  return effectiveRole(user?.roles || [])
}

export function isCrmAdmin(profile: CrmProfile | null, user: AraraUser | null): boolean {
  return hasRole([crmRole(profile, user)], 'admin')
}
