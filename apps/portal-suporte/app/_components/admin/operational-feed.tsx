'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingBlock } from '@/components/ui/loading-block';
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface FeedActor {
  id: string;
  name: string | null;
  role: string;
}

interface FeedTicket {
  id: string;
  title: string;
  ticketNumber: string | null;
  companyName: string | null;
}

interface FeedItem {
  id: string;
  action: string;
  icon: string;
  message: string;
  actor: FeedActor | null;
  ticket: FeedTicket | null;
  details: unknown;
  createdAt: string;
}

// A plataforma devolve o log cru (`action` + `details`); o portal antigo já
// mandava `message`/`icon` prontos. Enquanto o controller não enriquecer,
// montamos aqui — sem isto o feed aparece só com o horário, sem texto.
const ACOES: Record<string, { icon: string; label: string }> = {
  ticket_created:       { icon: '🆕', label: 'Chamado aberto' },
  ticket_assigned:      { icon: '👤', label: 'Chamado atribuído' },
  ticket_updated:       { icon: '✏️', label: 'Chamado atualizado' },
  ticket_completed:     { icon: '✅', label: 'Chamado concluído' },
  ticket_escalated:     { icon: '⚠️', label: 'Chamado escalado' },
  status_changed:       { icon: '🔄', label: 'Status alterado' },
  evidence_added:       { icon: '📎', label: 'Evidência anexada' },
  internal_note_added:  { icon: '🗒️', label: 'Comentário interno' },
  message_added:        { icon: '💬', label: 'Mensagem enviada' },
  participant_added:    { icon: '➕', label: 'Participante incluído' },
  participant_removed:  { icon: '➖', label: 'Participante removido' },
  occurred_at_changed:  { icon: '🕒', label: 'Data do atendimento ajustada' },
}

/** Completa `icon`/`message` quando a API manda só o log cru. */
function normalizarItem(raw: Record<string, unknown>): FeedItem {
  const acao = String(raw.action ?? '')
  const meta = ACOES[acao] ?? { icon: '•', label: acao.replace(/_/g, ' ') || 'Atividade' }
  const det = (raw.details ?? {}) as Record<string, unknown>
  let msg = String(raw.message ?? '')
  if (!msg) {
    msg = meta.label
    if (acao === 'status_changed' && det.from && det.to) {
      msg = `Status: ${det.from} → ${det.to}`
    }
  }
  return {
    ...(raw as object),
    id: String(raw.id ?? ''),
    action: acao,
    icon: String(raw.icon ?? meta.icon),
    message: msg,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
  } as FeedItem
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function groupByTime(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  const twoDays = 2 * oneDay;

  const groups: { label: string; items: FeedItem[] }[] = [
    { label: 'Última hora', items: [] },
    { label: 'Hoje', items: [] },
    { label: 'Ontem', items: [] },
    { label: 'Anteriores', items: [] },
  ];

  for (const item of items) {
    const age = now - new Date(item.createdAt).getTime();
    if (age < oneHour) {
      groups[0].items.push(item);
    } else if (age < oneDay) {
      groups[1].items.push(item);
    } else if (age < twoDays) {
      groups[2].items.push(item);
    } else {
      groups[3].items.push(item);
    }
  }

  return groups.filter(g => g.items.length > 0);
}

interface OperationalFeedProps {
  initialFeed?: FeedItem[];
}

export function OperationalFeed({ initialFeed = [] }: OperationalFeedProps) {
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [loading, setLoading] = useState(initialFeed.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const isFetching = useRef(false);

  const fetchFeed = useCallback(async (opts?: { prepend?: boolean; cursor?: string; silent?: boolean }) => {
    if (isFetching.current && !opts?.cursor) return;
    isFetching.current = true;

    if (!opts?.silent) {
      if (opts?.cursor) {
        setLoadingMore(true);
      } else {
        setRefreshing(true);
      }
    }

    try {
      const params = new URLSearchParams({ limit: '30' });
      if (opts?.cursor) params.set('cursor', opts.cursor);

      const res = await araraApiFetch(`/api/admin/feed?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();

      // A plataforma devolve `{ data: [...], count }`; o portal antigo devolvia
      // `{ feed: [...] }`. Sem normalizar aqui, `feed` virava undefined e o
      // agrupamento por tempo (`for … of`) derrubava a página inteira.
      const brutos: Record<string, unknown>[] = Array.isArray(data?.feed)
        ? data.feed
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];
      const itens: FeedItem[] = brutos.map(normalizarItem);

      if (opts?.cursor) {
        setFeed(prev => [...prev, ...itens]);
      } else if (opts?.prepend) {
        setFeed(prev => {
          const existingIds = new Set(prev.map((f: FeedItem) => f.id));
          const newItems = itens.filter((f: FeedItem) => !existingIds.has(f.id));
          return [...newItems, ...prev];
        });
      } else {
        setFeed(itens);
      }
      setNextCursor(data?.nextCursor ?? null);
    } finally {
      isFetching.current = false;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (initialFeed.length === 0) {
      fetchFeed();
    }
  }, [fetchFeed, initialFeed.length]);

  // Poll every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFeed({ prepend: true, silent: true });
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  const groups = groupByTime(feed);

  if (loading) {
    return (
      <LoadingBlock size="sm" />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fetchFeed()}
          disabled={refreshing}
          className="gap-1.5 text-xs text-muted-foreground h-7 px-2"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {feed.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma atividade recente</p>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map(item => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors group"
                  >
                    <span className="mt-0.5 text-base leading-none shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-foreground/80">
                            {item.actor?.name && (
                              <span className="font-medium text-foreground">{item.actor.name} </span>
                            )}
                            {item.message}
                          </span>
                          {item.ticket && (
                            <div className="mt-0.5">
                              <Link
                                href={`/admin/tickets/view/?id=${encodeURIComponent(item.ticket.id)}`}
                                className="text-[10px] text-sem-info-fg hover:underline"
                              >
                                {item.ticket.ticketNumber ? `#${item.ticket.ticketNumber}` : item.ticket.title}
                                {item.ticket.companyName && ` — ${item.ticket.companyName}`}
                              </Link>
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground mt-0.5">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {nextCursor && (
            <button
              onClick={() => fetchFeed({ cursor: nextCursor })}
              disabled={loadingMore}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground/80 hover:bg-muted/50 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
