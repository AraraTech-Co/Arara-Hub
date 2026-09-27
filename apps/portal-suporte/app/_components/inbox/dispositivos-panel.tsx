'use client'

// =============================================================================
// Dispositivo → operador (17/09/2026).
//
// Quem responde pelo celular/WhatsApp Web não vem nomeado no webhook — mas o
// APARELHO vem: cada WhatsApp Web ligado ao número é `numero:N`, o celular é
// o 0. Mapeando "3 = Judá, 5 = Thiago", a mensagem ganha o nome de quem
// respondeu e a conversa vai para essa pessoa. Admin configura uma vez; a
// lista mostra só aparelhos que já responderam (ou já mapeados).
// =============================================================================

import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import { adminSettingsApi } from '@/lib/api/admin'
import { whatsappApi } from '@/lib/api/whatsapp'
import { arara } from '@/lib/arara/client'
import { hasMinRole } from '@/lib/arara/auth-storage'

type Linha = { dispositivo: string; mensagens: number; ultimo_uso: string | null; ultima_mensagem: string; profile_id: string | null }

export function DispositivosPanel() {
  const { toast } = useToast()
  const [aberto, setAberto] = useState(false)
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([])
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    let vivo = true
    Promise.all([whatsappApi.dispositivos(), arara.profiles()])
      .then(([d, p]) => {
        if (!vivo) return
        setLinhas(d.data || [])
        setPessoas(
          ((p.data || []) as Record<string, unknown>[])
            .filter((pr) => hasMinRole(pr.role, 'support') && pr.active !== false)
            .map((pr) => ({ id: String(pr.id), nome: String(pr.full_name || pr.fullName || pr.name || pr.email || 'Sem nome') }))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        )
      })
      .catch(() => { if (vivo) setLinhas([]) })
    return () => { vivo = false }
  }, [aberto])

  async function mapear(dispositivo: string, profileId: string) {
    if (!linhas) return
    setSalvando(dispositivo)
    const antes = linhas
    const depois = linhas.map((l) => (l.dispositivo === dispositivo ? { ...l, profile_id: profileId || null } : l))
    setLinhas(depois)
    const mapa: Record<string, string> = {}
    for (const l of depois) if (l.profile_id) mapa[l.dispositivo] = l.profile_id
    try {
      await adminSettingsApi.update({ waDispositivos: mapa })
      const nome = pessoas.find((p) => p.id === profileId)?.nome
      toast({ title: profileId ? `Dispositivo ${dispositivo} → ${nome}` : `Dispositivo ${dispositivo} sem operador`, description: 'Vale para as próximas respostas por esse aparelho.' })
    } catch (err) {
      setLinhas(antes)
      toast({ title: 'Erro ao salvar', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' })
    } finally {
      setSalvando(null)
    }
  }

  const rotulo = (d: string) => (d === '0' ? 'Celular (aparelho)' : `WhatsApp Web · sessão ${d}`)

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button"
          className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          title="Quem responde por cada aparelho ligado ao número do suporte">
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Dispositivos
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-3" align="end">
        <p className="mb-1 text-sm font-medium text-foreground">Quem responde por cada aparelho</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Resposta pelo celular ou WhatsApp Web chega sem nome, mas com o aparelho. Diga de quem é cada
          um: a mensagem ganha o nome e a conversa vai para essa pessoa.
        </p>
        {linhas === null ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : linhas.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma resposta pelo celular registrada ainda. Assim que alguém responder por lá, o aparelho aparece aqui.</p>
        ) : (
          <ul className="space-y-2">
            {linhas.map((l) => (
              <li key={l.dispositivo} className="rounded-md border border-border px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground">{rotulo(l.dispositivo)}</span>
                  <select
                    value={l.profile_id ?? ''}
                    onChange={(e) => void mapear(l.dispositivo, e.target.value)}
                    disabled={salvando === l.dispositivo}
                    className="h-7 max-w-[11rem] rounded-md border border-border bg-background px-2 text-xs"
                    aria-label={`Operador do ${rotulo(l.dispositivo)}`}
                  >
                    <option value="">— sem operador —</option>
                    {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {l.mensagens} mensagem{l.mensagens === 1 ? '' : 's'}
                  {l.ultimo_uso ? ` · última ${new Date(l.ultimo_uso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                  {l.ultima_mensagem ? ` · “${l.ultima_mensagem}”` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
