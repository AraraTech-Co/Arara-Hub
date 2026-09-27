'use client'

import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { whatsappApi, type WAAgent } from '@/lib/api/whatsapp'
import { cn } from '@/lib/utils'

interface AssignMenuProps {
  /** Agente atualmente atribuído (para não reatribuir a ele mesmo). */
  currentAgentId: string | null
  /** Reatribui a conversa ao agente escolhido. */
  onReassign: (agentId: string) => void | Promise<void>
  disabled?: boolean
  className?: string
}

/**
 * Dropdown "Atribuir a outro" — atendentes de GET /api/whatsapp/agents.
 * Usa o Select do design system; antes era um `<select>` nativo, que destoava
 * do resto da interface e não seguia o tema.
 */
export function AssignMenu({
  currentAgentId,
  onReassign,
  disabled,
  className,
}: AssignMenuProps) {
  const [agents, setAgents] = useState<WAAgent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    whatsappApi
      .listAgents()
      .then((res) => {
        if (!cancelled) setAgents(res.data)
      })
      .catch(() => {
        if (!cancelled) setAgents([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const options = agents.filter((a) => a.id !== currentAgentId)

  return (
    <Select
      value=""
      disabled={disabled || loading || options.length === 0}
      onValueChange={(id) => {
        if (id) void onReassign(id)
      }}
    >
      <SelectTrigger className={cn('h-8 text-xs', className)} aria-label="Atribuir a outro atendente">
        <SelectValue
          placeholder={
            loading
              ? 'Carregando…'
              : options.length === 0
                ? 'Nenhum outro atendente'
                : 'Atribuir a outro…'
          }
        />
      </SelectTrigger>
      <SelectContent>
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id} className="text-xs">
            <span className="flex items-center gap-1.5">
              {a.online && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-sem-success-fg"
                  aria-hidden
                />
              )}
              {a.name ?? 'Sem nome'}
              {a.online && <span className="sr-only">(online)</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
