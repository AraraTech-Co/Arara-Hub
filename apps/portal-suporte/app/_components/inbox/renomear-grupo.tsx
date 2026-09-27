'use client'

// =============================================================================
// Nomear um grupo do WhatsApp (17/09/2026).
//
// O portal busca o assunto na Avisa sozinho, mas ela nem sempre sabe: grupo do
// qual a instância saiu, ou que ela não devolve. Sem isto, esse grupo fica
// "Grupo · <fim do id>" para sempre. O nome escrito aqui é MANUAL e a busca
// automática não o sobrescreve.
// =============================================================================

import { useState } from 'react'
import { Loader2, PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { whatsappApi } from '@/lib/api/whatsapp'

export function RenomearGrupo({
  conversaId,
  nomeAtual,
  onSalvo,
}: {
  conversaId: string
  nomeAtual: string | null
  onSalvo: () => void
}) {
  const { toast } = useToast()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(nomeAtual ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const valor = nome.trim()
    if (!valor || salvando) return
    setSalvando(true)
    try {
      await whatsappApi.updateConversation(conversaId, { contact_name: valor })
      toast({ title: 'Grupo renomeado', description: 'O nome vale só aqui no portal.' })
      setEditando(false)
      onSalvo()
    } catch (err) {
      toast({
        title: 'Não foi possível renomear',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => { setNome(nomeAtual ?? ''); setEditando(true) }}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <PencilLine className="h-3.5 w-3.5" aria-hidden />
        {nomeAtual ? 'Renomear grupo' : 'Dar nome ao grupo'}
      </button>
    )
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void salvar() }
          if (e.key === 'Escape') setEditando(false)
        }}
        placeholder="Nome do grupo"
        autoFocus
        className="h-8 text-sm"
      />
      <Button size="sm" onClick={() => void salvar()} disabled={!nome.trim() || salvando}>
        {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>
        Cancelar
      </Button>
    </div>
  )
}
