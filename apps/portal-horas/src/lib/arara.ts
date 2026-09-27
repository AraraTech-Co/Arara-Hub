/**
 * Arara auth for Time Management frontend.
 * Set VITE_ARARA_API_URL to enable unified login.
 *
 * Identity = platform User. Horas role/rates come from StaffProfile
 * with the same id (GET /users/me).
 */
import { normalizeRole } from './canonical-roles.js'

const ARARA_URL = (import.meta.env.VITE_ARARA_API_URL ?? '').replace(/\/$/, '')
const ARARA_SLUG = import.meta.env.VITE_ARARA_APP_SLUG || 'portal-horas'
/** DB App.slug / API-key registry (alias until DB rename). */
const STORAGE_SLUG = ARARA_SLUG === 'portal-horas' ? 'time-management' : ARARA_SLUG

const JWT_KEY = 'arara_jwt'
const APP_KEY = `arara_app_key:${ARARA_SLUG}`

export function isAraraEnabled() {
  // Empty string = same-origin (nginx proxies /v1 to the API container)
  return import.meta.env.VITE_ARARA_API_URL !== undefined
}

export async function araraLogin(email: string, password: string) {
  const res = await fetch(`${ARARA_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || data.message || 'Login falhou')
  const token = data.token || data.accessToken
  localStorage.setItem(JWT_KEY, token)
  localStorage.setItem('arara_user', JSON.stringify(data.user))

  const keyRes = await fetch(`${ARARA_URL}/v1/apps/${STORAGE_SLUG}/keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'horas-ui' }),
  })
  if (!keyRes.ok) {
    const err = await keyRes.json().catch(() => ({} as { error?: string }))
    throw new Error(err.error || `Falha ao criar API key (${keyRes.status})`)
  }
  const keyBody = await keyRes.json()
  const raw = keyBody.apiKey?.key || keyBody.key
  if (!raw) throw new Error('API key não retornada pelo servidor')
  localStorage.setItem(APP_KEY, raw)

  localStorage.setItem('token', token)
  return data
}

export function getAppKey() {
  return localStorage.getItem(APP_KEY)
}

export async function araraFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  const jwtOnly =
    path.startsWith('/users') ||
    path.startsWith('/users/me') ||
    path.startsWith('/finance/') ||
    path.startsWith('/hour-entries')
  const token = localStorage.getItem('token')
  if (jwtOnly && token) {
    headers.set('Authorization', `Bearer ${token}`)
  } else {
    const appKey = getAppKey()
    if (appKey) headers.set('x-api-key', appKey)
  }
  const url = `${ARARA_URL}/v1/r/${ARARA_SLUG}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || body.message || `HTTP ${res.status}`)
  }
  return res.json()
}

/** Role/permissions from Horas StaffProfile (same id as platform User). */
export async function loadHorasAppUser(platformUser: {
  id: string
  email: string
  fullName?: string
  name?: string
}) {
  const body = await araraFetch('/users/me')
  const appUser: Record<string, unknown> | undefined =
    body?.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : undefined

  const flag = (camel: string, snake: string, defaultTrue = false) => {
    if (!appUser) return defaultTrue
    if (appUser[camel] !== undefined) return Boolean(appUser[camel])
    if (appUser[snake] !== undefined) return Boolean(appUser[snake])
    return defaultTrue
  }

  // Mapeamento canônico de role (aliases: manager/gerente/owner→admin, member/agent→support, master→admin, …)
  let role = normalizeRole(appUser?.role as string | undefined) || 'user'
  // Legacy manager_role elevates to admin for screen ceilings until data migration
  const managerRole = Boolean(appUser?.manager_role ?? appUser?.managerRole)
  if (managerRole && role !== 'admin') role = 'admin'

  // Same id everywhere — platform User is the identity
  return {
    id: platformUser.id,
    email: platformUser.email,
    fullName: String(
      appUser?.full_name ||
        appUser?.fullName ||
        platformUser.fullName ||
        platformUser.name ||
        platformUser.email,
    ),
    role,
    managerRole: false,
    // Hour-type permissions (StaffProfile) — required for BIP/Backup in the form
    canLogProject: flag('canLogProject', 'can_log_project', true),
    canLogSupport: flag('canLogSupport', 'can_log_support', false),
    canLogBip: flag('canLogBip', 'can_log_bip', false),
    canLogBackup: flag('canLogBackup', 'can_log_backup', false),
    squadConfig: appUser?.squad_config || appUser?.squadConfig,
    screenPermissions: appUser?.screen_permissions || appUser?.screenPermissions,
    horasProfileLoaded: true,
  }
}

/**
 * Adota um JWT já emitido (ex.: vindo do handoff SSO do Hub) e deixa o
 * armazenamento no MESMO estado de um login normal: arara_jwt, token, usuário e
 * — como o araraLogin faz — a app key cunhada. Sem a app key, telas que falam
 * direto com a plataforma responderiam "sessão sem chave do app".
 */
export async function araraAdoptToken(token: string) {
  localStorage.setItem(JWT_KEY, token)
  localStorage.setItem('token', token)

  const meRes = await fetch(`${ARARA_URL}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const me = await meRes.json().catch(() => ({}))
  if (!meRes.ok) throw new Error(me.error || me.message || 'Sessão inválida')
  const user = me.user || me
  localStorage.setItem('arara_user', JSON.stringify(user))
  localStorage.setItem(
    'user',
    JSON.stringify({ id: user.id, email: user.email, fullName: user.name || user.email }),
  )

  const keyRes = await fetch(`${ARARA_URL}/v1/apps/${STORAGE_SLUG}/keys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'horas-ui' }),
  })
  if (!keyRes.ok) {
    const err = await keyRes.json().catch(() => ({} as { error?: string }))
    throw new Error(err.error || `Falha ao criar API key (${keyRes.status})`)
  }
  const keyBody = await keyRes.json()
  const raw = keyBody.apiKey?.key || keyBody.key
  if (!raw) throw new Error('API key não retornada pelo servidor')
  localStorage.setItem(APP_KEY, raw)

  return { token, user }
}

/**
 * Entrada vinda do Arara Hub. O Hub sorteia um código de uso único, guarda o
 * JWT por 30s e redireciona para cá com `#/sso?codigo=<id.verificador>` (também
 * aceitamos `?c=` e query, por robustez). Aqui o código é trocado pelo token na
 * rota pública do Hub — e o registro morre na leitura.
 *
 * Roda ANTES do React montar (ver main.jsx): se consome com sucesso, o app já
 * inicializa autenticado, sem passar pela tela de login. Devolve true se houve
 * handoff (com ou sem sucesso na troca), para o main aguardar antes de pintar.
 */
export async function consumeHubHandoff(): Promise<boolean> {
  if (!isAraraEnabled()) return false

  const { hash, search, pathname } = window.location
  let raw = ''
  const isSsoHash = /(^|#)\/?sso(\b|\/|\?)/i.test(hash || '')
  if (isSsoHash && (hash || '').includes('?')) {
    raw = hash.slice(hash.indexOf('?') + 1)
  } else if (search && (/\/sso\/?$/.test(pathname) || /[?&](codigo|c)=/.test(search))) {
    raw = search.replace(/^\?/, '')
  }
  if (!raw) return false

  const codigo = new URLSearchParams(raw).get('codigo') || new URLSearchParams(raw).get('c') || ''
  if (!codigo) return false

  try {
    // A rota de troca é pública mas exige um token de webhook na query (não é
    // segredo — viaja neste bundle; quem autentica é o código de uso único).
    const res = await fetch(`${ARARA_URL}/v1/r/arara-hub/sso/trocar?token=arara-hub-troca-publica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    })
    const body = await res.json().catch(() => ({} as { token?: string }))
    if (res.ok && body?.token) {
      await araraAdoptToken(body.token)
    }
  } catch {
    // Silencioso: cai na tela de login, e a pessoa volta ao Hub e clica de novo.
  } finally {
    // Tira o código da URL SEMPRE e volta pra RAIZ do app (não deixa em /sso/,
    // que não é rota) — nem reuso, nem histórico com o código.
    const root = import.meta.env.BASE_URL || '/'
    try { window.history.replaceState(null, '', root) } catch { /* noop */ }
  }
  return true
}
