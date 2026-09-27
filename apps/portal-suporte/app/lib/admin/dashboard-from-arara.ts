import { formatDateShort } from '@/lib/utils'
import type { MyTicket } from '@/components/admin/my-operation-section'
import type { OperationalAlertItem } from '@/components/admin/manual-alerts-section'

export type RecentPage = { href: string; label: string; visitedAt: string }

type Rec = Record<string, unknown>

const ACTIVE = [
  'novos_chamados',
  'triagem',
  'em_atendimento',
  'em_teste',
  'aguardando_cliente',
  'pendencia_suporte',
  'pendencia_dev',
]

const RESOLVED = [
  'resolvido',
  'resolvido_com_manual',
  'resolvido_sem_manual',
  'post_mortem',
  'fechado',
]

const CLOSED_FOR_MY = [
  'resolvido',
  'resolvido_com_manual',
  'resolvido_sem_manual',
  'post_mortem',
  'cancelado',
  'migracao_concluida',
  'fechado',
]

// Inclui `support`: é o agente de suporte, e sem ele as métricas por agente
// ignoravam 7 dos 11 perfis. Ver lib/arara/auth-storage.ts.
const STAFF_ROLES = ['support', 'developer', 'admin', 'master']

function str(v: unknown, fallback = ''): string {
  if (v == null) return fallback
  return String(v)
}

function optStr(v: unknown): string | null {
  if (v == null || v === '') return null
  return String(v)
}

function asDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

function ticketCreatedAt(t: Rec): Date {
  return asDate(t.created_at) ?? asDate(t.createdAt) ?? new Date(0)
}

function ticketUpdatedAt(t: Rec): Date {
  return asDate(t.updated_at) ?? asDate(t.updatedAt) ?? ticketCreatedAt(t)
}

function assigneeId(t: Rec): string | null {
  return optStr(t.assigned_to) ?? optStr(t.assignedTo)
}

function profileName(p: Rec): string {
  return str(p.full_name || p.fullName || p.name || p.email || 'Agente')
}

function profileEmail(p: Rec): string {
  return str(p.email)
}

function profileRole(p: Rec): string {
  return str(p.role || p.role_title || 'user')
}

function isStaffProfile(p: Rec): boolean {
  if (STAFF_ROLES.includes(profileRole(p))) return true
  const pos = str(p.position).toLowerCase()
  return pos.includes('agente') || pos.includes('support') || pos.includes('suporte')
}

/** SLA deadline if present on the record (embedded or flat). */
function resolutionDeadline(t: Rec): Date | null {
  const sla = (t.slaTracking || t.sla_tracking || t.sla) as Rec | null | undefined
  if (sla && typeof sla === 'object') {
    return asDate(sla.resolutionDeadline ?? sla.resolution_deadline)
  }
  return asDate(t.resolution_deadline ?? t.resolutionDeadline)
}

function slaResolvedAt(t: Rec): Date | null {
  const sla = (t.slaTracking || t.sla_tracking || t.sla) as Rec | null | undefined
  if (sla && typeof sla === 'object') {
    return asDate(sla.resolvedAt ?? sla.resolved_at)
  }
  return asDate(t.sla_resolved_at)
}

export type AcaoAgoraItem = {
  id: string
  ticketNumber: string | null
  title: string
  companyName: string | null
  status: string
  priority: string
  /** Nome de quem atende, ou null quando ninguém pegou — o pior caso da fila. */
  assigneeName: string | null
  idadeHoras: number
  mensagens: number
  parado: boolean
  meu: boolean
}

export type Sinais = {
  semDono: number
  semDonoHoras: number
  urgentes: number
  urgentesParados: number
  ativos: number
  abertosHoje: number
  abertosOntem: number
  resolvidosHoje: number
  esperaMedianaHoras: number
  esperaPiorHoras: number
  reabertos7d: number
  reabertos7dEmpresas: number
}

export type DashboardDerived = {
  session: { userId: string; role: string }
  stats: {
    total: number
    active: number
    resolved: number
    unassigned: number
    urgent: number
    slaBreached: number
    slaWarning: number
    openedToday: number
    resolvedToday: number
    openedYesterday: number
    csatAvg: number | null
    csatCount: number
  }
  chartData: { label: string; count: number }[]
  /** Chamados em aberto por faixa de idade. Substitui o SLA como sinal de
      urgência: o SLA cobre 4 dos 454; a idade, todos. */
  ageDist: { label: string; value: number; token: string }[]
  /** Fila em aberto, na ordem das colunas do Kanban. Nunca inclui resolvidos. */
  queueDist: { label: string; value: number; token: string }[]
  statusDist: { label: string; value: number; color: string }[]
  priorityDist: { label: string; value: number; color: string }[]
  agentWorkload: {
    id: string
    full_name: string
    email: string
    total: number
    urgent: number
    breached: number
  }[]
  urgentTickets: Rec[]
  tickets: Rec[]
  agents: Rec[]
  stalledTickets: { id: string; title: string; ticket_number?: string | null; status?: string }[]
  recurringCompanies: { company_cnpj: string; company_name: string | null; ticket_count: number }[]
  reopenedTickets: { id: string; title: string; ticket_number?: string | null; status?: string }[]
  activeAlerts: OperationalAlertItem[]
  myTickets: MyTicket[]
  /** A lista com a qual se trabalha: o que exige ação da EQUIPE, não só minha. */
  acaoAgora: AcaoAgoraItem[]
  /** Os sete sinais da faixa superior, todos derivados do que já vem na resposta. */
  sinais: Sinais
  activeIncidentsCount: number
  recentPages: RecentPage[]
}

export function deriveDashboardFromArara(input: {
  tickets: Rec[]
  profiles: Rec[]
  incidents?: Rec[]
  userId: string
  userEmail?: string | null
  userRole?: string
  recentPages?: RecentPage[]
  now?: Date
}): DashboardDerived {
  const now = input.now ?? new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  const tickets = [...input.tickets].sort(
    (a, b) => ticketCreatedAt(b).getTime() - ticketCreatedAt(a).getTime(),
  )

  const activeTickets = tickets.filter((t) => ACTIVE.includes(str(t.status)))
  const resolvedTickets = tickets.filter((t) => RESOLVED.includes(str(t.status)))

  const slaBreached = activeTickets.filter((t) => {
    const deadline = resolutionDeadline(t)
    return !!(deadline && !slaResolvedAt(t) && deadline < now)
  })
  const slaWarning = activeTickets.filter((t) => {
    const deadline = resolutionDeadline(t)
    return !!(deadline && !slaResolvedAt(t) && deadline > now && deadline <= twoHoursFromNow)
  })

  const openedToday = tickets.filter((t) => ticketCreatedAt(t) >= todayStart).length
  const resolvedToday = tickets.filter(
    (t) => RESOLVED.includes(str(t.status)) && ticketUpdatedAt(t) >= todayStart,
  ).length
  const openedYesterday = tickets.filter((t) => {
    const c = ticketCreatedAt(t)
    return c >= yesterdayStart && c < todayStart
  }).length

  // Agents: staff profiles + anyone with open assignments
  const profileById = new Map(input.profiles.map((p) => [str(p.id), p]))
  const assigneeIds = new Set(
    activeTickets.map((t) => assigneeId(t)).filter((id): id is string => !!id),
  )
  const agentsRaw: Rec[] = []
  const seen = new Set<string>()
  for (const p of input.profiles) {
    const id = str(p.id)
    if (!id || seen.has(id)) continue
    if (isStaffProfile(p) || assigneeIds.has(id)) {
      agentsRaw.push(p)
      seen.add(id)
    }
  }
  for (const id of assigneeIds) {
    if (seen.has(id)) continue
    agentsRaw.push({ id, full_name: `Agente ${id.slice(0, 8)}`, email: '', role: 'user' })
    seen.add(id)
  }

  const agentWorkload = agentsRaw
    .map((agent) => {
      const id = str(agent.id)
      const assigned = activeTickets.filter((t) => assigneeId(t) === id)
      const urgent = assigned.filter((t) => t.priority === 'urgent').length
      const breached = assigned.filter((t) => {
        const deadline = resolutionDeadline(t)
        return !!(deadline && !slaResolvedAt(t) && deadline < now)
      }).length
      return {
        id,
        full_name: profileName(agent),
        email: profileEmail(agent),
        total: assigned.length,
        urgent,
        breached,
      }
    })
    .sort((a, b) => b.total - a.total)

  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (6 - i))
    d.setHours(0, 0, 0, 0)
    const nextD = new Date(d)
    nextD.setDate(nextD.getDate() + 1)
    const count = tickets.filter((t) => {
      const c = ticketCreatedAt(t)
      return c >= d && c < nextD
    }).length
    return {
      label: formatDateShort(d, { weekday: 'short', day: 'numeric' }),
      count,
    }
  })

  // ── Fila x histórico ───────────────────────────────────────────────────────
  //
  // `statusDist` misturava Resolvidos com as colunas ativas, e quem consumia
  // somava tudo: o painel anunciava "Fila por Status — 454 ativos" quando havia
  // 76. O mesmo array alimentava a rosca, que ficava 83% verde e dizia "está
  // tudo bem" independentemente do estado da fila.
  //
  // A ordem aqui é a ordem REAL das colunas do Kanban, não ordem de contagem:
  // é o que permite ler a fila como um caminho e enxergar onde ela entope.
  // A cor sai do token de cada status (ver styles/status.css) em vez de hex
  // fixo — assim a cor do painel é a mesma que a pessoa já leu no quadro.
  const COLUNAS: Array<{ label: string; status: string[]; token: string }> = [
    { label: 'Backlog',      status: ['novos_chamados'],                       token: 'backlog' },
    { label: 'Triagem',      status: ['triagem'],                              token: 'triage' },
    { label: 'Atendimento',  status: ['em_atendimento'],                       token: 'in-progress' },
    { label: 'Pendência',    status: ['pendencia_suporte', 'pendencia_dev'],    token: 'pending' },
    { label: 'Cliente',      status: ['aguardando_cliente'],                   token: 'waiting' },
    { label: 'Em Teste',     status: ['em_teste'],                             token: 'testing' },
  ]

  /** Só o que está em aberto — a fila de verdade. */
  const queueDist = COLUNAS.map((c) => ({
    label: c.label,
    value: tickets.filter((t) => c.status.includes(str(t.status))).length,
    token: c.token,
  }))

  /** Mantido para a rosca da aba de análise, onde o total inclui histórico
      de propósito. Nunca some este array para dizer "ativos". */
  const statusDist = [
    ...queueDist.filter((d) => d.value > 0).map((d) => ({ label: d.label, value: d.value, color: `var(--status-${d.token})` })),
    { label: 'Resolvidos', value: resolvedTickets.length, color: 'var(--status-resolved)' },
  ]

  const priorityDist = [
    {
      label: '🔴 Muito alta',
      value: tickets.filter((t) => t.priority === 'urgent').length,
      color: '#ef4444',
    },
    {
      label: '🟠 Alta',
      value: tickets.filter((t) => t.priority === 'high').length,
      color: '#f97316',
    },
    {
      label: '🔵 Média',
      value: tickets.filter((t) => t.priority === 'medium').length,
      color: '#3b82f6',
    },
    {
      label: '⚪ Baixa',
      value: tickets.filter((t) => t.priority === 'low').length,
      color: '#94a3b8',
    },
    {
      label: '▫️ Muito baixa',
      value: tickets.filter((t) => t.priority === 'very_low').length,
      color: '#cbd5e1',
    },
  ].filter((p) => p.value > 0)

  const urgentTickets = activeTickets
    .filter((t) => t.priority === 'urgent' || t.priority === 'high')
    .slice(0, 10)
    .map((t) => {
      const aid = assigneeId(t)
      const assignee = aid ? profileById.get(aid) : undefined
      const deadline = resolutionDeadline(t)
      return {
        id: str(t.id),
        title: str(t.title),
        status: str(t.status),
        priority: str(t.priority),
        ticket_number: optStr(t.ticket_number ?? t.ticketNumber),
        company_name: optStr(t.company_name ?? t.companyName),
        assignee: assignee ? { full_name: profileName(assignee) } : null,
        created_at: ticketCreatedAt(t).toISOString(),
        sla_breached: !!(deadline && !slaResolvedAt(t) && deadline < now),
      }
    })

  const ticketsSerialized = tickets.map((t) => {
    const aid = assigneeId(t)
    const assignee = aid ? profileById.get(aid) : undefined
    const creatorId = optStr(t.user_id ?? t.userId)
    const creator = creatorId ? profileById.get(creatorId) : undefined
    return {
      id: str(t.id),
      title: str(t.title),
      status: str(t.status),
      priority: str(t.priority),
      category: optStr(t.category),
      ticket_number: optStr(t.ticket_number ?? t.ticketNumber),
      is_public: Boolean(t.is_public ?? t.isPublic),
      company_name: optStr(t.company_name ?? t.companyName),
      contact_email: optStr(t.contact_email ?? t.contactEmail),
      created_at: ticketCreatedAt(t).toISOString(),
      updated_at: ticketUpdatedAt(t).toISOString(),
      user: creator
        ? { id: str(creator.id), full_name: profileName(creator), email: profileEmail(creator) }
        : null,
      assigned_to: assignee
        ? { id: str(assignee.id), full_name: profileName(assignee), email: profileEmail(assignee) }
        : aid
          ? { id: aid, full_name: `Agente ${aid.slice(0, 8)}`, email: '' }
          : null,
    }
  })

  const agentsSerialized = agentsRaw.map((a) => ({
    id: str(a.id),
    full_name: profileName(a),
    email: profileEmail(a),
    role: profileRole(a),
  }))

  // CSAT: ratings embedded on tickets if present
  const csatScores = tickets
    .map((t) => {
      const rating = t.rating as Rec | number | null | undefined
      if (typeof rating === 'number') return rating
      if (rating && typeof rating === 'object') {
        const score = rating.score
        return typeof score === 'number' ? score : null
      }
      const flat = t.csat_score ?? t.rating_score
      return typeof flat === 'number' ? flat : null
    })
    .filter((n): n is number => n != null)
  const csatAvg = csatScores.length
    ? Math.round((csatScores.reduce((s, n) => s + n, 0) / csatScores.length) * 10) / 10
    : null

  // Stalled: active, no update in 24h (activity_log unavailable on platform)
  const stalledTickets = activeTickets
    .filter((t) => ticketUpdatedAt(t) < dayAgo)
    .sort((a, b) => ticketCreatedAt(a).getTime() - ticketCreatedAt(b).getTime())
    .slice(0, 10)
    .map((t) => ({
      id: str(t.id),
      title: str(t.title),
      ticket_number: optStr(t.ticket_number ?? t.ticketNumber),
      status: str(t.status),
    }))

  // Recurring companies this month (3+)
  const byCompany = new Map<string, { company_cnpj: string; company_name: string | null; ticket_count: number }>()
  for (const t of tickets) {
    if (ticketCreatedAt(t) < monthStart) continue
    const cnpj = optStr(t.company_cnpj ?? t.companyCnpj)
    if (!cnpj) continue
    const cur = byCompany.get(cnpj)
    if (cur) cur.ticket_count += 1
    else {
      byCompany.set(cnpj, {
        company_cnpj: cnpj,
        company_name: optStr(t.company_name ?? t.companyName),
        ticket_count: 1,
      })
    }
  }
  const recurringCompanies = [...byCompany.values()]
    .filter((c) => c.ticket_count >= 3)
    .sort((a, b) => b.ticket_count - a.ticket_count)
    .slice(0, 5)

  // My tickets: match profile by email → assigned_to, else userId
  const email = (input.userEmail || '').toLowerCase()
  const myProfile = email
    ? input.profiles.find((p) => profileEmail(p).toLowerCase() === email)
    : undefined
  const myAssigneeIds = new Set<string>([input.userId])
  if (myProfile) myAssigneeIds.add(str(myProfile.id))

  // ── Idade do chamado ───────────────────────────────────────────────────────
  //
  // Substitui o SLA como sinal de urgência no painel. Motivo factual: o SLA
  // existe para 4 dos 454 chamados, então um painel construído em cima dele
  // fala sobre 0,9% do trabalho. `created_at` existe para todos, já é
  // calculado aqui e até então só servia para ordenar.
  //
  // Os cortes seguem o turno de quem atende, não potências de dez: até 4h é o
  // mesmo turno; até 24h é "chegou ontem"; 1–3 dias já atravessou dias; acima
  // de 3 dias é o que ninguém está olhando.
  const FAIXAS = [
    { label: 'Até 4h',   ate: 4,        token: 'p3' },
    { label: '4h a 1d',  ate: 24,       token: 'p2' },
    { label: '1 a 3 dias', ate: 72,     token: 'p1' },
    { label: 'Mais de 3 dias', ate: Infinity, token: 'p0' },
  ]
  const horasDe = (t: Rec) => (now.getTime() - ticketCreatedAt(t).getTime()) / 3600000

  const ageDist = FAIXAS.map((f, i) => {
    const desde = i === 0 ? 0 : FAIXAS[i - 1].ate
    return {
      label: f.label,
      token: f.token,
      value: activeTickets.filter((t) => {
        const h = horasDe(t)
        return h >= desde && h < f.ate
      }).length,
    }
  })

  /**
   * "Meus chamados" inclui aquilo em que sou CORRESPONSÁVEL, não só o que
   * está no meu nome. `envolvidos` (responsável + corresponsáveis) vem pronto
   * de `GET /tickets` — a mesma lista que o filtro por pessoa do quadro usa,
   * de propósito: duas definições de "meus chamados" divergiriam no primeiro
   * ajuste. Sem isto, quem entra como corresponsável não vê o chamado em
   * lugar nenhum do painel e depende de alguém avisar no corredor.
   */
  const souEnvolvido = (t: Rec): boolean => {
    const lista = Array.isArray(t.envolvidos) ? t.envolvidos : []
    if (lista.some((id) => myAssigneeIds.has(str(id)))) return true
    const aid = assigneeId(t)
    return !!aid && myAssigneeIds.has(aid)
  }

  const myTickets: MyTicket[] = tickets
    .filter((t) => {
      if (!souEnvolvido(t)) return false
      return !CLOSED_FOR_MY.includes(str(t.status))
    })
    .sort((a, b) => ticketCreatedAt(a).getTime() - ticketCreatedAt(b).getTime())
    .map((t) => {
      const deadline = resolutionDeadline(t)
      const breached = !!(deadline && !slaResolvedAt(t) && deadline < now)
      const warning = !!(deadline && !slaResolvedAt(t) && deadline > now && deadline <= twoHoursFromNow)
      return {
        id: str(t.id),
        title: str(t.title),
        ticketNumber: optStr(t.ticket_number ?? t.ticketNumber),
        status: str(t.status),
        priority: str(t.priority || 'medium'),
        companyName: optStr(t.company_name ?? t.companyName),
        slaBreached: breached,
        slaWarning: warning,
        resolutionDeadline: deadline?.toISOString() ?? null,
        /** Horas desde a abertura — existe para todos os chamados. */
        idadeHoras: Math.max(0, Math.round(horasDe(t))),
      }
    })

  // ─── Ação agora + sinais ───────────────────────────────────────────────
  //
  // O painel mostrava quatro números grandes e a MINHA lista. Faltava a lista
  // da EQUIPE: o que está sem dono, urgente ou envelhecendo — que é o que se
  // olha às 8h para decidir por onde começar. Tudo abaixo sai dos chamados que
  // já vieram na resposta; nenhuma chamada nova.

  const contaMensagens = (t: Rec): number => {
    const v = t.message_count ?? t.messageCount ?? t.messages_count
    if (typeof v === 'number') return v
    if (Array.isArray(t.messages)) return t.messages.length
    return 0
  }

  /** Parado = sem atualização há mais de 24h e ainda ativo. */
  const estaParado = (t: Rec) =>
    (now.getTime() - ticketUpdatedAt(t).getTime()) / 3600000 > 24

  const acaoAgora: AcaoAgoraItem[] = activeTickets
    .filter((t) => {
      const semDono = !assigneeId(t)
      const urgente = str(t.priority) === 'urgent'
      return semDono || urgente || estaParado(t)
    })
    // Sem dono primeiro, depois o mais velho. Quem não tem responsável é o
    // único caso em que ninguém vai olhar por conta própria.
    .sort((a, b) => {
      const semA = assigneeId(a) ? 1 : 0
      const semB = assigneeId(b) ? 1 : 0
      if (semA !== semB) return semA - semB
      return ticketCreatedAt(a).getTime() - ticketCreatedAt(b).getTime()
    })
    .map((t) => {
      const aid = assigneeId(t)
      const assignee = aid ? profileById.get(aid) : undefined
      return {
        id: str(t.id),
        ticketNumber: optStr(t.ticket_number ?? t.ticketNumber),
        title: str(t.title),
        companyName: optStr(t.company_name ?? t.companyName),
        status: str(t.status),
        priority: str(t.priority || 'medium'),
        assigneeName: assignee ? profileName(assignee) : null,
        idadeHoras: Math.max(0, Math.round(horasDe(t))),
        mensagens: contaMensagens(t),
        parado: estaParado(t),
        meu: souEnvolvido(t),
      }
    })

  /** Mediana, não média: um chamado esquecido há 40 dias desloca a média e
      não desloca a mediana. A pergunta é "como está a fila", não "qual a soma". */
  const idadesAtivas = activeTickets.map(horasDe).sort((a, b) => a - b)
  const mediana =
    idadesAtivas.length === 0
      ? 0
      : idadesAtivas.length % 2
        ? idadesAtivas[(idadesAtivas.length - 1) / 2]
        : (idadesAtivas[idadesAtivas.length / 2 - 1] + idadesAtivas[idadesAtivas.length / 2]) / 2

  const semDonoLista = activeTickets.filter((t) => !assigneeId(t))
  const urgentesLista = activeTickets.filter((t) => str(t.priority) === 'urgent')

  const seteDiasAtras = new Date(now.getTime() - 7 * 24 * 3600000)
  const reabertosLista = tickets.filter((t) => {
    const r = t.reopened_at ?? t.reopenedAt
    const d = asDate(r)
    return !!d && d >= seteDiasAtras
  })

  const sinais: Sinais = {
    semDono: semDonoLista.length,
    semDonoHoras: Math.round(Math.max(0, ...semDonoLista.map(horasDe), 0)),
    urgentes: urgentesLista.length,
    urgentesParados: urgentesLista.filter(estaParado).length,
    ativos: activeTickets.length,
    abertosHoje: openedToday,
    abertosOntem: openedYesterday,
    resolvidosHoje: resolvedToday,
    esperaMedianaHoras: Math.round(mediana),
    esperaPiorHoras: Math.round(idadesAtivas.length ? idadesAtivas[idadesAtivas.length - 1] : 0),
    reabertos7d: reabertosLista.length,
    reabertos7dEmpresas: new Set(
      reabertosLista.map((t) => optStr(t.company_cnpj ?? t.companyCnpj)).filter(Boolean),
    ).size,
  }

  const incidents = input.incidents ?? []
  const activeIncidentsCount = incidents.filter((i) => {
    const status = str(i.status).toLowerCase()
    return status && status !== 'resolved' && status !== 'resolvido' && status !== 'closed'
  }).length

  // Recent pages from matching profile if caller didn't pass
  let recentPages = input.recentPages ?? []
  if (!recentPages.length && myProfile) {
    const raw = myProfile.recent_pages ?? myProfile.recentPages
    if (Array.isArray(raw)) {
      recentPages = raw
        .filter((p): p is RecentPage => !!p && typeof p === 'object' && 'href' in p && 'label' in p)
        .map((p) => ({
          href: str((p as RecentPage).href),
          label: str((p as RecentPage).label),
          visitedAt: str((p as RecentPage).visitedAt || new Date().toISOString()),
        }))
    }
  }

  return {
    session: {
      userId: input.userId,
      role: input.userRole || (myProfile ? profileRole(myProfile) : 'user'),
    },
    stats: {
      total: tickets.length,
      active: activeTickets.length,
      resolved: resolvedTickets.length,
      unassigned: activeTickets.filter((t) => !assigneeId(t)).length,
      urgent: tickets.filter((t) => t.priority === 'urgent').length,
      slaBreached: slaBreached.length,
      slaWarning: slaWarning.length,
      openedToday,
      resolvedToday,
      openedYesterday,
      csatAvg,
      csatCount: csatScores.length,
    },
    chartData,
    ageDist,
    queueDist,
    statusDist,
    priorityDist,
    agentWorkload,
    urgentTickets,
    tickets: ticketsSerialized,
    agents: agentsSerialized,
    stalledTickets,
    recurringCompanies,
    reopenedTickets: [],
    // Os avisos são carregados pela própria seção, que tem GET na plataforma e
    // simplesmente nunca o chamava — qualquer aviso criado sumia no F5.
    activeAlerts: [],
    myTickets,
    acaoAgora,
    sinais,
    activeIncidentsCount,
    recentPages,
  }
}

export const RECENT_PAGES_KEY = 'portal-suporte:recent-pages'

export function readRecentPagesFromStorage(): RecentPage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_PAGES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentPage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function pushRecentPageToStorage(page: { href: string; label: string }) {
  if (typeof window === 'undefined') return
  const next: RecentPage = {
    href: page.href,
    label: page.label,
    visitedAt: new Date().toISOString(),
  }
  const prev = readRecentPagesFromStorage().filter((p) => p.href !== next.href)
  const merged = [next, ...prev].slice(0, 8)
  localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(merged))
}
