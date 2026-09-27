'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Users, AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { QueueFlowStrip } from './queue-flow-strip';
import { Badge } from '@/components/ui/badge';

export interface AgentLoad {
  id: string;
  full_name: string | null;
  email: string;
  total: number;
  urgent: number;
  breached: number;
}

export interface StatusCount {
  label: string;
  value: number;
  color: string;
}

interface TeamWorkspaceSectionProps {
  agentWorkload: AgentLoad[];
  statusDist: StatusCount[];
  queueDist: { label: string; value: number; token: string }[];
  resolvidos?: number;
  activeIncidentsCount?: number;
  /** Aberto por padrão só para quem pode reatribuir. */
  podeReatribuir?: boolean;
}

/** Acima disto o agente é considerado sobrecarregado. Vira linha na barra em
    vez de ficar só no código: "2 sobrecarregados" sem mostrar contra o quê não
    dá para conferir nem discutir. */
const CAPACIDADE = 5;

export function TeamWorkspaceSection({
  agentWorkload,
  queueDist,
  resolvidos,
  activeIncidentsCount = 0,
  podeReatribuir = false,
}: TeamWorkspaceSectionProps) {
  // 7 dos 10 usuários são `support` e não podem reatribuir ninguém — para eles
  // a carga alheia é informação, não trabalho, e ocupava um terço da tela.
  const [aberto, setAberto] = useState(podeReatribuir);
  const overloaded = agentWorkload.filter(a => a.total >= CAPACIDADE);
  // Escala ABSOLUTA, não normalizada pelo agente mais ocupado: normalizando, o
  // mais ocupado é sempre 100% e a barra não compara nada.
  const escala = Math.max(CAPACIDADE * 2, ...agentWorkload.map(a => a.total), 1);

  return (
    <div className="space-y-4">
      <QueueFlowStrip colunas={queueDist} resolvidos={resolvidos} />

      {/* Active incidents */}
      {activeIncidentsCount > 0 && (
        <div className="rounded-xl border border-sem-error-bd bg-sem-error px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-sem-error-fg shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-sem-error-fg">
              {activeIncidentsCount} incidente{activeIncidentsCount !== 1 ? 's' : ''} ativo{activeIncidentsCount !== 1 ? 's' : ''}
            </span>
          </div>
          <Link
            href="/admin/incidents"
            className="text-xs text-sem-error-fg hover:underline flex items-center gap-1 shrink-0"
          >
            Ver <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Carga por agente — recolhida para quem não pode reatribuir. */}
      <div>
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          aria-expanded={aberto}
          className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Carga por Agente
            {overloaded.length > 0 && (
              <span className="ml-2 text-[11px] font-normal normal-case text-sem-warning-fg">
                {overloaded.length} acima de {CAPACIDADE}
              </span>
            )}
          </span>
          {aberto
            ? <ChevronUp aria-hidden className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown aria-hidden className="h-4 w-4 text-muted-foreground" />}
        </button>
        {!aberto ? null : agentWorkload.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhum agente cadastrado</p>
        ) : (
          <div className="space-y-2">
            {agentWorkload.slice(0, 8).map(agent => {
              const pct = Math.min(100, Math.round((agent.total / escala) * 100));
              const isOverloaded = agent.total >= CAPACIDADE;
              // A superfície é a MESMA para todos; o alerta vive no contorno, no
              // número e na barra. Antes a linha inteira do sobrecarregado
              // recebia `bg-sem-warning` — com 5 de 8 acima da capacidade, um
              // terço do painel virava um bloco marrom, e a tinta deixava de
              // distinguir justamente por estar em todo lugar.
              return (
                <div key={agent.id} className={`rounded-lg border bg-muted/50 px-3 py-2 ${isOverloaded ? 'border-sem-warning-bd' : 'border-border/50'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isOverloaded ? 'bg-sem-warning text-sem-warning-fg' : 'bg-sem-info text-sem-info-fg'}`}>
                        {(agent.full_name?.[0] ?? agent.email[0]).toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-foreground">
                        {agent.full_name ?? agent.email}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {agent.urgent > 0 && (
                        <Badge className="bg-sem-error text-[10px] text-sem-error-fg px-1.5 py-0 h-4">{agent.urgent} urg</Badge>
                      )}
                      {agent.breached > 0 && (
                        <Badge className="h-4 bg-sem-error px-1.5 py-0 text-[11px] text-sem-error-fg">{agent.breached} SLA</Badge>
                      )}
                      <span className={`ml-1 text-xs font-semibold tabular-nums ${isOverloaded ? 'text-sem-warning-fg' : 'text-foreground/80'}`}>{agent.total}</span>
                    </div>
                  </div>
                  {/* Escala absoluta e igual para todos, com a linha de
                      capacidade marcada: assim a barra compara agentes entre si
                      e contra um limite, em vez de comparar cada um com o mais
                      ocupado. A cor deixa de ser o único sinal — passar da
                      linha é visível na posição. */}
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-background/60">
                    <div
                      className={`h-full rounded-full transition-all ${isOverloaded ? 'bg-sem-warning-fg' : 'bg-sem-info-fg'}`}
                      style={{ width: `${pct}%` }}
                    />
                    <span
                      aria-hidden
                      className="absolute inset-y-0 w-px bg-foreground/40"
                      style={{ left: `${(CAPACIDADE / escala) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {agentWorkload.length > 8 && (
              <p className="text-center text-xs text-muted-foreground">
                + {agentWorkload.length - 8} agentes
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Link href="/admin/teams" className="text-xs text-sem-info-fg hover:underline flex items-center gap-1">
          <Users className="h-3 w-3" />
          Gerenciar equipes
        </Link>
      </div>
    </div>
  );
}
