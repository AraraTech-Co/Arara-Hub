import { api } from './client'
import { ehCadastrada, type EmpresaBruta } from '@/lib/empresas'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanyGroup {
  id: string
  name: string
}

export interface SlaContract {
  id: string
  name: string
  tier: string
  p0ResponseMin?: number | null
  p1ResponseMin?: number | null
  p2ResponseMin?: number | null
  p3ResponseMin?: number | null
}

export interface Company {
  id: string
  name: string
  tradeName?: string | null
  cnpj: string | null
  stateRegistration?: string | null
  segment: string | null
  operationType?: string | null
  active: boolean
  city: string | null
  state: string | null
  phone: string | null
  whatsapp?: string | null
  contactEmail: string | null
  product?: string | null
  hasPdv?: boolean
  pdvCount?: number | null
  storeCount?: number | null
  usesTef?: boolean
  usesSat?: boolean
  usesNfce?: boolean
  activeModules?: string[]
  integrationPartners?: string[]
  operationalNotes?: string | null
  serverName?: string | null
  serverType?: string | null
  serverIpInternal?: string | null
  serverIpExternal?: string | null
  serverOs?: string | null
  dbSystem?: string | null
  vpnEnabled?: boolean
  backupEnabled?: boolean
  hasHomologEnv?: boolean
  technicalNotes?: string | null
  slaContractId?: string | null
  slaContract?: SlaContract | null
  group: CompanyGroup | null
  _count: { tickets: number; profiles: number; units: number }
}

export interface CompanyUnit {
  id: string
  companyId: string
  name: string
  city: string | null
  state: string | null
  active: boolean
  code?: string | null
  cnpj?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  whatsapp?: string | null
  product?: string | null
  pdvCount?: number | null
  serverRef?: string | null
  notes?: string | null
}

export interface UnitSolicitante {
  id: string
  unitId: string
  nome: string
  cargo: string | null
  whatsapp: string
  createdAt: string
  updatedAt: string
}

export interface UnitCaixa {
  id: string
  unitId: string
  numero: number
  rustdeskId: string | null
  rustdeskPassword: string | null
  screenshot: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CompanyContact {
  id: string
  companyId: string
  unitId: string | null
  name: string
  roleTitle: string | null
  department: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  contactType: string
  receivesNotifications: boolean
  receivesSlaAlerts: boolean
  onCall: boolean
  notes: string | null
  active: boolean
}

export interface CompanyContext {
  id: string
  name: string
  tradeName: string | null
  product: string | null
  hasPdv: boolean
  serverName: string | null
  serverType: string | null
  operationType: string | null
  slaContract: { id: string; name: string; tier: string } | null
  units: Array<{ id: string; name: string; city: string | null; state: string | null }>
  contacts: Array<{ id: string; name: string; contactType: string; phone: string | null; whatsapp: string | null; email: string | null }>
  activeTicketsCount: number
}

export interface HealthScore {
  score: number
  [key: string]: unknown
}

// ─── API client ───────────────────────────────────────────────────────────────

/** Pessoa cadastrada de um cliente, como `GET /admin/client-users` devolve. */
export interface ClienteCadastrado {
  id: string
  name: string
  whatsapp: string
  email: string | null
  roleTitle: string | null
  companyId: string | null
  companyName: string | null
  unitId: string | null
  unitName: string | null
}

/**
 * Procura a pessoa pelo WhatsApp — o caminho inverso do seletor de empresa,
 * que preenche o telefone depois de escolher o contato.
 *
 * O atendente costuma ter só o número: é com ele que o cliente aparece. Sem
 * isto, era preciso adivinhar a empresa para então achar a pessoa
 * (TCK000675 3.14). A rota compara os últimos 11 dígitos, então funciona com
 * ou sem código do país.
 */
export async function procurarClientePorWhatsapp(telefone: string): Promise<ClienteCadastrado[]> {
  const digitos = String(telefone || '').replace(/\D/g, '')
  // Abaixo de 10 dígitos ainda não é número para procurar: pesquisar a cada
  // tecla devolveria meia agenda.
  if (digitos.length < 10) return []
  const r = await api.get<{ data?: ClienteCadastrado[] }>(
    `/api/admin/client-users?whatsapp=${encodeURIComponent(digitos)}`,
  )
  return r?.data ?? []
}

export const companiesApi = {
  /**
   * GET /api/admin/companies — lista o CADASTRO de empresas.
   *
   * Duas correções moram aqui:
   *
   * 1. O padrão da rota é 50, e a tabela tem 142 linhas: quem não pedisse
   *    limite via um terço e concluía que o cliente não existia. Pedimos tudo
   *    salvo quando o chamador disser outra coisa.
   *
   * 2. Das 142, só 20 são cadastro. As outras 122 têm `synced_from_tickets` —
   *    vieram de uma carga que varreu o texto livre do campo Empresa de
   *    chamados antigos, e são legado: servem para o histórico continuar
   *    legível, não para escolher. O corte é aqui, e não em cada tela, porque
   *    é regra do sistema: senão a próxima tela que listar empresa traz o lixo
   *    de volta sem ninguém perceber. Ver lib/empresas.ts.
   *
   * Quem precisa das duas faixas — só a administração de Empresas — pede
   * explicitamente com `incluirLegado: true`.
   */
  list: (params?: { search?: string; limit?: number; incluirLegado?: boolean }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set('search', params.search)
    qs.set('limit', String(params?.limit ?? 1000))
    const query = qs.toString()
    return api
      .get<{ success: boolean; data: Company[] }>(
        `/api/admin/companies${query ? `?${query}` : ''}`
      )
      .then((r) =>
        params?.incluirLegado
          ? r
          : { ...r, data: (r.data ?? []).filter((c) => ehCadastrada(c as EmpresaBruta)) },
      )
  },

  /** GET /api/admin/companies/[id] */
  getById: (id: string) =>
    api.get<{ success: boolean; data: Company }>(`/api/admin/companies/${id}`),

  /** POST /api/admin/companies */
  create: (data: Omit<Company, 'id' | 'active' | 'group' | '_count'>) =>
    api.post<{ success: boolean; data: Company }>('/api/admin/companies', data),

  /** PATCH /api/admin/companies/[id] */
  patch: (id: string, data: Partial<Company> & Record<string, unknown>) =>
    api.patch<{ success: boolean; data: Company }>(`/api/admin/companies/${id}`, data),

  /** DELETE /api/admin/companies/[id] — desativa */
  deactivate: (id: string) =>
    api.delete<{ success: boolean }>(`/api/admin/companies/${id}`),

  /** GET /api/admin/companies/[id]/context */
  getContext: (id: string) =>
    api.get<{ success: boolean; data: CompanyContext }>(`/api/admin/companies/${id}/context`),

  // ── Units ──────────────────────────────────────────────────────────────────

  /** GET /api/admin/companies/[id]/units */
  listUnits: (companyId: string) =>
    api.get<{ success: boolean; data: CompanyUnit[] }>(`/api/admin/companies/${companyId}/units`),

  /** POST /api/admin/companies/[id]/units */
  createUnit: (companyId: string, data: Omit<CompanyUnit, 'id' | 'companyId' | 'active'>) =>
    api.post<{ success: boolean; data: CompanyUnit }>(`/api/admin/companies/${companyId}/units`, data),

  /** PUT /api/admin/companies/[id]/units/[unitId] */
  updateUnit: (companyId: string, unitId: string, data: Partial<CompanyUnit>) =>
    api.put<{ success: boolean; data: CompanyUnit }>(`/api/admin/companies/${companyId}/units/${unitId}`, data),

  /** DELETE /api/admin/companies/[id]/units/[unitId] */
  deleteUnit: (companyId: string, unitId: string) =>
    api.delete<{ success: boolean }>(`/api/admin/companies/${companyId}/units/${unitId}`),

  // ── Caixas ─────────────────────────────────────────────────────────────────

  /** GET /api/admin/companies/[id]/units/[unitId]/caixas */
  listCaixas: (companyId: string, unitId: string) =>
    api.get<{ success: boolean; data: UnitCaixa[] }>(`/api/admin/companies/${companyId}/units/${unitId}/caixas`),

  /** POST /api/admin/companies/[id]/units/[unitId]/caixas */
  createCaixa: (companyId: string, unitId: string, data: { numero: number; rustdeskId?: string | null; rustdeskPassword?: string | null; screenshot?: string | null }) =>
    api.post<{ success: boolean; data: UnitCaixa }>(`/api/admin/companies/${companyId}/units/${unitId}/caixas`, data),

  /** POST /api/admin/companies/[id]/units/[unitId]/caixas/bulk */
  createCaixasBulk: (companyId: string, unitId: string, items: Array<{ numero: number; rustdeskId?: string | null; rustdeskPassword?: string | null }>) =>
    api.post<{ success: boolean; data: { count: number } }>(`/api/admin/companies/${companyId}/units/${unitId}/caixas/bulk`, { items }),

  /** PUT /api/admin/companies/[id]/units/[unitId]/caixas/[caixaId] */
  updateCaixa: (companyId: string, unitId: string, caixaId: string, data: Partial<UnitCaixa>) =>
    api.put<{ success: boolean; data: UnitCaixa }>(`/api/admin/companies/${companyId}/units/${unitId}/caixas/${caixaId}`, data),

  /** DELETE /api/admin/companies/[id]/units/[unitId]/caixas/[caixaId] */
  deleteCaixa: (companyId: string, unitId: string, caixaId: string) =>
    api.delete<{ success: boolean }>(`/api/admin/companies/${companyId}/units/${unitId}/caixas/${caixaId}`),

  // ── Whatsapps ──────────────────────────────────────────────────────────────

  listWhatsapps: (companyId: string, unitId: string) =>
    api.get<{ success: boolean; data: UnitSolicitante[] }>(`/api/admin/companies/${companyId}/units/${unitId}/whatsapps`),

  createWhatsapp: (companyId: string, unitId: string, data: { nome: string; cargo?: string | null; whatsapp: string }) =>
    api.post<{ success: boolean; data: UnitSolicitante }>(`/api/admin/companies/${companyId}/units/${unitId}/whatsapps`, data),

  updateWhatsapp: (companyId: string, unitId: string, whatsappId: string, data: Partial<UnitSolicitante>) =>
    api.put<{ success: boolean; data: UnitSolicitante }>(`/api/admin/companies/${companyId}/units/${unitId}/whatsapps/${whatsappId}`, data),

  deleteWhatsapp: (companyId: string, unitId: string, whatsappId: string) =>
    api.delete<{ success: boolean }>(`/api/admin/companies/${companyId}/units/${unitId}/whatsapps/${whatsappId}`),

  // ── Contacts ───────────────────────────────────────────────────────────────

  /** GET /api/admin/companies/[id]/contacts */
  listContacts: (companyId: string) =>
    api.get<{ success: boolean; data: CompanyContact[] }>(`/api/admin/companies/${companyId}/contacts`),

  /** POST /api/admin/companies/[id]/contacts */
  createContact: (companyId: string, data: Omit<CompanyContact, 'id' | 'companyId' | 'active'>) =>
    api.post<{ success: boolean; data: CompanyContact }>(`/api/admin/companies/${companyId}/contacts`, data),

  /** PUT /api/admin/companies/[id]/contacts/[contactId] */
  updateContact: (companyId: string, contactId: string, data: Partial<CompanyContact>) =>
    api.put<{ success: boolean; data: CompanyContact }>(`/api/admin/companies/${companyId}/contacts/${contactId}`, data),

  /** DELETE /api/admin/companies/[id]/contacts/[contactId] */
  deleteContact: (companyId: string, contactId: string) =>
    api.delete<{ success: boolean }>(`/api/admin/companies/${companyId}/contacts/${contactId}`),

  // ── Health score ───────────────────────────────────────────────────────────

  /** GET /api/admin/companies/[id]/health-score */
  getHealthScore: (id: string) =>
    api.get<{ success: boolean; data: HealthScore | null }>(`/api/admin/companies/${id}/health-score`),

  /** POST /api/admin/companies/[id]/health-score — força recalculo */
  recalcHealthScore: (id: string) =>
    api.post<{ success: boolean; data: HealthScore | null }>(`/api/admin/companies/${id}/health-score`),
}
