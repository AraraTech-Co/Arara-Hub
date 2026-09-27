'use client'

import { useEffect, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { adminSettingsApi } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

/**
 * Liga/desliga a triagem por MENUS (determinística, estilo BotConversa) das
 * conversas de WhatsApp.
 *
 * Ligado → o cliente recebe o menu de opções e navega até ser atendido/escalado.
 * Desligado → tudo cai direto para a equipe (sem menu).
 *
 * Visível só para admin+: é cliente real do outro lado.
 */
export function MenuToggle({ className }: { className?: string }) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    adminSettingsApi
      .get()
      .then((res) => {
        if (active) setEnabled(Boolean(res.data?.waMenuEnabled))
      })
      .catch(() => {
        if (active) setEnabled(null)
      })
    return () => {
      active = false
    }
  }, [])

  // Sem o valor real, não renderiza (mostrar "off" por falta de dado enganaria).
  if (enabled === null) return null

  async function handleToggle(next: boolean) {
    if (busy) return
    setBusy(true)
    setEnabled(next) // otimista
    try {
      await adminSettingsApi.update({ waMenuEnabled: next })
      toast({
        title: next ? 'Menu ligado' : 'Menu desligado',
        description: next
          ? 'O cliente passa a receber o menu de opções para triagem automática.'
          : 'Sem menu — as conversas vão direto para a equipe.',
      })
    } catch (err) {
      setEnabled(!next) // reverte
      toast({
        title: 'Erro ao alterar o menu',
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
          ? 'Triagem por menus ligada — o cliente escolhe as opções até ser atendido'
          : 'Triagem por menus desligada — tudo vai direto para a equipe'
      }
    >
      <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className={enabled ? 'font-medium text-foreground' : 'text-muted-foreground'}>Menu</span>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => void handleToggle(v)}
        disabled={busy}
        aria-label="Triagem por menus"
      />
    </label>
  )
}
