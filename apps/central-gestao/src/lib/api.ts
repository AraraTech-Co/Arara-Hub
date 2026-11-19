/**
 * Cliente da Central de Gestão. Entrada só pelo Hub (SSO); chama a própria API
 * só com o JWT da pessoa — nunca com chave de app.
 */
const API = (import.meta.env.VITE_ARARA_API_URL ?? '').replace(/\/$/, '')
const SLUG = import.meta.env.VITE_ARARA_APP_SLUG || 'central-gestao'
const JWT_KEY = 'arara_jwt'

export const HUB_URL = 'https://hub.arara-tech.com'

export type Status = 'para_decidir' | 'em_andamento' | 'aguardando' | 'concluido'
export const STATUS: { id: Status; nome: string }[] = [
  { id: 'para_decidir', nome: 'Para decidir' },
  { id: 'em_andamento', nome: 'Em andamento' },
  { id: 'aguardando', nome: 'Aguardando' },
  { id: 'concluido', nome: 'Concluído' },
]
export const ORIGENS = [
  { id: 'reuniao', nome: 'Reunião' },
  { id: 'area', nome: 'Área' },
  { id: 'outro', nome: 'Outro' },
]

export type Cartao = {
  id: string
  titulo: string
  descricao: string | null
  status: Status
  responsavel_id: string | null
  prazo: string | null
  origem_tipo: string | null
  origem_texto: string | null
  referencia_url: string | null
  decisao: string | null
  criado_por: string
  criado_em: string
  alterado_por: string
  alterado_em: string
  concluido_em: string | null
  arquivado: boolean
  arquivado_em: string | null
  versao: number
  vencido: boolean
}

export type Evento = {
  id: string
  tipo: 'criado' | 'edicao' | 'status' | 'arquivado' | 'restaurado'
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  autor_id: string
  em: string
}

export type Membro = { id: string; name: string }
export type Eu = { id: string; name: string; role: 'membro' | 'admin' }

export class ErroApi extends Error {
  status: number
  codigo: string
  corpo: Record<string, unknown>
  constructor(status: number, corpo: Record<string, unknown>) {
    super(typeof corpo.mensagem === 'string' ? corpo.mensagem : `Erro ${status}`)
    this.status = status
    this.codigo = typeof corpo.erro === 'string' ? corpo.erro : ''
    this.corpo = corpo
  }
}

export function token(): string | null {
  try {
    return localStorage.getItem(JWT_KEY)
  } catch {
    return null
  }
}

export function sair() {
  try {
    localStorage.removeItem(JWT_KEY)
  } catch {
    /* noop */
  }
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const t = token()
  if (t) headers.set('Authorization', `Bearer ${t}`)
  if (init?.body) headers.set('Content-Type', 'application/json')
  let res: Response
  try {
    res = await fetch(`${API}/v1/r/${SLUG}${caminho}`, { ...init, headers })
  } catch {
    throw new ErroApi(0, { erro: 'rede', mensagem: 'Sem conexão com o servidor. Tente de novo.' })
  }
  const corpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErroApi(res.status, corpo && typeof corpo === 'object' ? corpo : {})
  return corpo as T
}

export type Filtros = {
  status?: string
  responsavel?: string
  vencidos?: boolean
  q?: string
  arquivados?: boolean
}

export type Indicador = {
  metric_key: string
  label: string
  unit: string
  value: number | null
  tipo: 'agora' | 'periodo'
  source_key: string
  source_label: string
  universe: string
  period_start: string | null
  period_end: string | null
  timezone: string
  snapshot_at: string | null
  last_success_at: string | null
  fetched_at: string
  state: string
  reason_code: string | null
}
export type Area = { area_key: string; label: string; state: string; reason_code: string | null; indicadores: Indicador[] }
export type Resumo = { gerado_em: string; timezone: string; periodo: { inicio: string; fim: string; mes: string }; areas: Area[] }

export type StatusMkt = 'planejado' | 'em_andamento' | 'concluido' | 'cancelado'
export const STATUS_MKT: { id: StatusMkt; nome: string }[] = [
  { id: 'planejado', nome: 'Planejado' },
  { id: 'em_andamento', nome: 'Em andamento' },
  { id: 'concluido', nome: 'Concluído' },
  { id: 'cancelado', nome: 'Cancelado' },
]
export type RegistroMkt = {
  id: string
  titulo: string
  descricao: string | null
  status: StatusMkt
  responsavel_id: string | null
  data_referencia: string | null
  criado_por: string
  criado_em: string
  alterado_por: string
  alterado_em: string
  versao: number
}

export const api = {
  eu: () => chamar<Eu>('/me'),
  async marketing(f: { status?: string; q?: string }): Promise<{ itens: RegistroMkt[]; total: number; incompleto: boolean }> {
    const itens: RegistroMkt[] = []
    let offset: number | null = 0
    let total = 0
    let incompleto = false
    while (offset !== null) {
      const qs = new URLSearchParams()
      if (f.status) qs.set('status', f.status)
      if (f.q?.trim()) qs.set('q', f.q.trim())
      if (offset) qs.set('offset', String(offset))
      const r: { itens: RegistroMkt[]; total: number; proximo_offset: number | null; incompleto?: boolean } =
        await chamar(`/marketing?${qs.toString()}`)
      itens.push(...r.itens)
      total = r.total
      incompleto = incompleto || !!r.incompleto
      offset = r.proximo_offset
    }
    return { itens, total, incompleto }
  },
  criarMkt: (dados: Record<string, unknown>) =>
    chamar<{ registro: RegistroMkt }>('/marketing', { method: 'POST', body: JSON.stringify(dados) }),
  editarMkt: (id: string, dados: Record<string, unknown>) =>
    chamar<{ registro: RegistroMkt }>(`/marketing/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(dados) }),
  resumo: (mes?: string) => chamar<Resumo>(`/resumo${mes ? `?mes=${encodeURIComponent(mes)}` : ''}`),
  membros: () => chamar<Membro[]>('/membros'),
  async cartoes(f: Filtros): Promise<{ itens: Cartao[]; total: number; incompleto: boolean }> {
    const itens: Cartao[] = []
    let offset: number | null = 0
    let total = 0
    let incompleto = false
    while (offset !== null) {
      const qs = new URLSearchParams()
      if (f.status) qs.set('status', f.status)
      if (f.responsavel) qs.set('responsavel', f.responsavel)
      if (f.vencidos) qs.set('vencidos', '1')
      if (f.q?.trim()) qs.set('q', f.q.trim())
      if (f.arquivados) qs.set('arquivados', '1')
      if (offset) qs.set('offset', String(offset))
      const r: { itens: Cartao[]; total: number; proximo_offset: number | null; incompleto?: boolean } =
        await chamar(`/cartoes?${qs.toString()}`)
      itens.push(...r.itens)
      total = r.total
      incompleto = incompleto || !!r.incompleto
      offset = r.proximo_offset
    }
    return { itens, total, incompleto }
  },
  criar: (dados: Record<string, unknown>) =>
    chamar<{ cartao: Cartao; historico_incompleto?: boolean }>('/cartoes', {
      method: 'POST',
      body: JSON.stringify(dados),
    }),
  editar: (id: string, dados: Record<string, unknown>) =>
    chamar<{ cartao: Cartao; historico_incompleto?: boolean }>(`/cartoes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(dados),
    }),
  arquivar: (id: string) =>
    chamar<{ cartao: Cartao }>(`/cartoes/${encodeURIComponent(id)}/arquivar`, { method: 'POST' }),
  restaurar: (id: string) =>
    chamar<{ cartao: Cartao }>(`/cartoes/${encodeURIComponent(id)}/restaurar`, { method: 'POST' }),
  eventos: (id: string) => chamar<{ itens: Evento[] }>(`/cartoes/${encodeURIComponent(id)}/eventos`),
}

/**
 * Entrada vinda do Hub: `/sso/?c=<id.verificador>`. Troca o código pelo JWT e
 * guarda só o JWT. Roda antes do React montar.
 */
export async function consumirSsoDoHub(): Promise<void> {
  const { search, pathname } = window.location
  if (!/\/sso\/?$/.test(pathname) && !/[?&](c|codigo)=/.test(search)) return
  const p = new URLSearchParams(search)
  const codigo = p.get('c') || p.get('codigo') || ''
  try {
    if (codigo) {
      const res = await fetch(`${API}/v1/r/arara-hub/sso/trocar?token=arara-hub-troca-publica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const corpo = await res.json().catch(() => ({}))
      if (res.ok && typeof corpo?.token === 'string') localStorage.setItem(JWT_KEY, corpo.token)
    }
  } catch {
    /* cai na tela de "entrar pelo Hub" */
  } finally {
    try {
      window.history.replaceState(null, '', '/')
    } catch {
      /* noop */
    }
  }
}

/** Data AAAA-MM-DD → DD/MM/AAAA, sem passar por fuso. */
export function dataBr(d: string | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
}

export function instanteBr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

export function novaChave(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
