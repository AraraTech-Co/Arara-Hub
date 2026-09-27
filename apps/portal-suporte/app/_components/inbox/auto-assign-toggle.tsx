'use client'

import { useEffect, useState } from 'react'
import { Shuffle } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { adminSettingsApi } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

/**
 * Liga/desliga a distribuição automática (rodízio) das conversas.
 *
 * Ligado  → conversa parada na fila é atribuída sozinha a um atendente online.
 * Desligado → ninguém recebe sem pedir; a equipe é notificada e puxa da fila.
 *
 * Visível só para admin+: é uma regra de operação da equipe, não preferência
 * individual (esta é o toggle Online/Offline ao lado).
 */
export function AutoAssignToggle({ className }: { className?: string }) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    adminSettingsApi
      .get()
      .then((res) => {
        if (active) setEnabled(Boolean(res.data?.waAutoAssignEnabled))
      })
      .catch(() => {
        // Sem o valor real não dá para mostrar um estado que pode estar errado.
        if (active) setEnabled(null)
      })
    return () => {
      active = false
    }
  }, [])

  // Enquanto não sabemos o estado real, não renderiza: um switch mostrando
  // "desligado" por falta de dado faria o admin achar que está desligado.
  if (enabled === null) return null

  async function handleToggle(next: boolean) {
    if (busy) return
    setBusy(true)
    setEnabled(next) // otimista
    try {
      await adminSettingsApi.update({ waAutoAssignEnabled: next })
      toast({
        title: next ? 'Rodízio ligado' : 'Rodízio desligado',
        description: next
          ? 'Conversas paradas na fila passam a ser distribuídas entre os atendentes online.'
          : 'Ninguém recebe conversa automaticamente; a equipe é avisada e puxa da fila.',
      })
    } catch (err) {
      setEnabled(!next) // reverte
      toast({
        title: 'Erro ao alterar o rodízio',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs',
        className,
      )}
      title={
        enabled
          ? 'Conversas paradas na fila são distribuídas automaticamente entre os atendentes online'
          : 'Distribuição automática desligada — a equipe puxa da fila manualmente'
      }
    >
      <Shuffle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className={enabled ? 'font-medium text-foreground' : 'text-muted-foreground'}>
        Rodízio
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => void handleToggle(v)}
        disabled={busy}
        aria-label="Distribuição automática de conversas"
      />
    </label>
  )
}
