'use client'

import { useMemo, useState } from 'react'
import { Inbox, Search, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { WAInboxConversation } from '@/lib/api/whatsapp'
import { ContactAvatar } from './contact-avatar'
import {
  ConversationChips,
  displayName,
  previewText,
  relativeTime,
} from './conversation-meta'
import { ConversationFilterPanel } from './conversation-filter-panel'
import { SoundToggle } from './sound-toggle'
import {
  FILTROS_VAZIOS, countActive, matchesFilters, matchesQuery, matchesTab,
  type InboxFilters, type InboxTab,
} from './conversation-filters'

export type { InboxTab }

// ─── Component ────────────────────────────────────────────────────────────────

interface ConversationListProps {
  conversations: WAInboxConversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
  /** Id do atendente logado (de /api/auth/me), para o filtro "Minhas". */
  meId: string | null
}

// Rótulos curtos de propósito: as quatro abas precisam caber numa coluna de
// ~370px sem rolar. "Concluídas" é o mesmo verbo do botão "Marcar como
// concluído" — uma palavra por coisa.
const TAB_LABEL: Record<InboxTab, string> = {
  fila: 'Fila',
  minhas: 'Minhas',
  atendimento: 'Atendimento',
  finalizadas: 'Concluídas',
  grupos: 'Grupos',
}
// Grupos NÃO é uma aba: é outro mundo, acionado pelo botão na linha da busca.
// Numa faixa que rola, o último item fica escondido — foi o que aconteceu.
const TABS: InboxTab[] = ['fila', 'minhas', 'atendimento', 'finalizadas']

/** O que cada aba vazia significa — no vocabulário da operação, sem "ticket". */
const VAZIO: Record<InboxTab, { titulo: string; texto: string }> = {
  fila: { titulo: 'Fila vazia', texto: 'Nenhuma conversa aguardando. Quem chegar aparece aqui primeiro.' },
  minhas: { titulo: 'Nada com você', texto: 'Conversas que você assumir ou responder ficam aqui até concluir.' },
  atendimento: { titulo: 'Ninguém atendendo agora', texto: 'Conversas com responsável, de toda a equipe.' },
  finalizadas: { titulo: 'Nada concluído ainda', texto: 'Conversas marcadas como concluídas ficam aqui por histórico.' },
  grupos: { titulo: 'Sem grupos', texto: 'Mensagens de grupos do WhatsApp aparecem aqui, separadas do atendimento.' },
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading,
  meId,
}: ConversationListProps) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<InboxTab>('fila')
  // Ao sair de Grupos, volta para a aba de conversas em que a pessoa estava.
  const [abaAnterior, setAbaAnterior] = useState<InboxTab>('fila')
  const emGrupos = tab === 'grupos'
  const alternarGrupos = () => {
    if (emGrupos) setTab(abaAnterior)
    else { setAbaAnterior(tab); setTab('grupos') }
  }
  const [filters, setFilters] = useState<InboxFilters>(FILTROS_VAZIOS)

  const counts = useMemo<Record<InboxTab, number>>(() => {
    const n: Record<InboxTab, number> = { fila: 0, minhas: 0, atendimento: 0, finalizadas: 0, grupos: 0 }
    for (const c of conversations) for (const t of [...TABS, 'grupos'] as InboxTab[]) if (matchesTab(c, t, meId)) n[t] += 1
    return n
  }, [conversations, meId])
  const gruposNaoLidos = useMemo(
    () => conversations.filter((c) => matchesTab(c, 'grupos', meId) && (c.unread_count ?? 0) > 0).length,
    [conversations, meId],
  )

  const filtered = useMemo(
    () =>
      conversations.filter(
        (c) => matchesTab(c, tab, meId) && matchesFilters(c, filters) && matchesQuery(c, query),
      ),
    [conversations, query, tab, meId, filters],
  )

  const filtrosAtivos = countActive(filters)

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border p-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="pl-8"
          />
        </div>
        <ConversationFilterPanel
          filters={filters}
          onChange={setFilters}
          conversations={conversations}
        />
        {/* Grupos: botão fixo, sempre visível, com a contagem de grupos com
            mensagem nova. Ligado, a lista abaixo mostra só grupos. */}
        <button
          type="button"
          onClick={alternarGrupos}
          aria-pressed={emGrupos}
          title={emGrupos ? 'Voltar às conversas' : 'Grupos do WhatsApp'}
          className={cn(
            'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            emGrupos
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
        >
          <Users className="h-4 w-4" aria-hidden />
          {gruposNaoLidos > 0 && !emGrupos && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-4 tabular-nums text-primary-foreground">
              {gruposNaoLidos}
            </span>
          )}
          <span className="sr-only">Grupos ({counts.grupos})</span>
        </button>
        <SoundToggle />
      </div>

      {/* Abas. Cada uma ocupa o que o rótulo pede (nunca uma fração igual da
          largura, que cortava "Grupos" em "Gru"); se não couberem, a faixa
          rola de lado sem barra visível. O número vem quieto, em tabular, ao
          lado do rótulo — pílula só na Fila com pendência, que é a única
          contagem que pede ação. */}
      {emGrupos ? (
        <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-[13px] font-semibold text-foreground">Grupos</span>
          <span className="text-[11px] font-medium tabular-nums text-foreground/65">{counts.grupos}</span>
          <button type="button" onClick={alternarGrupos}
            className="ml-auto text-xs font-medium text-primary hover:underline">
            Voltar às conversas
          </button>
        </div>
      ) : (
      <div
        role="tablist"
        aria-label="Conversas"
        className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => {
          const active = tab === t
          const n = counts[t]
          const pendente = t === 'fila' && n > 0
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={cn(
                'relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-[13px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                // O sublinhado é um filete de 2px na cor da marca: separação por
                // detalhe, não por bloco.
                'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
                active
                  ? 'font-semibold text-foreground after:bg-primary'
                  : 'font-medium text-muted-foreground after:bg-transparent hover:text-foreground',
              )}
            >
              {TAB_LABEL[t]}
              <span
                className={cn(
                  'tabular-nums',
                  pendente
                    ? 'rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-[18px] text-primary-foreground'
                    : cn('text-[11px] font-medium', active ? 'text-foreground/65' : 'text-muted-foreground/70'),
                )}
                aria-label={`${n} ${n === 1 ? 'conversa' : 'conversas'}`}
              >
                {n}
              </span>
            </button>
          )
        })}
      </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando conversas…</p>
        ) : filtered.length === 0 ? (
          // Vazio é um estado, não uma frase solta: diz o que a aba significa
          // e, quando é um filtro que esvaziou a lista, dá o caminho de volta.
          <div className="flex flex-col items-center px-6 pb-10 pt-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {tab === 'grupos' ? <Users className="h-5 w-5" aria-hidden /> : <Inbox className="h-5 w-5" aria-hidden />}
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              {query || filtrosAtivos ? 'Nenhuma conversa encontrada' : VAZIO[tab].titulo}
            </p>
            <p className="mt-1 max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
              {query || filtrosAtivos
                ? 'Nada bate com a busca ou com os filtros ligados.'
                : VAZIO[tab].texto}
            </p>
            {/* Lista vazia com filtro ligado parece bug; o botão desfaz na hora. */}
            {filtrosAtivos > 0 && (
              <button
                onClick={() => setFilters(FILTROS_VAZIOS)}
                className="mt-3 text-xs font-medium text-primary hover:underline"
              >
                Limpar {filtrosAtivos} {filtrosAtivos === 1 ? 'filtro' : 'filtros'}
              </button>
            )}
          </div>
        ) : (
          <ul>
            {filtered.map((c) => {
              const selected = c.id === selectedId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left',
                      'transition-colors duration-150 hover:bg-muted/60',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      selected && 'bg-muted',
                    )}
                  >
                    <ContactAvatar name={displayName(c)} seed={c.remote_jid} size="lg" />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {displayName(c)}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {relativeTime(c.updated_at)}
                        </span>
                      </span>

                      {c.company?.name && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {c.company.name}
                        </span>
                      )}

                      <span className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground/80">
                          {previewText(c)}
                        </span>
                        {c.unread_count > 0 && (
                          <Badge className="shrink-0 bg-primary px-1.5 py-0 text-[10px] leading-4 text-primary-foreground">
                            {c.unread_count}
                          </Badge>
                        )}
                      </span>

                      <ConversationChips conversation={c} className="mt-1.5" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
