'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { adminSettingsApi } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

/**
 * Grupos do WhatsApp na inbox (17/09/2026).
 *
 * Desligado → mensagem de grupo é ignorada na entrada, como sempre foi.
 * Ligado   → cada grupo vira uma conversa ("Grupo · nome"), cada mensagem
 *            mostra quem falou, dá para responder no grupo; grupo NÃO passa
 *            por menu nem rodízio.
 *
 * Só admin+, como os vizinhos: é regra de operação da equipe.
 */
export function GruposToggle({ className }: { className?: string }) {
  const { toast } = useToast()
  const [ligado, setLigado] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ativo = true
    adminSettingsApi.get()
      .then((res) => { if (ativo) setLigado(Boolean(res.data?.waGruposEnabled)) })
      .catch(() => { if (ativo) setLigado(null) })
    return () => { ativo = false }
  }, [])

  if (ligado === null) return null

  async function alternar(prox: boolean) {
    if (busy) return
    setBusy(true)
    setLigado(prox)
    try {
      await adminSettingsApi.update({ waGruposEnabled: prox })
      toast({
        title: prox ? 'Grupos ligados' : 'Grupos desligados',
        description: prox
          ? 'Mensagens de grupo passam a entrar na inbox como conversas do grupo.'
          : 'Mensagens de grupo voltam a ser ignoradas na entrada.',
      })
    } catch (err) {
      setLigado(!prox)
      toast({ title: 'Erro ao alterar grupos', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <label
      className={cn('flex cursor-pointer items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs', className)}
      title={ligado ? 'Grupos do WhatsApp entram na inbox como conversas' : 'Mensagens de grupo são ignoradas'}
    >
      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className={ligado ? 'font-medium text-foreground' : 'text-muted-foreground'}>Grupos</span>
      <Switch checked={ligado} onCheckedChange={(v) => void alternar(v)} disabled={busy} aria-label="Grupos do WhatsApp na inbox" />
    </label>
  )
}
