'use client';

import Link from 'next/link';
import { BookOpen, Building2, FileText, Headphones, Layers, LayoutDashboard, Radio, Timer, UserRound, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ManualAlertsSection, type OperationalAlertItem } from './manual-alerts-section';
import { OperationalFeed } from './operational-feed';
import { MyOperationSection, type MyTicket } from './my-operation-section';
import { AcaoAgoraTable } from './acao-agora-table';
import type { AcaoAgoraItem } from '@/lib/admin/dashboard-from-arara';
import { TeamWorkspaceSection, type AgentLoad, type StatusCount } from './team-workspace-section';
import { verify } from '@/lib/auth';
import { QueueFlowStrip } from './queue-flow-strip';

interface OperationalWorkspaceProps {
  session: { userId: string; role: string };
  activeAlerts: OperationalAlertItem[];
  myTickets: MyTicket[];
  agentWorkload: AgentLoad[];
  statusDist: StatusCount[];
  queueDist: { label: string; value: number; token: string }[];
  resolvidos?: number;
  activeIncidentsCount?: number
  acaoAgora: AcaoAgoraItem[]
}

// Section wrapper with consistent styling
function WorkspaceSection({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`border-border ${className}`}>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

// Hub de Recursos — placeholder links
function ResourceHub() {
  const resources = [
    { label: 'Base de Conhecimento', href: '/admin/kb', icon: <BookOpen className="h-4 w-4 text-sem-info-fg" />, desc: 'Artigos e soluções' },
    { label: 'Kanban', href: '/admin/kanban', icon: <LayoutDashboard className="h-4 w-4 text-sem-info-fg" />, desc: 'Visão do board' },
    { label: 'Relatórios', href: '/admin/reports', icon: <FileText className="h-4 w-4 text-sem-success-fg" />, desc: 'Métricas e exportações' },
    { label: 'Escala de Suporte', href: '/admin/schedule', icon: <Headphones className="h-4 w-4 text-sem-info-fg" />, desc: 'Plantão e escalas' },
    { label: 'Automações', href: '/admin/automation', icon: <Zap className="h-4 w-4 text-sem-warning-fg" />, desc: 'Regras automáticas' },
    { label: 'Gestão de SLA', href: '/admin/sla', icon: <span className="text-base leading-none">⏱</span>, desc: 'Contratos e prazos' },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {resources.map(r => (
        <Link
          key={r.href}
          href={r.href}
          className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/50 p-2.5 hover:bg-sem-info hover:border-sem-info-bd transition-colors group"
        >
          <div className="mt-0.5 shrink-0">{r.icon}</div>
          <div>
            <p className="text-xs font-medium text-foreground/80 group-hover:text-sem-info-fg">{r.label}</p>
            <p className="text-[10px] text-muted-foreground">{r.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function OperationalWorkspace({
  session,
  activeAlerts,
  myTickets,
  agentWorkload,
  statusDist,
  queueDist,
  resolvidos,
  activeIncidentsCount = 0,
  acaoAgora,
}: OperationalWorkspaceProps) {
  const userIsAdmin = verify('admin', session);

  return (
    <div className="space-y-6">
      {/* E logo abaixo a lista com a qual se trabalha. A tabela é o painel:
          o resumo existe para levar até ela, não para substituí-la. */}
      <AcaoAgoraTable itens={acaoAgora} />

      {/* A fila em largura cheia. Era uma grade de seis pílulas
          cinzas dentro da terceira coluna; agora é a forma do fluxo, que
          responde "onde está entupido" sem ler seis números. */}
      <WorkspaceSection title="Fila do Suporte" icon={<Layers aria-hidden className="h-4 w-4 text-muted-foreground" />}>
        <QueueFlowStrip colunas={queueDist} resolvidos={resolvidos} />
      </WorkspaceSection>

      {/* Avisos saiu da faixa nobre: ele passa a maior parte do tempo vazio, e
          quando vazio agora não renderiza nada para quem não é admin. */}
      <ManualAlertsSection initialAlerts={activeAlerts} isAdmin={userIsAdmin} />

      {/* Minha Operação vale o dobro: é o que interessa aos 10 usuários todo
          dia. Feed e equipe recuam para uma coluna. Antes eram três colunas de
          peso idêntico, o que é o mesmo que não ter ordem. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <WorkspaceSection
          title="Minha Operação"
          icon={<UserRound aria-hidden className="h-4 w-4 text-muted-foreground" />}
          className="lg:col-span-2"
        >
          <MyOperationSection tickets={myTickets} />
        </WorkspaceSection>

        <div className="space-y-6 lg:col-span-1">
          <WorkspaceSection
            title="Workspace Equipe"
            icon={<Building2 aria-hidden className="h-4 w-4 text-muted-foreground" />}
          >
            <TeamWorkspaceSection
              agentWorkload={agentWorkload}
              statusDist={statusDist}
              queueDist={queueDist}
              resolvidos={resolvidos}
              activeIncidentsCount={activeIncidentsCount}
              podeReatribuir={userIsAdmin}
            />
          </WorkspaceSection>

          <WorkspaceSection
            title="Feed Operacional"
            icon={<Radio aria-hidden className="h-4 w-4 text-muted-foreground" />}
          >
            <OperationalFeed />
          </WorkspaceSection>
        </div>
      </div>

      {/* Section 5: Hub de Recursos */}
      <WorkspaceSection
        title="Hub de Recursos"
        icon={<span className="text-base leading-none">🔗</span>}
      >
        <ResourceHub />
      </WorkspaceSection>
    </div>
  );
}
