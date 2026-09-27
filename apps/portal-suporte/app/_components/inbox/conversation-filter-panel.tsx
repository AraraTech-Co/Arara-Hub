'use client'

import { useEffect, useMemo, useState } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { whatsappApi, type WAInboxConversation, type WAInboxRef } from '@/lib/api/whatsapp'
import {
  FILTROS_VAZIOS, SEM_ATENDENTE, SEM_MOTIVO, countActive,
  type InboxFilters, type StatusFilter,
} from './conversation-filters'

/**
 * Funil de filtros da inbox — o equivalente ao ícone de funil do BotConversa.
 *
 * Um popover só, em vez de vários dropdowns na coluna: a lista de conversas é
 * estreita e cinco selects lado a lado deixariam a busca sem espaço.
 *
 * As opções de atendente/departamento/empresa/etiqueta são derivadas das
 * conversas carregadas — não adianta oferecer um filtro que não corresponde a
 * nenhuma conversa da tela. Os motivos vêm da API porque um motivo pode existir
 * sem nenhuma conversa ainda.
 */
export function ConversationFilterPanel({
  filters,
  onChange,
  conversations,
}: {
  filters: InboxFilters
  onChange: (f: InboxFilters) => void
  conversations: WAInboxConversation[]
}) {
  const [open, setOpen] = useState(false)
  const [reasons, setReasons] = useState<WAInboxRef[]>([])

  useEffect(() => {
    if (!open || reasons.length) return
    whatsappApi.listCloseReasons().then((r) => setReasons(r.data)).catch(() => {})
  }, [open, reasons.length])

  const { agents, departments, companies, tags } = useMemo(() => {
    const agents = new Map<string, string>()
    const departments = new Map<string, string>()
    const companies = new Map<string, string>()
    const tags = new Map<string, string>()
    for (const c of conversations) {
      if (c.assigned_to?.id) agents.set(c.assigned_to.id, c.assigned_to.name ?? 'Sem nome')
      if (c.department) departments.set(c.department.id, c.department.name)
      if (c.company) companies.set(c.company.id, c.company.name)
      for (const t of c.tags ?? []) tags.set(t.id, t.name)
    }
    const ord = (m: Map<string, string>) =>
      [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
    return { agents: ord(agents), departments: ord(departments), companies: ord(companies), tags: ord(tags) }
  }, [conversations])

  const ativos = countActive(filters)
  const set = (patch: Partial<InboxFilters>) => onChange({ ...filters, ...patch })

  const toggleReason = (id: string) => {
    const has = filters.closeReasonIds.includes(id)
    set({
      closeReasonIds: has
        ? filters.closeReasonIds.filter((r) => r !== id)
        : [...filters.closeReasonIds, id],
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0" aria-label="Filtros">
          <Filter className="h-4 w-4" />
          {ativos > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
              {ativos}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="max-h-[70vh] w-72 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Filtros</p>
          {ativos > 0 && (
            <button
              onClick={() => onChange(FILTROS_VAZIOS)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>

        <div className="space-y-3">
          <Campo label="Situação">
            <div className="flex gap-1">
              {(['ambos', 'abertos', 'concluidos'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => set({ status: s, ...(s === 'abertos' ? { closeReasonIds: [] } : {}) })}
                  className={`flex-1 rounded-md border px-2 py-1 text-xs capitalize transition-colors ${
                    filters.status === s
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {s === 'ambos' ? 'Ambos' : s === 'abertos' ? 'Abertos' : 'Concluídos'}
                </button>
              ))}
            </div>
          </Campo>

          {filters.status !== 'abertos' && (
            <Campo label="Motivo do encerramento">
              <ul className="space-y-1">
                {reasons.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground/90">
                      <input
                        type="checkbox"
                        checked={filters.closeReasonIds.includes(r.id)}
                        onChange={() => toggleReason(r.id)}
                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                      />
                      {r.name}
                    </label>
                  </li>
                ))}
                {/* Legado: concluídas antes de o motivo existir. Sem este balde
                    elas sumiriam de qualquer filtro por motivo. */}
                <li>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={filters.closeReasonIds.includes(SEM_MOTIVO)}
                      onChange={() => toggleReason(SEM_MOTIVO)}
                      className="h-3.5 w-3.5 accent-[var(--primary)]"
                    />
                    Sem motivo informado
                  </label>
                </li>
              </ul>
            </Campo>
          )}

          <Select
            label="Atendente"
            value={filters.agentId ?? ''}
            onChange={(v) => set({ agentId: v || null })}
            options={[{ value: SEM_ATENDENTE, label: 'Não atribuídas' }, ...agents.map(([value, label]) => ({ value, label }))]}
          />
          <Select
            label="Departamento"
            value={filters.departmentId ?? ''}
            onChange={(v) => set({ departmentId: v || null })}
            options={departments.map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Empresa"
            value={filters.companyId ?? ''}
            onChange={(v) => set({ companyId: v || null })}
            options={companies.map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Etiqueta"
            value={filters.tagId ?? ''}
            onChange={(v) => set({ tagId: v || null })}
            options={tags.map(([value, label]) => ({ value, label }))}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  // Sem opção nenhuma, o select fica desabilitado com a razão à mostra — melhor
  // do que um dropdown vazio que parece defeito.
  return (
    <Campo label={label}>
      <select
        value={value}
        disabled={!options.length}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
      >
        <option value="">{options.length ? 'Todos' : 'Nada para filtrar'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Campo>
  )
}
