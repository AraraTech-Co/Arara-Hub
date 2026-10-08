/**
 * Auth model (Arara Platform):
 * - Users are GLOBAL / shared across apps (one login for portal-suporte, CRM, …).
 * - API keys are PER APP (scoped). An admin JWT can mint a key for portal-suporte
 *   and another for crm — same user, different keys/domains.
 *
 * Browser stores:
 * - arara_jwt          → platform user session
 * - arara_app_key:{slug} → API key for that app's /v1/r calls (optional if JWT is owner/admin)
 */

const JWT_KEY = 'arara_jwt'
const USER_KEY = 'arara_user'
const APP_ROLE_KEY = 'arara_app_role'
const appKeyStorage = (slug: string) => `arara_app_key:${slug}`

/**
 * Papéis canônicos da plataforma (`GET /readme`, seção 8), do menor para o maior.
 *
 * `support` é o agente de suporte — kanban, tickets, inbox. Ele não existia no
 * vocabulário antigo do portal, e por isso quem estava assim ficava sem acesso
 * a nada: rank desconhecido valia 0.
 *
 * `admin` absorveu o antigo `master`; `master` sobrevive só como apelido de
 * migração, para quem ainda não foi convertido no banco.
 */
export const APP_ROLES = ['user', 'support', 'developer', 'admin'] as const
export type AppRole = (typeof APP_ROLES)[number]

export const ROLE_RANK: Record<AppRole, number> = {
  user: 10,
  support: 20,
  developer: 30,
  admin: 40,
}

/** Apelidos de migração definidos pela plataforma. */
const ALIASES: Record<string, AppRole> = {
  master: 'admin',
  gerente: 'admin',
  member: 'support',
  agent: 'support',
  vendedor: 'user',
}

/** Papel cru (do banco, do JWT, de membership) → papel canônico. `null` se não reconhecido. */
export function normalizeRole(raw: unknown): AppRole | null {
  const v = String(raw ?? '').trim().toLowerCase()
  if ((APP_ROLES as readonly string[]).includes(v)) return v as AppRole
  return ALIASES[v] ?? null
}

/** O papel atende ao mínimo? Papel irreconhecível nunca atende. */
export function hasMinRole(raw: unknown, minimo: AppRole): boolean {
  const r = normalizeRole(raw)
  return r ? ROLE_RANK[r] >= ROLE_RANK[minimo] : false
}

/**
 * É gente da Arara — alguém que atende chamado e pode ser responsável?
 *
 * Existe porque as telas vinham decidindo isso com a lista literal
 * `['developer','admin','master']`, copiada em quatro lugares. Essa lista
 * ESQUECE `support`, que é justamente o agente de suporte: dos 11 perfis, 7
 * são support, e por isso o seletor de responsável do Kanban mostrava só três
 * pessoas e o filtro por agente não achava o trabalho dos outros sete.
 *
 * `support` é o piso porque `user` é o cliente — esse não atende nada.
 * Apelidos (`master`, `member`, `agent`, `gerente`) entram pela normalização,
 * então trocar o rótulo no cadastro não quebra a tela de novo.
 */
export function ehEquipe(raw: unknown): boolean {
  return hasMinRole(raw, 'support')
}

/**
 * Agente que pode receber trabalho HOJE: é da equipe e não foi desativado.
 *
 * `ehEquipe` sozinho responde só pelo papel, e por isso membro desativado
 * continuava aparecendo em filtro e seletor de responsável — a pessoa saía da
 * equipe e o portal seguia oferecendo ela. `active` ausente (cadastro antigo)
 * conta como ativo: quem nunca foi desativado não pode sumir por omissão.
 */
export function ehAgenteAtivo(p: {
  role?: unknown
  role_title?: unknown
  active?: boolean | null
} | null | undefined): boolean {
  if (!p) return false
  if (p.active === false) return false
  return ehEquipe(p.role ?? p.role_title)
}

export type AraraUser = {
  id: string
  email: string
  name: string | null
  roles: string[]
  permissions: string[]
}

export type AraraMembership = {
  role: string
  app: { slug: string; name: string }
}

const MEMBERSHIPS_KEY = 'arara_memberships'

export function getMemberships(): AraraMembership[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(MEMBERSHIPS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as AraraMembership[]
  } catch {
    return []
  }
}

export function setMemberships(rows: AraraMembership[] | null) {
  if (typeof window === 'undefined') return
  if (rows && rows.length) localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(rows))
  else localStorage.removeItem(MEMBERSHIPS_KEY)
}

// ── Sessão do portal ─────────────────────────────────────────────────────────
// Mora AQUI, e não em `sessao.ts`, para o `client` poder mandar o cabeçalho sem
// importar o módulo que importa o próprio client (ciclo). Ver
// docs/plans/plano-sessao-persistente-portal.md.
const SESSAO_KEY = 'portal_sessao'

export function getSessaoToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSAO_KEY)
}

export function setSessaoToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) localStorage.setItem(SESSAO_KEY, token)
  else localStorage.removeItem(SESSAO_KEY)
}

// ── Refresh token (entregue pela plataforma em 21/08) ──────────────────────
// Opaco, 30 dias, COM ROTAÇÃO: cada uso invalida o anterior, então o valor novo
// precisa ser gravado na mesma hora — senão a próxima renovação falha e a
// pessoa é deslogada sem motivo aparente.
const REFRESH_KEY = 'arara_refresh'

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_KEY)
}

export function setRefreshToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) localStorage.setItem(REFRESH_KEY, token)
  else localStorage.removeItem(REFRESH_KEY)
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
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AraraUser
  } catch {
    return null
  }
}

export function setStoredUser(user: AraraUser | null) {
  if (typeof window === 'undefined') return
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

/**
 * Chave de API do app para este navegador.
 *
 * Só vale a chave que o próprio usuário mintou no login (escopo dele). NÃO
 * existe fallback para variável de ambiente: tudo que é `NEXT_PUBLIC_` o Next
 * grava dentro do JS que vai para o navegador, então uma chave ali é uma chave
 * pública — quem não tiver chave própria segue autenticado pelo JWT.
 */
export function getAppApiKey(slug: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(appKeyStorage(slug))
}

export function setAppApiKey(slug: string, key: string | null) {
  if (typeof window === 'undefined') return
  if (key) localStorage.setItem(appKeyStorage(slug), key)
  else localStorage.removeItem(appKeyStorage(slug))
}

/**
 * Nível do usuário DENTRO do portal (`portal-suporte-Profile.role`).
 *
 * Não é o mesmo que o papel na plataforma: um analista pode ser `user` na
 * plataforma e `developer` aqui. É este valor que a tela de Equipe › Membros
 * edita, então é ele que precisa mandar em quem vê o quê.
 */
export function getAppRole(): AppRole | null {
  if (typeof window === 'undefined') return null
  // Passa pelo normalizador: quem logou antes da migração tem 'master' gravado.
  return normalizeRole(localStorage.getItem(APP_ROLE_KEY))
}

export function setAppRole(role: string | null) {
  if (typeof window === 'undefined') return
  // Guarda já canônico — o banco ainda pode devolver apelido.
  const canonico = normalizeRole(role)
  if (canonico) localStorage.setItem(APP_ROLE_KEY, canonico)
  else localStorage.removeItem(APP_ROLE_KEY)
}

export function clearAuth() {
  setJwt(null)
  setStoredUser(null)
  setMemberships(null)
  setAppRole(null)
  localStorage.removeItem(REFRESH_KEY)
}

/**
 * Staff = alguém da Arara, e não um cliente.
 *
 * A ordem importa: o nível do portal vem primeiro porque é o único que a
 * equipe administra. Antes disto só se olhava papel de plataforma e
 * membership — que ninguém edita — e por isso todo analista caía no painel
 * de cliente mesmo estando como `developer` aqui.
 */
export function isStaff(user: AraraUser | null, appSlug = 'portal-suporte'): boolean {
  if (!user) return false
  const appRole = getAppRole()
  // Staff = qualquer pessoa da Arara. `support` (agente) entra: é o time de
  // atendimento, e antes ele caía fora por não existir no vocabulário.
  if (appRole) return appRole !== 'user'
  if (user.roles.some((r) => hasMinRole(r, 'support'))) return true
  return getMemberships().some(
    (m) => m.app?.slug === appSlug && hasMinRole(m.role, 'support'),
  )
}

export function isAdmin(user: AraraUser | null, appSlug = 'portal-suporte'): boolean {
  if (!user) return false
  const appRole = getAppRole()
  if (appRole) return hasMinRole(appRole, 'admin')
  if (user.roles.some((r) => hasMinRole(r, 'admin'))) return true
  return getMemberships().some((m) => m.app?.slug === appSlug && hasMinRole(m.role, 'admin'))
}
