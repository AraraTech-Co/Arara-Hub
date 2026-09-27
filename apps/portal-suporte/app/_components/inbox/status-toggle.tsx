'use client'

import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { adminSettingsApi } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

/**
 * Liga/desliga o aviso automático de MUDANÇA DE SITUAÇÃO por WhatsApp.
 *
 * Quando o chamado troca de etapa, o cliente recebe uma mensagem com a nova
 * situação em negrito e o link de acompanhamento. O aviso só sai quando o
 * rótulo que o cliente lê muda de fato — etapa interna nunca vira mensagem.
 *
 * Desligar não apaga nada: para de mandar. O cliente continua podendo
 * acompanhar em /acompanhar com número e código.
 *
 * Visível só para admin+, como os vizinhos: é cliente real do outro lado.
 */
export function StatusToggle({ className }: { className?: string }) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    adminSettingsApi
      .get()
      .then((res) => {
        // AUSENTE = LIGADO. O aviso existe desde antes desta chave; mostrar
        // "desligado" porque o campo ainda não foi gravado diria ao operador
        // que o cliente não está sendo avisado — quando está. O servidor usa
        // exatamente a mesma regra (`!== false`).
        if (active) setEnabled(res.data?.waStatusEnabled !== false)
      })
      .catch(() => {
        if (active) setEnabled(null)
      })
    return () => {
      active = false
    }
  }, [])

  // Sem o valor real, não renderiza: mostrar um estado inventado é pior do que
  // não mostrar botão nenhum, porque convida a clicar achando que corrige.
  if (enabled === null) return null

  async function handleToggle(next: boolean) {
    if (busy) return
    setBusy(true)
    setEnabled(next) // otimista
    try {
      await adminSettingsApi.update({ waStatusEnabled: next })
      toast({
        title: next ? 'Aviso de situação ligado' : 'Aviso de situação desligado',
        description: next
          ? 'O cliente volta a receber mensagem quando o chamado muda de etapa.'
          : 'Nenhuma mensagem de mudança de etapa será enviada. O acompanhamento pelo site continua.',
      })
    } catch (err) {
      setEnabled(!next) // reverte
      toast({
        title: 'Erro ao alterar o aviso',
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
          ? 'Aviso de situação ligado — o cliente recebe WhatsApp a cada mudança de etapa'
          : 'Aviso de situação desligado — nenhuma mensagem automática de mudança de etapa'
      }
    >
      <BellRing className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className={enabled ? 'font-medium text-foreground' : 'text-muted-foreground'}>Situação</span>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => void handleToggle(v)}
        disabled={busy}
        aria-label="Aviso de mudança de situação por WhatsApp"
      />
    </label>
  )
}
