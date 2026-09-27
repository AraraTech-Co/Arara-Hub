'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Home,
  Clock, CheckCircle2, AlertTriangle, Users,
  TrendingUp, TrendingDown, Minus, LayoutDashboard,
  ArrowRight, Timer, BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/_components/ui/priority-badge';
import { Button } from '@/components/ui/button';
import { AllTicketsTable } from './all-tickets-table';
import { OperationalWorkspace } from './operational-workspace'
import { QueueFlowStrip } from './queue-flow-strip';
import { SignalStrip } from './signal-strip';
import { AgeBands } from './age-bands';
import { ColumnTimeAnalytics } from './column-time-analytics';
import type { OperationalAlertItem } from './manual-alerts-section';
import type { MyTicket } from './my-operation-section';
import type { AcaoAgoraItem, Sinais } from '@/lib/admin/dashboard-from-arara';
import { getStatusLabel } from '@/lib/ticket-status';
import { formatDateShort } from '@/lib/utils';
import { findNavItem } from './admin-sidebar';

export type RecentPage = { href: string; label: string; visitedAt: string };

/** Painel tem que abrir mesmo se a derivação falhar: zero é informação, tela
    quebrada não é. */
/** Mesma capacidade usada no Workspace Equipe. Vira constante nomeada em vez
    de número solto: "2 sobrecarregados" sem mostrar contra o quê não dá para
    conferir nem discutir. */
const CAPACIDADE_AGENTE = 5;

const SINAIS_VAZIOS: Sinais = {
  semDono: 0, semDonoHoras: 0, urgentes: 0, urgentesParados: 0, ativos: 0,
  abertosHoje: 0, abertosOntem: 0, resolvidosHoje: 0,
  esperaMedianaHoras: 0, esperaPiorHoras: 0, reabertos7d: 0, reabertos7dEmpresas: 0,
};

function Trend({ today, yesterday }: { today: number; yesterday: number }) {
  if (yesterday === 0) return <span className="text-xs text-muted-foreground">— sem dados ontem</span>;
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct > 0) return (
    <span className="flex items-center gap-0.5 text-xs text-sem-error-fg">
      <TrendingUp className="h-3 w-3" />+{pct}% vs ontem
    </span>
  );
  if (pct < 0) return (
    <span className="flex items-center gap-0.5 text-xs text-sem-success-fg">
      <TrendingDown className="h-3 w-3" />{pct}% vs ontem
    </span>
  );
  return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="h-3 w-3" />igual ontem</span>;
}

// ─── Mini bar chart (no external lib) ────────────────────────────────────────
function MiniBarChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex h-24 items-end gap-1">
      {data.map((d) => (
        <div key={d.label} className="group relative flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-sem-info-fg transition-all group-hover:opacity-80"
            style={{ height: `${Math.max((d.count / max) * 80, 4)}px` }}
          />
          <span className="text-[9px] text-muted-foreground leading-none">{d.label}</span>
          {/* Tooltip */}
          <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background opacity-0 group-hover:opacity-100 whitespace-nowrap">
            {d.count} ticket{d.count !== 1 ? 's' : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Status donut (pure CSS) ──────────────────────────────────────────────────
function StatusDonut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">Sem dados</p>;
  return (
    <div className="flex items-center gap-4">
      {/* Legend */}
      <div className="flex flex-1 flex-col gap-1.5">
        {data.map(d => (
          <div key={d.label} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="text-xs text-foreground/60">{d.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-foreground">{d.value}</span>
              <span className="text-[10px] text-muted-foreground">({Math.round((d.value/total)*100)}%)</span>
            </div>
          </div>
        ))}
      </div>
      {/* Visual bar */}
      <div className="flex h-32 w-4 flex-col overflow-hidden rounded-full">
        {data.map(d => (
          <div
            key={d.label}
            style={{ background: d.color, flex: d.value }}
            className="transition-all"
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OperationalItem { id: string; title: string; ticket_number?: string | null; status?: string }
interface RecurringCompany { company_cnpj: string; company_name: string | null; ticket_count: number }

interface DashboardProps {
  session: { userId: string; role: string };
  stats: {
    total: number; active: number; resolved: number; unassigned: number;
    urgent: number; slaBreached: number; slaWarning: number;
    openedToday: number; resolvedToday: number; openedYesterday: number;
    csatAvg: number | null; csatCount: number;
  };
  chartData: { label: string; count: number }[];
  statusDist: { label: string; value: number; color: string }[]
  queueDist: { label: string; value: number; token: string }[];
  ageDist: { label: string; value: number; token: string }[];
  priorityDist: { label: string; value: number; color: string }[];
  agentWorkload: { id: string; full_name: string; email: string; total: number; urgent: number; breached: number }[];
  urgentTickets: any[];
  tickets: any[];
  agents: any[];
  // Operational alerts
  stalledTickets?: OperationalItem[];
  recurringCompanies?: RecurringCompany[];
  reopenedTickets?: OperationalItem[];
  // Sprint B — Workspace
  activeAlerts?: OperationalAlertItem[];
  myTickets?: MyTicket[];
  activeIncidentsCount?: number;
  recentPages?: RecentPage[];
  acaoAgora?: AcaoAgoraItem[];
  sinais?: Sinais;
}

// ─── Acessados recentemente ────────────────────────────────────────────────

function RecentPagesStrip({ pages }: { pages: RecentPage[] }) {
  if (pages.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Acessados recentemente:
      </span>
      {pages.map(page => {
        const Icon = findNavItem(page.href)?.icon ?? Clock;
        return (
          <Link
            key={page.href}
            href={page.href}
            className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground/70 transition-colors hover:border-sem-info-fg hover:text-sem-info-fg"
          >
            <Icon className="h-3.5 w-3.5" />
            {page.label}
          </Link>
        );
      })}
    </div>
  );
}

// ─── Operational Alerts ───────────────────────────────────────────────────────

function AlertCard({
  title, count, icon, colorClass, items, link,
}: {
  title: string; count: number; icon: string; colorClass: string;
  items: string[]; link?: string;
}) {
  if (count === 0) return null;
  const preview = items.slice(0, 3);
  const rest = items.length - 3;
  const inner = (
    <div className={`rounded-xl border p-4 space-y-2 transition-all hover:shadow-md ${colorClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <span className="text-2xl font-bold text-foreground">{count}</span>
      </div>
      <ul className="space-y-0.5">
        {preview.map((item, i) => (
          <li key={`${i}-${item}`} className="truncate text-xs text-foreground/60">· {item}</li>
        ))}
        {rest > 0 && <li className="text-xs text-muted-foreground">+ {rest} mais</li>}
      </ul>
    </div>
  );
  return link ? <Link href={link}>{inner}</Link> : inner;
}

function OperationalAlerts({
  stalledTickets = [], recurringCompanies = [], reopenedTickets = [], agentWorkload = [],
}: {
  stalledTickets: OperationalItem[];
  recurringCompanies: RecurringCompany[];
  reopenedTickets: OperationalItem[];
  agentWorkload: { id: string; full_name: string; email: string; total: number; urgent: number; breached: number }[];
}) {
  const overloadedAgents = agentWorkload.filter(a => a.total >= 5);
  const hasAlerts = stalledTickets.length > 0 || recurringCompanies.length > 0
    || reopenedTickets.length > 0 || overloadedAgents.length > 0;

  if (!hasAlerts) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sem-warning-fg">
        <AlertTriangle className="h-3.5 w-3.5" />
        Requer atenção agora
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AlertCard
          title="Filas paradas"
          count={stalledTickets.length}
          icon="⏸"
          colorClass="border-sem-warning-bd bg-sem-warning"
          items={stalledTickets.map(t => t.ticket_number ? `${t.ticket_number} — ${t.title}` : t.title)}
          link="/admin/kanban"
        />
        <AlertCard
          title="Recorrentes no mês"
          count={recurringCompanies.length}
          icon="🔁"
          colorClass="border-sem-warning-bd bg-sem-warning"
          items={recurringCompanies.map(c => `${c.company_name ?? c.company_cnpj} (${c.ticket_count}x)`)}
        />
        <AlertCard
          title="Reabertos (7 dias)"
          count={reopenedTickets.length}
          icon="🔄"
          colorClass="border-sem-error-bd bg-sem-error"
          items={reopenedTickets.map(t => t.ticket_number ? `${t.ticket_number} — ${t.title}` : t.title)}
          link="/admin/kanban"
        />
        <AlertCard
          title="Agentes sobrecarregados"
          count={overloadedAgents.length}
          icon="👤"
          colorClass="border-status-triage-bd bg-status-triage"
          items={overloadedAgents.map(a => `${a.full_name ?? a.email} (${a.total} tickets)`)}
        />
      </div>
    </section>
  );
}

export function AdminDashboard({
  session, stats, chartData, statusDist, queueDist, ageDist, priorityDist, agentWorkload, urgentTickets, tickets, agents,
  stalledTickets = [], recurringCompanies = [], reopenedTickets = [],
  activeAlerts = [], myTickets = [], activeIncidentsCount = 0,
  recentPages = [],
  acaoAgora = [],
  sinais,
}: DashboardProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'workspace' | 'analytics'>('workspace');

  return (
    <main className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 2xl:px-12">

      {/* ── Header + Quick Actions ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel Operacional</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateShort(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-1.5 bg-sem-info-fg hover:bg-sem-info-fg/90">
            <Link href="/admin/kanban">
              <LayoutDashboard className="h-4 w-4" />Kanban
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/admin/users">
              <Users className="h-4 w-4" />Usuários
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/admin/sla">
              <Timer className="h-4 w-4" />SLA
            </Link>
          </Button>
        </div>
      </div>

      <RecentPagesStrip pages={recentPages} />

      {/* Os sinais vivem ACIMA das abas: são os sinais vitais da operação e
          valem tanto para quem está trabalhando quanto para quem está
          analisando. Dentro de uma aba só, a outra repetiria os mesmos números
          em quatro cartões — que era exatamente o problema. */}
      <SignalStrip sinais={sinais ?? SINAIS_VAZIOS} />

      {/* ── Tab Switcher ── */}
      <div role="tablist" aria-label="Seções do painel" className="mb-6 inline-flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {([
          ['workspace', 'Workspace', Home],
          ['analytics', 'Analytics', BarChart3],
        ] as const).map(([id, rotulo, Icone]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={`flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              activeTab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icone aria-hidden className="h-4 w-4" />
            {rotulo}
          </button>
        ))}
      </div>

            {/* ── Tab: Workspace ── */}
      {activeTab === 'workspace' && (
        <OperationalWorkspace
          session={session}
          activeAlerts={activeAlerts}
          myTickets={myTickets}
          agentWorkload={agentWorkload}
          statusDist={statusDist}
          queueDist={queueDist}
          resolvidos={stats.resolved}
          activeIncidentsCount={activeIncidentsCount}
          acaoAgora={acaoAgora}
        />
      )}

      {/* ── Tab: Analytics ── */}
      {activeTab === 'analytics' && (
        <div className="space-y-8">

      {/* ── Alertas Operacionais ── */}
      <OperationalAlerts
        stalledTickets={stalledTickets}
        recurringCompanies={recurringCompanies}
        reopenedTickets={reopenedTickets}
        agentWorkload={agentWorkload}
      />

      {/* Os quatro cartões-herói saíram: número grande, quadradinho de ícone
          colorido e legenda pequena, quatro vezes na mesma largura. Os mesmos
          números agora estão na faixa acima, que serve as duas abas e cabe na
          altura de UM daqueles cartões.

          O que eles carregavam de próprio — faixas de espera, CSAT e a
          distribuição por prioridade — vira uma linha de três painéis, cada um
          respondendo a uma pergunta diferente. */}
      <section className="grid gap-4 lg:grid-cols-3">

        <div className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-media)]">
          <div className="flex h-11 items-center justify-between border-b border-border px-4">
            <h2 className="text-[13px] font-semibold text-foreground">Tempo de espera</h2>
            <span className="text-[11px] text-muted-foreground">chamados ativos</span>
          </div>
          <div className="px-4 py-3">
            <AgeBands faixas={ageDist} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-media)]">
          <div className="flex h-11 items-center justify-between border-b border-border px-4">
            <h2 className="text-[13px] font-semibold text-foreground">Satisfação</h2>
            <span className="text-[11px] text-muted-foreground">
              {stats.csatCount} avaliação{stats.csatCount !== 1 ? 'ões' : ''}
            </span>
          </div>
          <div className="px-4 py-3">
            {stats.csatAvg !== null ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-foreground">{stats.csatAvg}</span>
                <span className="text-[11px] text-muted-foreground">de 5</span>
                {/* As cinco estrelas saíram: repetiam em desenho o que o número
                    já diz, e ocupavam uma linha inteira para isso. */}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Sem avaliação ainda.</p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-media)]">
          <div className="flex h-11 items-center border-b border-border px-4">
            <h2 className="text-[13px] font-semibold text-foreground">Por prioridade</h2>
          </div>
          <div className="px-4 py-3">
            {priorityDist.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Sem chamados.</p>
            ) : (
              <div className="space-y-1.5">
                {priorityDist.map(pr => {
                  const total = priorityDist.reduce((acc, x) => acc + x.value, 0) || 1;
                  const pct = Math.round((pr.value / total) * 100);
                  return (
                    <div key={pr.label} className="flex items-center gap-2 text-[12px]">
                      <span className="w-16 shrink-0 text-muted-foreground">{pr.label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                        <div className="h-full" style={{ width: `${pct}%`, background: pr.color }} />
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums font-medium">{pr.value}</span>
                      <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Prioridade: urgentes + gráfico ── */}
      <section className="grid gap-6 lg:grid-cols-3">

        {/* Urgentes / Alto risco */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Prioridade — Muito alta &amp; Alta
          </h2>
          <Card className="border-border">
            {urgentTickets.length === 0 ? (
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-sem-success-fg" />
                Nenhum ticket urgente ou de alta prioridade
              </CardContent>
            ) : (
              <div className="divide-y divide-border/50">
                {urgentTickets.map(t => (
                  <Link
                    key={t.id}
                    href={`/admin/tickets/view/?id=${encodeURIComponent(t.id)}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <PriorityBadge priority={t.priority} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {t.ticket_number && (
                          <span className="font-mono text-[10px] text-muted-foreground">{t.ticket_number}</span>
                        )}
                        <span className="truncate text-sm font-medium text-foreground">{t.title}</span>
                        {t.sla_breached && (
                          <Badge className="shrink-0 bg-sem-error text-xs text-sem-error-fg">Vencido</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{getStatusLabel(t.status)}</span>
                        {t.company_name && <><span>·</span><span>{t.company_name}</span></>}
                        {t.assignee ? (
                          <><span>·</span><span className="text-sem-info-fg">{t.assignee.full_name}</span></>
                        ) : (
                          <><span>·</span><span className="text-sem-warning-fg">Sem responsável</span></>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
                {urgentTickets.length >= 10 && (
                  <div className="p-3 text-center">
                    <Link href="/admin/kanban" className="text-xs text-sem-info-fg hover:underline">
                      Ver todos no Kanban →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Charts */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos 7 dias
            </h2>
            <Card className="border-border p-4">
              <div className="mb-2 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground/80">Tickets abertos</span>
              </div>
              <MiniBarChart data={chartData} />
            </Card>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Distribuição por status
            </h2>
            <Card className="border-border p-4">
              {/* Era uma rosca: com Resolvidos dentro, ela ficava 83% verde e
                  dizia "está tudo bem" independentemente da fila. A mesma
                  régua do Workspace responde a pergunta de verdade — onde a
                  fila está entupida. */}
              <QueueFlowStrip colunas={queueDist} resolvidos={stats.resolved} />
            </Card>
          </div>
        </div>
      </section>

      {/* ── Workload dos agentes ── */}
      {/* Eram DEZ cartões do mesmo tamanho, um por agente, cada um com bolinha
          de inicial, nome, contagem, distintivos e barra — a mesma estrutura
          repetida dez vezes ocupando meia tela para dizer dez números. Cartão
          é o container preguiçoso: quando tudo tem o mesmo peso, nada tem.

          Vira uma tabela: comparar dez agentes é justamente o que tabela faz
          melhor que cartão, porque alinha a coluna que se quer comparar. */}
      <section className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-media)]">
        <div className="flex h-11 items-center justify-between border-b border-border px-4">
          <h2 className="text-[13px] font-semibold text-foreground">Carga por agente</h2>
          <span className="text-[11px] text-muted-foreground">
            {agentWorkload.reduce((acc, a) => acc + a.total, 0)} chamados ativos distribuídos
          </span>
        </div>
        {agentWorkload.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nenhum agente cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="h-9 px-4 font-semibold">Agente</th>
                  <th className="h-9 px-3 text-right font-semibold">Ativos</th>
                  <th className="h-9 px-3 text-right font-semibold">Muito alta</th>
                  <th className="h-9 px-3 text-right font-semibold">Estourados</th>
                  <th className="h-9 px-4 font-semibold">Ocupação</th>
                </tr>
              </thead>
              <tbody>
                {agentWorkload.map(agent => {
                  {/* Escala ABSOLUTA contra a capacidade, não normalizada pelo
                      mais ocupado: normalizando, o mais ocupado é sempre 100%
                      e a barra deixa de comparar qualquer coisa. */}
                  const escala = Math.max(CAPACIDADE_AGENTE * 2, ...agentWorkload.map(a => a.total), 1);
                  const pct = Math.min(100, Math.round((agent.total / escala) * 100));
                  const sobrecarregado = agent.total >= CAPACIDADE_AGENTE;
                  return (
                    <tr key={agent.id} className="h-9 border-b border-border/60 last:border-0 hover:bg-muted/40">
                      <td className="max-w-[260px] truncate px-4">{agent.full_name || agent.email}</td>
                      <td className={`px-3 text-right tabular-nums ${sobrecarregado ? 'font-semibold text-sem-warning-fg' : ''}`}>
                        {agent.total}
                      </td>
                      <td className="px-3 text-right tabular-nums">
                        {agent.urgent > 0 ? <span className="text-sem-error-fg font-medium">{agent.urgent}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 text-right tabular-nums">
                        {agent.breached > 0 ? <span className="text-sem-error-fg font-medium">{agent.breached}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-full max-w-[160px] overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: sobrecarregado ? 'var(--sem-warning-fg)' : 'var(--primary)',
                              }}
                            />
                          </div>
                          {sobrecarregado && (
                            <span className="shrink-0 text-[11px] font-medium text-sem-warning-fg">acima da capacidade</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Tempo por Coluna (Sprint E) ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tempo por Coluna
        </h2>
        <ColumnTimeAnalytics />
      </section>

      {/* ── Todos os Chamados ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Todos os Chamados
          </h2>
          <Link href="/admin/kanban" className="flex items-center gap-1 text-xs text-sem-info-fg hover:underline">
            Ver no Kanban <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <AllTicketsTable tickets={tickets as any} agents={agents as any} />
      </section>
      </div>
      )} {/* end analytics tab */}

    </main>
  );
}
