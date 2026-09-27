'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { PRIORITY_KEYS, PRIORITY_OPTIONS, PRIORITY_RANK, getPriorityEmoji } from '@/lib/ticket-priority';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { KanbanColumn } from './kanban-column';
import { MobileFiltersDrawer } from './mobile-filters-drawer';
import { KanbanCard } from './kanban-card';
import { CreateTicketWizard } from './create-ticket-wizard';
import { PendencyDialog } from './pendency-dialog';
import { PendenciaSubTypeDialog, type PendencySubSelection } from './pendencia-subtype-dialog';
import { MetricsBar } from './metrics-bar';
import { FilterBar } from './filter-bar';
import { SortBar } from './sort-bar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, RefreshCw, CheckSquare, Archive, Users, X,
} from 'lucide-react';
import {
  getKanbanColumnId,
  isSameKanbanColumn,
  PENDENCIA_DB_STATUSES,
  STATUSES_APOSENTADOS,
  statusBelongsToColumn,
} from '@/lib/ticket-status';
import { isValidTransition } from '@/lib/ticket-transitions';
import { verify } from '@/lib/auth';
import { useFilters, type FilterConfig } from '@/hooks/use-filters';
import { ticketsApi } from '@/lib/api/tickets';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bookmark, BookmarkPlus, Trash2, Star } from 'lucide-react';
import type { KanbanTicket, KanbanAgent, KanbanCurrentUser, RawKanbanTicket } from './kanban.types';
import type { TicketStatus, TicketPriority } from '@/db/types';
import { useCompanies } from '@/hooks/use-companies';
import { resolver as resolverEmpresa, rotuloEmpresa } from '@/lib/empresas';

// ─── Stage definitions — 7 colunas oficiais PRD ──────────────────────────────
const KANBAN_STAGES = [
  { id: 'novos_chamados', title: 'Backlog',             description: 'Tickets recém abertos sem triagem',     icon: '📥' },
  { id: 'triagem',        title: 'Triagem',             description: 'Análise e classificação inicial',       icon: '🔎' },
  { id: 'em_atendimento', title: 'Em Atendimento',      description: 'Execução operacional ativa',            icon: '🛠️' },
  { id: 'pendencia',      title: 'Pendência',           description: 'Aguardando dependência externa',        icon: '⏸️' },
  { id: 'em_teste',       title: 'Teste e Homologação', description: 'Validação final antes da resolução',   icon: '🧪' },
  { id: 'resolvido',      title: 'Resolvido',           description: 'Solução entregue ao cliente',           icon: '✔️' },
  { id: 'fechado',        title: 'Fechado',             description: 'Encerramento definitivo (read-only)',   icon: '🔒' },
];

const PENDENCIA_REAL_STATUSES = PENDENCIA_DB_STATUSES;
const VIRTUAL_COLUMN_IDS = new Set(['pendencia']);
// Mesma lista que o seletor de status usa para NÃO oferecer estas etapas —
// importada, não recopiada (@/lib/ticket-status).
const HIDDEN_FROM_BOARD = new Set(STATUSES_APOSENTADOS);
const PENDENCY_STATUSES = new Set<string>([...PENDENCIA_REAL_STATUSES]);
// Mais urgente primeiro (0). Derivado da fonte única para Muito baixa entrar
// no fim sem uma lista a mais para esquecer.
const PRIORITY_ORDER: Record<string, number> = Object.fromEntries(
  PRIORITY_KEYS.map((k) => [k, PRIORITY_RANK.urgent - PRIORITY_RANK[k]]),
);

type SortBy = 'position' | 'ticket_number' | 'created_at' | 'sla_risk' | 'priority';
type SortDir = 'asc' | 'desc';

// Reconcilia as duas origens de ticket (ver comentário em kanban.types.ts) num
// shape canônico único — pura, por isso vive fora do componente.
/**
 * Registro que NÃO é chamado.
 *
 * `POST /tickets/bulk-action` era um stub que fazia `model.create(body)`: cada
 * ação em lote no quadro criava uma linha com os campos `ids` e `action`, sem
 * título e sem status — card em branco, empilhado em Backlog. A rota foi
 * corrigida (scripts/bulk-action-conserto.py), mas as linhas que ela já criou
 * continuam no banco.
 *
 * O sinal é o número do chamado: essas linhas nascem sem passar pelo alocador,
 * então não têm `ticket_number`. Chamado de verdade sempre tem — é o que a
 * equipe usa para se referir a ele.
 *
 * Aqui elas só deixam de ser DESENHADAS. Nada é apagado: continuam visíveis e
 * removíveis em /admin/diagnostico-chamados, para quem quiser conferir antes.
 */
function ehLixoDeBulkAction(t: RawKanbanTicket): boolean {
  // As duas grafias, como o normalizeTicket faz: checar só uma esconderia
  // chamado legítimo que viesse na outra.
  const cru = t as { ticket_number?: unknown; ticketNumber?: unknown }
  const numero = String(cru.ticket_number ?? cru.ticketNumber ?? '').trim()
  const titulo = String(t.title ?? '').trim()
  return !numero && !titulo
}

function normalizeTicket(t: RawKanbanTicket): KanbanTicket {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status as TicketStatus,
    priority: t.priority as TicketPriority,
    severity: (t.severity as KanbanTicket['severity']) ?? null,
    category: t.category ?? null,
    ticket_number: t.ticket_number ?? t.ticketNumber ?? null,
    ticket_type: (t.ticket_type ?? t.ticketType ?? null) as KanbanTicket['ticket_type'],
    source: t.source ?? null,
    tags: t.tags ?? [],
    recurring: t.recurring ?? false,
    is_public: t.is_public ?? t.isPublic ?? false,
    company_name: t.company_name ?? t.companyName ?? null,
    contact_email: t.contact_email ?? t.contactEmail ?? null,
    position: t.position ?? 0,
    created_at: t.created_at ?? t.createdAt ?? new Date().toISOString(),
    updated_at: t.updated_at ?? t.updatedAt ?? new Date().toISOString(),
    user_id: t.user_id ?? t.userId ?? null,
    assigned_to: t.assigned_to ?? t.assignedTo ?? null,
    user: t.user ?? null,
    assignee: t.assignee ?? null,
    co_assignees: t.co_assignees ?? [],
    escalated_to_user: t.escalated_to_user ?? null,
    // Responsável + escalado + co-responsáveis, calculado no servidor.
    envolvidos: t.envolvidos ?? [],
    message_count: t.message_count ?? t._count?.messages ?? 0,
    attachment_count: t.attachment_count ?? t._count?.attachments ?? 0,
    sla: t.sla ?? null,
    pendency_reason: t.pendency_reason ?? t.pendencyReason ?? null,
    pendency_type: t.pendency_type ?? t.pendencyType ?? null,
    follow_up_date: t.follow_up_date ?? t.followUpDate ?? null,
    requester: t.requester ?? null,
    company_cnpj: t.company_cnpj ?? t.companyCnpj ?? null,
    impact: (t.impact as KanbanTicket['impact']) ?? null,
    rating: t.rating ?? null,
    is_blocked: t.is_blocked ?? t.isBlocked ?? false,
    blocked_reason: t.blocked_reason ?? t.blockedReason ?? null,
    pull_request_url: t.pull_request_url ?? t.pullRequestUrl ?? null,
    column_entered_at: t.column_entered_at ?? t.columnEnteredAt ?? null,
    coAssignees: t.coAssignees,
    team: t.team,
    teamId: t.teamId,
    cnpj_ticket_count: t.cnpj_ticket_count,
  };
}

interface KanbanBoardProps {
  tickets: RawKanbanTicket[];
  agents: KanbanAgent[];
  currentUser: KanbanCurrentUser | null;
}

// ─── Board ────────────────────────────────────────────────────────────────────
// O aviso de erro do quadro dizia só "Erro ao resolver ticket" e engolia o
// motivo. Quando o servidor passou a recusar chamada sem sessão, o quadro
// mostrava a mesma frase de sempre e não havia como saber que era 401 — custou
// várias rodadas de tentativa e erro. Quem opera não precisa entender o texto,
// mas quem for consertar precisa lê-lo.
function motivo(e: unknown): string | undefined {
  const m = e instanceof Error ? e.message : String(e ?? '')
  return m && m !== 'undefined' ? m : undefined
}

export function KanbanBoard({ tickets: initialTickets, agents, currentUser }: KanbanBoardProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState<KanbanTicket[]>(
    initialTickets.filter((t) => !ehLixoDeBulkAction(t)).map(normalizeTicket),
  );
  const [activeId, setActiveId]             = useState<string | null>(null);
  const [agentFilter, setAgentFilter]       = useState(searchParams.get('agent') ?? 'all');
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') ?? 'all');
  const [slaFilter, setSlaFilter]           = useState(searchParams.get('sla') ?? 'all');
  const [search, setSearch]                 = useState(searchParams.get('q') ?? '');
  const [companyFilter, setCompanyFilter]   = useState(searchParams.get('company') ?? 'all');
  const [escalatedFilter, setEscalatedFilter] = useState(searchParams.get('escalated') === 'true');
  const [sourceFilter, setSourceFilter]     = useState(searchParams?.get('source') ?? 'all');
  const [groupBy, setGroupBy] = useState<'status' | 'company' | 'team' | 'assignee'>('status');

  // Sort state — persisted in URL
  const [sortBy, setSortBy]   = useState<SortBy>((searchParams.get('sort') as SortBy) ?? 'position');
  const [sortDir, setSortDir] = useState<SortDir>((searchParams.get('dir') as SortDir) ?? 'asc');

  // Saved filter presets
  const { filters: savedFilters, saveFilter, deleteFilter, setDefault: setDefaultFilter } = useFilters();
  const [savePresetName, setSavePresetName] = useState('');
  const [savingPreset, setSavingPreset]     = useState(false);

  const currentFilterConfig = (): FilterConfig => ({
    agentFilter, priorityFilter, slaFilter, search, companyFilter, escalatedFilter, sourceFilter,
  });

  // applyPreset uses the handler refs — defined after handlers are created
  const applyPresetRef = useRef<(config: FilterConfig) => void>(() => {});
  const applyPreset = useCallback((config: FilterConfig) => applyPresetRef.current(config), []);

  const handleSavePreset = useCallback(async () => {
    if (!savePresetName.trim()) return;
    setSavingPreset(true);
    try {
      await saveFilter(savePresetName.trim(), currentFilterConfig());
      setSavePresetName('');
      toast({ title: 'Preset salvo', description: savePresetName.trim() });
    } catch {
      toast({ title: 'Erro ao salvar preset', variant: 'destructive' });
    } finally {
      setSavingPreset(false);
    }
  }, [savePresetName, agentFilter, priorityFilter, slaFilter, search, companyFilter, escalatedFilter, sourceFilter]);

  // Bulk selection
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set());
  const [bulkAssignTo, setBulkAssignTo]   = useState('');
  const [bulkPriority, setBulkPriority]   = useState('');
  const [bulkLoading, setBulkLoading]     = useState(false);
  const [confirmBulkArchive, setConfirmBulkArchive] = useState(false);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkAssignTo('');
    setBulkPriority('');
  }, []);

  const executeBulkAction = useCallback(async (action: string, extra?: Record<string, string>) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const j = await ticketsApi.bulkAction(Array.from(selectedIds), action, extra);
      toast({ title: `${j.updated} ticket${j.updated !== 1 ? 's' : ''} atualizado${j.updated !== 1 ? 's' : ''}` });
      clearSelection();
      if (action === 'archive') {
        setTickets((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      } else if (action === 'assign') {
        const agent = agents.find((a) => a.id === extra?.assignTo) ?? null;
        setTickets((prev) => prev.map((t) =>
          selectedIds.has(t.id) ? { ...t, assignee: agent ? { id: agent.id, full_name: agent.full_name, email: agent.email } : null, assigned_to: extra?.assignTo ?? null } : t
        ));
      } else if (action === 'set_priority' && extra?.priority) {
        const priority = extra.priority as TicketPriority;
        setTickets((prev) => prev.map((t) =>
          selectedIds.has(t.id) ? { ...t, priority } : t
        ));
      }
    } catch {
      toast({ title: 'Erro ao executar ação em massa', variant: 'destructive' });
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, agents, clearSelection, toast]);

  // ── Sincronizar filtros + sort com a URL ───────────────────────────────────
  //
  // Duas coisas aqui, e as duas são o motivo de os filtros "se perderem":
  //
  // 1. A BARRA FINAL. O export usa `trailingSlash: true`, então a rota é
  //    `/admin/kanban/`. Escrever `/admin/kanban?...` é outro caminho para o
  //    roteador: em vez de só trocar a query, ele faz uma navegação de rota,
  //    a página remonta, refaz a carga dos chamados e o quadro é reconstruído.
  //
  // 2. NÃO ESCREVER A CADA TECLA. Com o item 1, cada letra digitada na busca
  //    disparava uma navegação. O estado é imediato (a digitação não trava);
  //    a URL só acompanha depois que a pessoa para de digitar.
  const ROTA = '/admin/kanban/';
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const escreverUrl = useCallback((params: URLSearchParams) => {
    const qs = params.toString();
    router.replace(qs ? `${ROTA}?${qs}` : ROTA, { scroll: false });
  }, [router]);

  const updateUrl = useCallback((key: string, val: string, atraso = 0) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val === 'all' || val === '') {
      params.delete(key);
    } else {
      params.set(key, val);
    }
    if (urlTimer.current) clearTimeout(urlTimer.current);
    if (atraso === 0) {
      escreverUrl(params);
      return;
    }
    urlTimer.current = setTimeout(() => escreverUrl(params), atraso);
  }, [escreverUrl, searchParams]);

  useEffect(() => () => {
    if (urlTimer.current) clearTimeout(urlTimer.current);
  }, []);

  const handleAgentFilter     = (v: string)   => { setAgentFilter(v);     updateUrl('agent', v); };
  const handlePriorityFilter  = (v: string)   => { setPriorityFilter(v);  updateUrl('priority', v); };
  const handleSlaFilter       = (v: string)   => { setSlaFilter(v);       updateUrl('sla', v); };
  // 400ms: escrever a URL a cada tecla remontava a rota (ver updateUrl).
  const handleSearch          = (v: string)   => { setSearch(v);          updateUrl('q', v, 400); };
  const handleCompanyFilter   = (v: string)   => { setCompanyFilter(v);   updateUrl('company', v); };
  const handleEscalatedFilter = (v: boolean)  => { setEscalatedFilter(v); updateUrl('escalated', v ? 'true' : ''); };
  const handleSourceFilter    = (v: string)   => { setSourceFilter(v);    updateUrl('source', v); };
  const handleSortBy          = (v: SortBy)   => { setSortBy(v);          updateUrl('sort', v === 'position' ? '' : v); };
  const handleSortDir         = (v: SortDir)  => { setSortDir(v);         updateUrl('dir', v === 'asc' ? '' : v); };

  applyPresetRef.current = (config: FilterConfig) => {
    handleAgentFilter(config.agentFilter ?? 'all');
    handlePriorityFilter(config.priorityFilter ?? 'all');
    handleSlaFilter(config.slaFilter ?? 'all');
    handleSearch(config.search ?? '');
    handleCompanyFilter(config.companyFilter ?? 'all');
    handleEscalatedFilter(config.escalatedFilter ?? false);
    handleSourceFilter(config.sourceFilter ?? 'all');
  };

  const handleClearAll = useCallback(() => {
    setAgentFilter('all');
    setPriorityFilter('all');
    setSlaFilter('all');
    setSearch('');
    setCompanyFilter('all');
    setEscalatedFilter(false);
    setSourceFilter('all');
    setSortBy('position');
    setSortDir('asc');
    // Com a barra final, igual ao updateUrl: sem ela isto remonta a rota.
    router.replace('/admin/kanban/', { scroll: false });
  }, [router]);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [pendencyOpen, setPendencyOpen] = useState(false);
  const [subTypeOpen, setSubTypeOpen]   = useState(false);
  const pendingMoveRef = useRef<{ ticketId: string; toStatus: TicketStatus; fromStatus: TicketStatus; pendencyType?: string | null } | null>(null);
  const ticketPrevStatus = useRef<Record<string, TicketStatus>>({});

  // 30s polling
  const fetchLatest = useCallback(async () => {
    try {
      const json = await ticketsApi.kanban();
      const board = json.data ?? {};
      const allTickets: RawKanbanTicket[] = Array.isArray(board)
        ? (board as RawKanbanTicket[])
        : (Object.values(board as Record<string, RawKanbanTicket[]>).flat() as RawKanbanTicket[]);
      setTickets((prev) => {
        const prevIds = new Set(prev.map((t) => t.id));
        const newOnes = allTickets
          .filter((t) => !prevIds.has(t.id) && !ehLixoDeBulkAction(t))
          .map(normalizeTicket);
        return newOnes.length === 0 ? prev : [...prev, ...newOnes];
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const iv = setInterval(fetchLatest, 30_000);
    return () => clearInterval(iv);
  }, [fetchLatest]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchLatest();
    setRefreshing(false);
  };

  const handleTicketCreated = (ticket: RawKanbanTicket) => {
    const novo = normalizeTicket(ticket);
    setTickets((prev) => [novo, ...prev]);

    // Os dois diálogos de criação apenas fechavam. O chamado nasce no Backlog,
    // que pode estar fora da tela ou escondido por um filtro ativo — sem aviso,
    // não dá para saber se salvou, e a dúvida leva a criar de novo.
    //
    // Aqui e não dentro de cada diálogo: os dois passam por este callback, e
    // duplicar o aviso daria dois toasts quando alguém ligasse o outro caminho.
    toast({
      title: novo.ticket_number ? `Chamado ${novo.ticket_number} criado` : 'Chamado criado',
      description: novo.title,
      action: (
        <ToastAction
          altText="Abrir o chamado criado"
          onClick={() => router.push(`/admin/tickets/view?id=${encodeURIComponent(novo.id)}`)}
        >
          Abrir
        </ToastAction>
      ),
    });
  };

  const handleCardUpdate = useCallback((id: string, changes: { priority?: TicketPriority; severity?: KanbanTicket['severity']; pull_request_url?: string | null }) => {
    setTickets((prev) => prev.map((t) => t.id === id ? { ...t, ...changes } : t));
  }, []);

  const handleQuickAction = useCallback(async (
    id: string,
    type: 'priority' | 'assign' | 'resolve' | 'status',
    value?: string,
  ) => {
    if (type === 'assign') {
      const me = currentUser ?? null;
      const assigneeObj = me
        ? { id: me.id, full_name: me.full_name ?? me.name ?? null, email: me.email ?? '' }
        : null;
      setTickets((prev) => prev.map((t) =>
        t.id === id ? { ...t, assignee: assigneeObj, assigned_to: me?.id ?? null } : t
      ));
      try {
        await ticketsApi.assign(id, me?.id ?? null);
        toast({ title: 'Ticket atribuído a você' });
      } catch {
        toast({ title: 'Erro ao atribuir ticket', variant: 'destructive' });
        setTickets((prev) => prev.map((t) =>
          t.id === id ? { ...t, assignee: tickets.find((tk) => tk.id === id)?.assignee ?? null } : t
        ));
      }
    } else if (type === 'priority' && value) {
      const priority = value as TicketPriority;
      setTickets((prev) => prev.map((t) =>
        t.id === id ? { ...t, priority } : t
      ));
      try {
        await ticketsApi.update(id, { priority: value });
      } catch (e) {
        toast({ title: 'Erro ao alterar prioridade', description: motivo(e), variant: 'destructive' });
      }
    } else if (type === 'status' && value) {
      // Otimista, como a prioridade: o quadro é arrastar e soltar, e esperar
      // a rede a cada troca de coluna trava o ritmo de quem tria.
      const anterior = tickets.find((t) => t.id === id)?.status;
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: value as KanbanTicket['status'] } : t)));
      try {
        await ticketsApi.patchStatus(id, { status: value });
      } catch (e) {
        toast({ title: 'Erro ao alterar status', description: motivo(e), variant: 'destructive' });
        setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: (anterior ?? t.status) as KanbanTicket['status'] } : t)));
      }
    } else if (type === 'resolve') {
      const prevStatus = tickets.find((t) => t.id === id)?.status;
      setTickets((prev) => prev.map((t) =>
        t.id === id ? { ...t, status: 'resolvido' } : t
      ));
      try {
        await ticketsApi.patchStatus(id, { status: 'resolvido' });
        toast({ title: 'Ticket marcado como resolvido' });
      } catch (e) {
        toast({ title: 'Erro ao resolver ticket', description: motivo(e), variant: 'destructive' });
        if (prevStatus) {
          setTickets((prev) => prev.map((t) =>
            t.id === id ? { ...t, status: prevStatus } : t
          ));
        }
      }
    }
  }, [currentUser, tickets, toast]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // O filtro era a lista crua de `company_name` dos chamados: 136 entradas,
  // com a mesma empresa aparecendo em três grafias. Escolher uma delas
  // escondia os chamados escritos das outras duas.
  //
  // Agora a opção é a empresa CADASTRADA, e um chamado entra nela por
  // reconhecimento de nome (lib/empresas.ts). O que não reconhece continua
  // listado com o nome que tem — some do filtro seria pior que aparecer sujo.
  const { cadastradas, indice } = useCompanies();

  // Quem pode ser filtrado como responsável.
  //
  // Vem do cadastro de perfis, mas NÃO só dele: junta também quem aparece de
  // fato como responsável ou co-responsável nos chamados. São duas fontes
  // porque as duas já falharam de formas diferentes — o cadastro por um filtro
  // de papel errado, que escondeu 7 dos 10 da equipe; e a lista de chamados
  // não conhece quem ainda não pegou nada. A união cobre os dois casos, e de
  // quebra mantém no filtro quem saiu da equipe mas tem chamado antigo.
  const agentesDoFiltro = useMemo(() => {
    const porId = new Map<string, KanbanAgent>();
    for (const a of agents) porId.set(a.id, a);
    for (const t of tickets) {
      for (const p of [t.assignee, ...(t.co_assignees ?? [])]) {
        if (!p?.id || porId.has(p.id)) continue;
        porId.set(p.id, {
          id: p.id,
          full_name: p.full_name ?? p.email ?? 'Agente',
          email: p.email ?? '',
          role: (p as { role?: string }).role ?? 'support',
        } as KanbanAgent);
      }
    }
    return Array.from(porId.values()).sort((a, b) =>
      (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''),
    );
  }, [agents, tickets]);

  const companies = useMemo(() => {
    const naoReconhecidos = new Set<string>();
    for (const t of tickets) {
      const nome = t.company_name;
      if (nome && !resolverEmpresa(nome, indice)) naoReconhecidos.add(nome);
    }
    const usadas = new Set(
      tickets.map((t) => resolverEmpresa(t.company_name, indice)?.name).filter(Boolean) as string[],
    );
    const lista = [
      ...cadastradas.map((c) => c.name).filter((n) => usadas.has(n)).sort(),
      ...Array.from(naoReconhecidos).sort(),
    ];
    // A empresa escolhida entra na lista mesmo sem chamado visível agora. Sem
    // isto, filtrar por uma empresa e depois estreitar por status a tirava das
    // opções: o seletor ficava em branco e parecia que o filtro tinha sumido,
    // quando na verdade ele seguia aplicado.
    if (companyFilter !== 'all' && !lista.includes(companyFilter)) lista.unshift(companyFilter);
    return lista;
  }, [tickets, cadastradas, indice, companyFilter]);

  const filteredTickets = useMemo(() => tickets.filter((t) => {
    if (HIDDEN_FROM_BOARD.has(t.status)) return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        t.title?.toLowerCase().includes(q) ||
        t.ticket_number?.toLowerCase().includes(q) ||
        t.company_name?.toLowerCase().includes(q) ||
        t.user?.full_name?.toLowerCase().includes(q) ||
        t.requester?.toLowerCase().includes(q);
      if (!match) return false;
    }
    // Casa pela empresa reconhecida: escolher "Shopping da Utilidade -
    // Americana" traz também os chamados escritos "Shopping Util Americana".
    if (companyFilter !== 'all') {
      const dele = resolverEmpresa(t.company_name, indice)?.name ?? t.company_name ?? '';
      if (dele !== companyFilter) return false;
    }
    if (agentFilter !== 'all') {
      const assignedId = t.assignee?.id ?? t.assigned_to ?? null;
      if (agentFilter === 'unassigned') {
        if (assignedId) return false;
      } else {
        // `envolvidos` inclui responsável, escalado e co-responsáveis: filtrar
        // por uma pessoa mostra tudo em que ela tem responsabilidade, não só
        // o que está no nome dela. A tentativa anterior procurava
        // `coAssignees[].userId`, campo que a API nunca mandou — o filtro
        // ignorava co-responsável em silêncio.
        const envolvido = (t.envolvidos ?? []).includes(agentFilter);
        if (assignedId !== agentFilter && !envolvido) return false;
      }
    }
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (slaFilter === 'breached' && !t.sla?.breached) return false;
    if (slaFilter === 'warning' && !(t.sla?.minutes_remaining != null && t.sla.minutes_remaining <= 120 && !t.sla.breached)) return false;
    if (slaFilter === 'ok' && (t.sla?.breached || t.sla == null)) return false;
    if (escalatedFilter && !t.sla?.escalated) return false;
    // Chamado antigo nasceu antes do campo existir e vale como portal.
    if (sourceFilter !== 'all' && (t.source ?? 'portal') !== sourceFilter) return false;
    return true;
  }), [tickets, search, companyFilter, indice, agentFilter, priorityFilter, slaFilter, escalatedFilter, sourceFilter]);

  // Sort helper — aplicado sobre os tickets já filtrados por coluna
  const applySortToColumn = useCallback((colTickets: KanbanTicket[]) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...colTickets].sort((a, b) => {
      if (sortBy === 'ticket_number') {
        const ta = a.ticket_number ?? '';
        const tb = b.ticket_number ?? '';
        return ta.localeCompare(tb, undefined, { numeric: true, sensitivity: 'base' }) * dir;
      }
      if (sortBy === 'created_at') {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
      if (sortBy === 'priority') {
        const pra = PRIORITY_ORDER[a.priority] ?? 99;
        const prb = PRIORITY_ORDER[b.priority] ?? 99;
        if (pra !== prb) return (pra - prb) * dir;
        // tiebreak: SLA risk, then date
        if (a.sla?.breached && !b.sla?.breached) return -1;
        if (!a.sla?.breached && b.sla?.breached) return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'sla_risk') {
        // breached first, then ascending minutes_remaining (lowest = most at risk)
        const aBreached = a.sla?.breached ?? false;
        const bBreached = b.sla?.breached ?? false;
        if (aBreached !== bBreached) return (aBreached ? -1 : 1) * dir;
        const aMin = a.sla?.minutes_remaining ?? Infinity;
        const bMin = b.sla?.minutes_remaining ?? Infinity;
        if (aMin !== bMin) return (aMin - bMin) * dir;
        // tiebreak: priority, then date
        const pra = PRIORITY_ORDER[a.priority] ?? 99;
        const prb = PRIORITY_ORDER[b.priority] ?? 99;
        if (pra !== prb) return pra - prb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      // 'position' — sort manual com tiebreaks por SLA/prioridade/data
      const pa = a.position ?? 0;
      const pb = b.position ?? 0;
      if (pa !== pb) return pa - pb;
      if (a.sla?.breached && !b.sla?.breached) return -1;
      if (!a.sla?.breached && b.sla?.breached) return 1;
      const pra = PRIORITY_ORDER[a.priority] ?? 99;
      const prb = PRIORITY_ORDER[b.priority] ?? 99;
      if (pra !== prb) return pra - prb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [sortBy, sortDir]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const resolveStage = useCallback((overId: string) => {
    const byColumn = KANBAN_STAGES.find(s => s.id === overId);
    if (byColumn) return byColumn;
    const overTicket = tickets.find((t) => t.id === overId);
    if (overTicket) {
      const columnId = getKanbanColumnId(overTicket.status);
      return KANBAN_STAGES.find(s => s.id === columnId) ?? null;
    }
    return null;
  }, [tickets]);

  const handleDragStart = (e: DragStartEvent) => {
    const id = e.active.id as string;
    setActiveId(id);
    const t = tickets.find((tk) => tk.id === id);
    if (t) ticketPrevStatus.current[id] = t.status;
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const draggedId = active.id as string;
    if (draggedId === over.id) return;
    const stage = resolveStage(over.id as string);
    if (!stage) return;
    if (VIRTUAL_COLUMN_IDS.has(stage.id)) return;
    // "pendencia" (virtual) já foi filtrado acima — o que resta é sempre um TicketStatus real.
    setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: stage.id as TicketStatus } : t));
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    const draggedId = active.id as string;
    const prevStatus = ticketPrevStatus.current[draggedId];
    const userIsAdmin = currentUser ? verify('admin', currentUser) : false;

    if (!over) {
      if (prevStatus) setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: prevStatus } : t));
      return;
    }

    const stage = resolveStage(over.id as string);
    if (!stage) {
      if (prevStatus) setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: prevStatus } : t));
      return;
    }
    if (!prevStatus) return;

    // ── Mesma coluna ─────────────────────────────────────────────────────────
    if (isSameKanbanColumn(prevStatus, stage.id)) {
      // Se ordenação não é manual, não persiste reorder — volta ao lugar
      if (sortBy !== 'position') {
        setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: prevStatus } : t));
        return;
      }

      const colTickets = tickets
        .filter((t) => statusBelongsToColumn(t.status, stage.id))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const oldIndex = colTickets.findIndex((t) => t.id === draggedId);
      const overIsCard = colTickets.some((t) => t.id === over.id);
      const newIndex = overIsCard
        ? colTickets.findIndex((t) => t.id === over.id)
        : colTickets.length - 1;

      if (oldIndex === -1 || oldIndex === newIndex) {
        setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: prevStatus } : t));
        return;
      }

      const newOrder = arrayMove(colTickets, oldIndex, newIndex);
      setTickets((prev) => {
        const posMap: Record<string, number> = {};
        newOrder.forEach((t, idx) => { posMap[t.id] = idx; });
        return prev.map((t) =>
          statusBelongsToColumn(t.status, stage.id) && posMap[t.id] !== undefined
            ? { ...t, position: posMap[t.id] }
            : t
        );
      });

      ticketsApi.reorder(newOrder.map((t) => t.id), prevStatus).catch(console.error);
      return;
    }

    // ── Cross column ─────────────────────────────────────────────────────────
    if (stage.id === 'fechado') {
      setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: prevStatus } : t));
      toast({ title: '🔒 Fechado é imutável', description: 'Use o botão "Fechar ticket" na tela do ticket.', variant: 'destructive' });
      return;
    }

    if (stage.id === 'pendencia') {
      setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: prevStatus } : t));
      const canMoveToPendencia = PENDENCIA_REAL_STATUSES.some(
        s => isValidTransition(prevStatus, s, userIsAdmin).allowed
      );
      if (!canMoveToPendencia) {
        toast({
          title: 'Transição não permitida',
          description: `Não é possível mover de "${prevStatus}" para Pendência neste fluxo.`,
          variant: 'destructive',
        });
        return;
      }
      // toStatus é placeholder aqui — handleSubTypePick sobrescreve com o status real escolhido no picker.
      pendingMoveRef.current = { ticketId: draggedId, toStatus: stage.id as TicketStatus, fromStatus: prevStatus };
      setSubTypeOpen(true);
      return;
    }

    if (stage.id === 'resolvido') {
      try {
        await ticketsApi.patchStatus(draggedId, { status: 'resolvido' });
      } catch {
        setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: prevStatus } : t));
        toast({ title: 'Erro ao mover ticket', description: 'Transição não permitida pelo servidor.', variant: 'destructive' });
      }
      return;
    }

    if (PENDENCY_STATUSES.has(stage.id)) {
      setTickets((prev) => prev.map(t => t.id === draggedId ? { ...t, status: prevStatus } : t));
      pendingMoveRef.current = { ticketId: draggedId, toStatus: stage.id as TicketStatus, fromStatus: prevStatus };
      setPendencyOpen(true);
      return;
    }

    // Normal status change — optimistic update já ocorreu no handleDragOver
    ticketsApi.patchStatus(draggedId, { status: stage.id }).catch(console.error);
  };

  // ── Pendency dialog handlers ──────────────────────────────────────────────
  async function handlePendencyConfirm(reason: string, followUpDate: string) {
    const move = pendingMoveRef.current;
    if (!move) return;
    const { ticketId, toStatus, fromStatus } = move;
    const pendencyType = move.pendencyType ?? null;

    setTickets((prev) => prev.map(t =>
      t.id === ticketId
        ? { ...t, status: toStatus, pendency_reason: reason, pendency_type: pendencyType, follow_up_date: followUpDate }
        : t
    ));

    try {
      await ticketsApi.patchStatus(ticketId, { status: toStatus, pendency_reason: reason, pendency_type: pendencyType, follow_up_date: followUpDate });
    } catch (err) {
      setTickets((prev) => prev.map(t => t.id === ticketId ? { ...t, status: fromStatus } : t));
      const description = err instanceof Error ? err.message : 'Transição de status rejeitada.';
      toast({ title: 'Erro ao mover ticket', description, variant: 'destructive' });
      return;
    }

    setPendencyOpen(false);
    pendingMoveRef.current = null;
  }

  function handlePendencyCancel() {
    setPendencyOpen(false);
    pendingMoveRef.current = null;
  }

  function handleSubTypePick(selection: PendencySubSelection) {
    const move = pendingMoveRef.current;
    if (!move) return;
    const userIsAdmin = currentUser ? verify('admin', currentUser) : false;
    const { allowed, reason } = isValidTransition(move.fromStatus, selection.dbStatus, userIsAdmin);
    if (!allowed) {
      toast({ title: 'Transição não permitida', description: reason ?? 'Esta movimentação não é permitida.', variant: 'destructive' });
      pendingMoveRef.current = null;
      setSubTypeOpen(false);
      return;
    }
    move.toStatus = selection.dbStatus;
    move.pendencyType = selection.pendencyType;
    setSubTypeOpen(false);
    setPendencyOpen(true);
  }

  function handleSubTypeCancel() {
    setSubTypeOpen(false);
    pendingMoveRef.current = null;
  }

  const activeTicket    = activeId ? tickets.find((t) => t.id === activeId) : null;
  // Reclassificar (prioridade, severidade, status, PR) exige `developer`+.
  const canReprioritize = currentUser ? verify('developer', currentUser) : false;
  // Atender — pegar para si e resolver — é o trabalho de quem atende, e vale a
  // partir de `support`. Antes as quatro ações rápidas dependiam do mesmo
  // `developer`, então os 7 operadores de suporte não tinham nenhuma: para
  // eles o card era só um link, e atribuir-se exigia abrir o chamado inteiro.
  const podeAtender = currentUser ? verify('support', currentUser) : false;

  const activeFiltersCount = [
    agentFilter !== 'all',
    priorityFilter !== 'all',
    slaFilter !== 'all',
    companyFilter !== 'all',
    escalatedFilter,
    sourceFilter !== 'all',
    search !== '',
  ].filter(Boolean).length;

  return (
    // h-full: preenche o espaço disponível passado pelo page.tsx
    <div className="flex h-full flex-col gap-3">

      {/* Toolbar — DESKTOP (md+) */}
      <div className="hidden md:flex shrink-0 flex-wrap items-center justify-between gap-3">
        <MetricsBar tickets={tickets} />
        <div className="flex items-center gap-2 shrink-0">
          {/* GroupBy segmented control */}
          <SegmentedControl
            size="md"
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { id: 'status',   label: 'Status' },
              { id: 'company',  label: 'Empresa' },
              { id: 'team',     label: 'Time' },
              { id: 'assignee', label: 'Agente' },
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {/* Havia dois caminhos para abrir chamado internamente: um diálogo
              curto ("Novo Ticket") e o assistente ("Wizard"). Dois caminhos
              para a mesma coisa é como um deles fica para trás — o diálogo não
              pedia WhatsApp, e chamado aberto por ele nascia sem o código de
              acompanhamento que o cliente precisa. Ficou o assistente, que é o
              caminho completo. Em 04/09/2026. */}
          <Button
            size="sm"
            onClick={() => setWizardOpen(true)}
            className="h-8 gap-1.5 text-xs bg-sem-info-fg hover:opacity-90 text-background"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo chamado
          </Button>
        </div>
      </div>

      {/* Dica de swipe — só mobile, indica que o board tem colunas roláveis */}
      {groupBy === 'status' && (
        <p className="flex md:hidden shrink-0 items-center justify-center gap-1 text-[11px] text-muted-foreground/60">
          ← deslize para ver as {KANBAN_STAGES.length} colunas →
        </p>
      )}

      {/* Toolbar — MOBILE (< md) */}
      <div className="flex md:hidden shrink-0 items-center justify-between gap-2">
        <MetricsBar tickets={tickets} />
        <div className="flex items-center gap-2 shrink-0">
          <MobileFiltersDrawer
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            agents={agentesDoFiltro}
            agentFilter={agentFilter}
            setAgentFilter={handleAgentFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={handlePriorityFilter}
            slaFilter={slaFilter}
            setSlaFilter={handleSlaFilter}
            search={search}
            setSearch={handleSearch}
            companies={companies}
            companyFilter={companyFilter}
            setCompanyFilter={handleCompanyFilter}
            escalatedFilter={escalatedFilter}
            setEscalatedFilter={handleEscalatedFilter}
            sourceFilter={sourceFilter}
            setSourceFilter={handleSourceFilter}
            sortBy={sortBy}
            onSortBy={handleSortBy}
            sortDir={sortDir}
            onSortDir={handleSortDir}
            onRefresh={handleManualRefresh}
            onWizard={() => setWizardOpen(true)}
            onClearAll={handleClearAll}
            refreshing={refreshing}
            activeFiltersCount={activeFiltersCount}
          />
          <Button
            size="sm"
            onClick={() => setWizardOpen(true)}
            className="h-8 gap-1.5 text-xs bg-sem-info-fg hover:opacity-90 text-background"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Novo chamado</span>
          </Button>
        </div>
      </div>

      {/* Filters — desktop only */}
      <div className="hidden md:block shrink-0">
        <FilterBar
          agents={agentesDoFiltro}
          agentFilter={agentFilter}
          setAgentFilter={handleAgentFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={handlePriorityFilter}
          slaFilter={slaFilter}
          setSlaFilter={handleSlaFilter}
          search={search}
          setSearch={handleSearch}
          companyFilter={companyFilter}
          setCompanyFilter={handleCompanyFilter}
          companies={companies}
          escalatedFilter={escalatedFilter}
          setEscalatedFilter={handleEscalatedFilter}
          sourceFilter={sourceFilter}
          setSourceFilter={handleSourceFilter}
          onClearAll={handleClearAll}
        />
      </div>

      {/* Preset picker + Sort bar — desktop only */}
      <div className="hidden md:flex shrink-0 items-center gap-2">
        <SortBar
          sortBy={sortBy}
          onSortBy={handleSortBy}
          sortDir={sortDir}
          onSortDir={handleSortDir}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Bookmark className="h-3.5 w-3.5" />
              Presets
              {savedFilters.length > 0 && (
                <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
                  {savedFilters.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {savedFilters.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum preset salvo ainda.</div>
            )}
            {savedFilters.map(f => (
              <DropdownMenuItem key={f.id} className="flex items-center justify-between gap-2 pr-1" onSelect={e => { e.preventDefault(); applyPreset(f.filterConfig); }}>
                <span className="flex-1 truncate text-sm">{f.name}</span>
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    className={`rounded p-0.5 transition-colors ${f.isDefault ? 'text-sem-warning-fg' : 'text-muted-foreground hover:text-sem-warning-fg'}`}
                    onClick={e => { e.stopPropagation(); setDefaultFilter(f.id); }}
                    title="Definir como padrão"
                  >
                    <Star className="h-3.5 w-3.5" fill={f.isDefault ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
                    onClick={e => { e.stopPropagation(); deleteFilter(f.id); }}
                    title="Remover preset"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <input
                className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Nome do preset..."
                value={savePresetName}
                onChange={e => setSavePresetName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); }}
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={!savePresetName.trim() || savingPreset}
                onClick={handleSavePreset}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Board — flex-1 min-h-0 para ocupar o espaço restante e rolar horizontalmente */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={groupBy === 'status' ? handleDragOver : undefined}
        onDragEnd={groupBy === 'status' ? handleDragEnd : undefined}
      >
        <div className="flex flex-1 min-h-0 gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory sm:snap-none pb-2">
          {groupBy === 'status' ? (
            KANBAN_STAGES.map(stage => {
              const stageTickets = applySortToColumn(
                filteredTickets.filter((t) => statusBelongsToColumn(t.status, stage.id))
              );
              return (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  tickets={stageTickets}
                  agents={agents}
                  onCardUpdate={canReprioritize ? handleCardUpdate : undefined}
                  groupByCompany={false}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  currentUserId={currentUser?.id ?? undefined}
                  onQuickAction={podeAtender ? handleQuickAction : undefined}
                  podeReclassificar={canReprioritize}
                  isDragDisabled={sortBy !== 'position'}
                />
              );
            })
          ) : (
            (() => {
              const getGroupKey = (t: KanbanTicket): string => {
                // Agrupa pela empresa reconhecida: sem isso, a mesma empresa
                // vira três grupos por causa das grafias antigas.
                if (groupBy === 'company') return rotuloEmpresa(t.company_name, indice);
                if (groupBy === 'team')    return t.team?.name ?? (t.teamId ? t.teamId : '(Sem time)');
                const name = t.assignee?.full_name ?? t.assignee?.fullName ?? null;
                return name ?? 'Não atribuído';
              };

              const groupKeys = Array.from(
                new Set<string>(filteredTickets.map(getGroupKey))
              ).sort((a: string, b: string) => {
                const aIsBlank = a.startsWith('(') || a === 'Não atribuído';
                const bIsBlank = b.startsWith('(') || b === 'Não atribuído';
                if (aIsBlank && !bIsBlank) return 1;
                if (!aIsBlank && bIsBlank) return -1;
                return a.localeCompare(b, 'pt-BR');
              });

              if (groupKeys.length === 0) {
                return (
                  <div className="flex items-center justify-center w-full py-16 text-muted-foreground/70 text-sm">
                    Nenhum ticket encontrado com os filtros aplicados.
                  </div>
                );
              }

              return groupKeys.map(key => {
                const colTickets = applySortToColumn(
                  filteredTickets.filter((t) => getGroupKey(t) === key)
                );
                const groupLabel =
                  groupBy === 'company'  ? 'Empresa'  :
                  groupBy === 'team'     ? 'Time'      :
                  'Agente';
                const stage = { id: `group__${key}`, title: key, description: groupLabel, icon: '' };

                return (
                  <KanbanColumn
                    key={key}
                    stage={stage}
                    tickets={colTickets}
                    agents={agents}
                    onCardUpdate={canReprioritize ? handleCardUpdate : undefined}
                    groupByCompany={false}
                    selectedIds={selectedIds}
                    onToggleSelect={handleToggleSelect}
                    currentUserId={currentUser?.id ?? undefined}
                    onQuickAction={podeAtender ? handleQuickAction : undefined}
                  podeReclassificar={canReprioritize}
                    isDragDisabled
                  />
                );
              });
            })()
          )}
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeTicket ? <KanbanCard ticket={activeTicket} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Confirmação de arquivamento em massa */}
      <AlertDialog open={confirmBulkArchive} onOpenChange={setConfirmBulkArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Arquivar {selectedIds.size} ticket{selectedIds.size !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os tickets selecionados serão removidos do Kanban. Essa ação pode ser desfeita
              reabrindo cada ticket individualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-sem-warning-fg hover:opacity-90"
              disabled={bulkLoading}
              onClick={(e) => { e.preventDefault(); executeBulkAction('archive'); setConfirmBulkArchive(false); }}
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-step wizard */}
      <CreateTicketWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={handleTicketCreated}
        agents={agents}
        teams={[]}
        companies={companies}
      />

      {/* Pendencia sub-type picker */}
      <PendenciaSubTypeDialog
        open={subTypeOpen}
        onPick={handleSubTypePick}
        onCancel={handleSubTypeCancel}
      />

      {/* Pendency dialog */}
      <PendencyDialog
        open={pendencyOpen}
        status={pendingMoveRef.current?.toStatus ?? ''}
        onConfirm={handlePendencyConfirm}
        onCancel={handlePendencyCancel}
      />

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center gap-1.5 mr-1">
              <CheckSquare className="h-4 w-4 text-sem-info-fg" />
              <span className="text-sm font-semibold text-foreground/80">
                {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="h-5 w-px bg-muted" />

            <Select
              value={bulkAssignTo}
              onValueChange={val => {
                setBulkAssignTo(val);
                executeBulkAction('assign', { assignTo: val === '__unassign__' ? '' : val });
              }}
            >
              <SelectTrigger className="h-8 w-44 text-xs border-border">
                <Users className="mr-1.5 h-3.5 w-3.5 text-muted-foreground/70" />
                <SelectValue placeholder="Atribuir a…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassign__">Sem responsável</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={bulkPriority}
              onValueChange={val => {
                setBulkPriority(val);
                executeBulkAction('set_priority', { priority: val });
              }}
            >
              <SelectTrigger className="h-8 w-36 text-xs border-border">
                <SelectValue placeholder="Prioridade…" />
              </SelectTrigger>
              <SelectContent>
                {[...PRIORITY_OPTIONS].reverse().map((o) => (
                  <SelectItem key={o.value} value={o.value}>{getPriorityEmoji(o.value)} {o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs text-sem-warning-fg border-sem-warning-bd hover:bg-sem-warning"
              onClick={() => setConfirmBulkArchive(true)}
              disabled={bulkLoading}
            >
              <Archive className="h-3.5 w-3.5" />
              Arquivar
            </Button>

            <div className="h-5 w-px bg-muted" />

            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs text-muted-foreground/70 hover:text-foreground/80"
              onClick={clearSelection}
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
