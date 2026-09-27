'use client';

import Link from 'next/link';
import { Clock, ArrowRight, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getPriorityColor, getPriorityLabel } from '@/lib/ticket-priority';
import { getStatusLabel } from '@/lib/ticket-status';

export interface MyTicket {
  id: string;
  title: string;
  ticketNumber: string | null;
  status: string;
  priority: string;
  companyName: string | null;
  slaBreached: boolean;
  slaWarning: boolean;
  resolutionDeadline: string | null;
  /** Horas desde a abertura. Existe para todo chamado — o SLA, para 4 de 454. */
  idadeHoras: number;
}

/** "3h", "2d". Idade só precisa da ordem de grandeza para orientar a triagem. */
function idade(horas: number): string {
  if (horas < 1) return 'agora';
  if (horas < 24) return `${Math.round(horas)}h`;
  return `${Math.floor(horas / 24)}d`;
}

/** Faixa da idade, na mesma escala de severidade do painel. */
function faixaIdade(horas: number): 'p0' | 'p1' | 'p2' | 'p3' {
  if (horas >= 72) return 'p0';
  if (horas >= 24) return 'p1';
  if (horas >= 4) return 'p2';
  return 'p3';
}

// Prioridade: fonte canônica em @/lib/ticket-priority

function TicketMiniCard({ ticket }: { ticket: MyTicket }) {
  const deadline = ticket.resolutionDeadline ? new Date(ticket.resolutionDeadline) : null;
  const timeLeft = deadline ? Math.floor((deadline.getTime() - Date.now()) / 60000) : null;

  return (
    <Link
      href={`/admin/tickets/view/?id=${encodeURIComponent(ticket.id)}`}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors rounded-lg group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {ticket.ticketNumber && (
            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{ticket.ticketNumber}</span>
          )}
          <span className="text-sm font-medium text-foreground truncate">{ticket.title}</span>
          {/* Idade no lugar do selo de SLA: aparece em todo chamado, e a cor
              só entra a partir de um dia — antes disso é informação, não
              alarme. */}
          <span
            title={`Aberto há ${idade(ticket.idadeHoras)}`}
            className="inline-flex shrink-0 items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px] font-medium"
            style={
              ticket.idadeHoras >= 24
                ? {
                    color: `var(--severity-${faixaIdade(ticket.idadeHoras)}-fg)`,
                    background: `var(--severity-${faixaIdade(ticket.idadeHoras)})`,
                    borderColor: `var(--severity-${faixaIdade(ticket.idadeHoras)}-bd)`,
                  }
                : undefined
            }
          >
            <Clock aria-hidden className="h-2.5 w-2.5" />
            {idade(ticket.idadeHoras)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${getPriorityColor(ticket.priority)}`}>
            {getPriorityLabel(ticket.priority)}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {getStatusLabel(ticket.status)}
          </span>
          {ticket.companyName && (
            <span className="text-[10px] text-muted-foreground truncate">{ticket.companyName}</span>
          )}
          {timeLeft !== null && timeLeft > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
              {timeLeft < 60 ? `${timeLeft}min` : `${Math.floor(timeLeft / 60)}h`} restante
            </span>
          )}
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
    </Link>
  );
}

interface MyOperationSectionProps {
  tickets: MyTicket[];
}

export function MyOperationSection({ tickets }: MyOperationSectionProps) {
  // Classificação em passe único, por precedência. Antes cada grupo filtrava a
  // lista inteira e só `others` excluía os anteriores: um chamado urgente com
  // SLA estourado aparecia em DOIS grupos, e o total do cabeçalho não fechava
  // com a soma. Num painel de uso diário, número que não fecha é número que
  // ninguém acredita mais.
  const grupos: Record<string, MyTicket[]> = {
    sla: [], escalado: [], aguardando: [], pendencia: [], andamento: [],
  };
  for (const t of tickets) {
    const onde =
      // 3 dias sem sair do lugar é o sinal que existe para todo chamado; o SLA
      // existia para 4 de 454 e por isso deixou de comandar este grupo.
      t.idadeHoras >= 72 ? 'sla'
      : t.status === 'escalated' || t.priority === 'urgent' ? 'escalado'
      : t.status === 'aguardando_cliente' ? 'aguardando'
      : t.status === 'pendencia_suporte' || t.status === 'pendencia_dev' ? 'pendencia'
      : 'andamento';
    grupos[onde].push(t);
  }

  if (tickets.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-8 text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="text-sm font-medium text-foreground/80">Nenhum chamado atribuído a você</p>
          <p className="text-xs text-muted-foreground mt-1">Sua fila está vazia</p>
        </CardContent>
      </Card>
    );
  }

  const sections = [
    { label: 'Parados há mais tempo', items: grupos.sla, color: 'text-sem-error-fg', icon: '🚨' },
    { label: 'Escalados / Muito alta', items: grupos.escalado, color: 'text-sem-warning-fg', icon: '⬆️' },
    { label: 'Aguardando Resposta', items: grupos.aguardando, color: 'text-sem-warning-fg', icon: '⏳' },
    { label: 'Pendências', items: grupos.pendencia, color: 'text-sem-info-fg', icon: '📋' },
    { label: 'Em Andamento', items: grupos.andamento, color: 'text-sem-info-fg', icon: '🔄' },
  ].filter(s => s.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} atribuído{tickets.length !== 1 ? 's' : ''} a você
        </p>
        <Link href="/admin/kanban" className="text-xs text-sem-info-fg hover:underline flex items-center gap-1">
          Ver no Kanban <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {sections.map(section => (
        <div key={section.label}>
          <p className={`text-xs font-semibold mb-1.5 flex items-center gap-1.5 ${section.color}`}>
            <span>{section.icon}</span>
            {section.label}
            <span className="ml-auto text-muted-foreground font-normal">{section.items.length}</span>
          </p>
          <Card className="border-border overflow-hidden">
            <div className="divide-y divide-border/60">
              {section.items.slice(0, 5).map(ticket => (
                <TicketMiniCard key={ticket.id} ticket={ticket} />
              ))}
              {section.items.length > 5 && (
                <div className="px-3 py-2 text-center">
                  <Link href="/admin/kanban" className="text-xs text-muted-foreground hover:text-sem-info-fg">
                    + {section.items.length - 5} mais
                  </Link>
                </div>
              )}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}
