'use client'

// =============================================================================
// Barra de filtros do Kanban Dev (item 2.4). A regra de cada filtro mora em
// lib/dev-filtros.ts; aqui é só a tela. Filtros se combinam, e "Limpar" volta
// ao quadro inteiro.
// =============================================================================

import { useState } from 'react'
import { Building2, Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { PRIORITY_OPTIONS } from '@/lib/ticket-priority'
import { TICKET_SOURCES } from '@/lib/ticket-source'
import { SITUACAO_PRAZO_LABEL, type SituacaoPrazo } from '@/lib/dev-prazo'
import { DEV_LABELS, type DevStatus } from '@/lib/kanban-dev'
import { contarAtivos, FILTROS_VAZIOS, SEM_RESPONSAVEL, type FiltrosDev, type OrigemFiltro } from '@/lib/dev-filtros'

const SELECT = 'h-8 rounded-md border border-border bg-background px-2 text-sm'
const PRAZOS: SituacaoPrazo[] = ['vencido', 'em_risco', 'no_prazo', 'sem_prazo']

function EmpresasMulti({ valor, opcoes, onChange }: { valor: string[]; opcoes: string[]; onChange: (v: string[]) => void }) {
  const [aberto, setAberto] = useState(false)
  const alternar = (nome: string) =>
    onChange(valor.includes(nome) ? valor.filter((v) => v !== nome) : [...valor, nome])
  const rotulo =
    valor.length === 0 ? 'Todas as empresas' : valor.length === 1 ? valor[0] : `${valor.length} empresas`

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" aria-expanded={aberto}
          className={`${SELECT} flex w-52 items-center gap-1.5 text-left ${valor.length ? 'border-primary/60' : ''}`}>
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">{rotulo}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar empresa…" className="h-8 text-sm" />
          <CommandList>
            <CommandEmpty>Nenhuma empresa nos cards.</CommandEmpty>
            {opcoes.map((nome) => (
              <CommandItem key={nome} value={nome} onSelect={() => alternar(nome)} className="text-sm">
                <Check className={`mr-2 h-3.5 w-3.5 ${valor.includes(nome) ? 'opacity-100' : 'opacity-0'}`} />
                <span className="truncate">{nome}</span>
              </CommandItem>
            ))}
          </CommandList>
          {valor.length > 0 && (
            <button type="button" onClick={() => onChange([])}
              className="w-full border-t border-border px-3 py-2 text-left text-xs text-primary hover:bg-muted">
              Limpar empresas
            </button>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function DevFilterBar({
  filtros,
  onChange,
  empresas,
  pessoas,
  total,
  visiveis,
}: {
  filtros: FiltrosDev
  onChange: (f: FiltrosDev) => void
  /** Empresas presentes nos cards, já ordenadas. */
  empresas: string[]
  /** Quem pode ser responsável (suporte para cima). */
  pessoas: { id: string; nome: string }[]
  total: number
  visiveis: number
}) {
  const muda = <K extends keyof FiltrosDev>(chave: K, valor: FiltrosDev[K]) => onChange({ ...filtros, [chave]: valor })
  const ativos = contarAtivos(filtros)
  // Responsável filtrado que saiu da lista (pessoa removida da equipe) continua
  // aparecendo: sem isto o select fica em branco e parece que o filtro sumiu.
  const foraDaLista =
    filtros.responsavel && filtros.responsavel !== SEM_RESPONSAVEL && !pessoas.some((p) => p.id === filtros.responsavel)

  return (
    <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filtros.busca}
          onChange={(e) => muda('busca', e.target.value)}
          placeholder="Número, título ou empresa…"
          aria-label="Buscar"
          className="h-8 w-60 rounded-md border border-border bg-background pl-8 pr-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      <EmpresasMulti valor={filtros.empresas} opcoes={empresas} onChange={(v) => muda('empresas', v)} />

      <select value={filtros.responsavel} onChange={(e) => muda('responsavel', e.target.value)} className={SELECT} aria-label="Responsável">
        <option value="">Todos os responsáveis</option>
        <option value={SEM_RESPONSAVEL}>Sem responsável</option>
        {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        {foraDaLista && <option value={filtros.responsavel}>Responsável fora da equipe atual</option>}
      </select>

      <select value={filtros.prioridade} onChange={(e) => muda('prioridade', e.target.value)} className={SELECT} aria-label="Prioridade">
        <option value="">Toda prioridade</option>
        {[...PRIORITY_OPTIONS].reverse().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select value={filtros.prazo} onChange={(e) => muda('prazo', e.target.value as FiltrosDev['prazo'])} className={SELECT} aria-label="Prazo">
        <option value="">Todo prazo</option>
        {PRAZOS.map((p) => <option key={p} value={p}>{SITUACAO_PRAZO_LABEL[p]}</option>)}
      </select>

      <select value={filtros.status} onChange={(e) => muda('status', e.target.value)} className={SELECT} aria-label="Status">
        <option value="">Todo status</option>
        {(Object.keys(DEV_LABELS) as DevStatus[]).map((s) => <option key={s} value={s}>{DEV_LABELS[s]}</option>)}
      </select>

      <select value={filtros.origem} onChange={(e) => muda('origem', e.target.value as OrigemFiltro)} className={SELECT} aria-label="Origem">
        <option value="">Toda origem</option>
        <option value="interna">Interna (Desenvolvimento)</option>
        <option value="escalado">De chamado (qualquer canal)</option>
        {TICKET_SOURCES.map((s) => <option key={s.value} value={s.value}>Chamado · {s.label}</option>)}
      </select>

      {ativos > 0 && (
        <>
          <span className="text-xs tabular-nums text-muted-foreground">{visiveis} de {total}</span>
          <button type="button" onClick={() => onChange(FILTROS_VAZIOS)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <X className="h-3 w-3" />
            Limpar filtros ({ativos})
          </button>
        </>
      )}
    </div>
  )
}
