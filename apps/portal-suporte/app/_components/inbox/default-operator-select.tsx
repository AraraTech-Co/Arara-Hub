'use client'

import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { adminSettingsApi } from '@/lib/api/admin'
import { arara } from '@/lib/arara/client'
import { hasMinRole } from '@/lib/arara/auth-storage'
import { cn } from '@/lib/utils'

/**
 * Quem assume a conversa quando a resposta sai pelo CELULAR ou WhatsApp Web.
 *
 * Pelo portal, quem responde assume. Pelo celular o webhook não diz qual
 * operador foi — o número é um só —, e a conversa respondida ficava na fila.
 * Com um operador padrão ela sai da fila na hora e ganha dono; quem quiser
 * puxa para si depois. Vazio = comportamento antigo (fica na fila).
 *
 * Visível só para admin+, como o Rodízio: é regra da equipe.
 */
export function DefaultOperatorSelect({ className }: { className?: string }) {
  const { toast } = useToast()
  const [valor, setValor] = useState<string | null>(null)
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ativo = true
    Promise.all([adminSettingsApi.get(), arara.profiles()])
      .then(([cfg, p]) => {
        if (!ativo) return
        setValor(String(cfg.data?.waOperadorPadraoId ?? ''))
        setPessoas(
          ((p.data || []) as Record<string, unknown>[])
            .filter((pr) => hasMinRole(pr.role, 'support') && pr.active !== false)
            .map((pr) => ({ id: String(pr.id), nome: String(pr.full_name || pr.fullName || pr.name || pr.email || 'Sem nome') }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        )
      })
      .catch(() => { if (ativo) setValor(null) })
    return () => { ativo = false }
  }, [])

  // Sem o valor real não se mostra um select que pode estar errado.
  if (valor === null) return null

  async function mudar(id: string) {
    if (busy) return
    const antes = valor
    setBusy(true)
    setValor(id)
    try {
      await adminSettingsApi.update({ waOperadorPadraoId: id || null })
      const nome = pessoas.find((p) => p.id === id)?.nome
      toast({
        title: id ? `Respostas pelo celular vão para ${nome}` : 'Respostas pelo celular ficam na fila',
        description: id
          ? 'Conversa respondida pelo celular ou WhatsApp Web passa a ter este responsável.'
          : 'Conversa respondida pelo celular continua na fila até alguém assumir.',
      })
    } catch (err) {
      setValor(antes)
      toast({
        title: 'Erro ao salvar o operador padrão',
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
        'flex items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs',
        className,
      )}
      title="Quem assume a conversa quando a resposta sai pelo celular ou WhatsApp Web (o webhook não diz qual operador respondeu)"
    >
      <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className={valor ? 'font-medium text-foreground' : 'text-muted-foreground'}>Celular →</span>
      <select
        value={valor}
        onChange={(e) => void mudar(e.target.value)}
        disabled={busy}
        aria-label="Operador que assume respostas pelo celular"
        className="max-w-[11rem] bg-transparent text-xs text-foreground outline-none disabled:opacity-50"
      >
        <option value="">fica na fila</option>
        {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
    </label>
  )
}
