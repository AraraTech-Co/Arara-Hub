'use client'

// =============================================================================
// Cadastrar (ou editar) o contato de uma conversa do WhatsApp (15/09/2026).
//
// O nome passa a aparecer na lista e no painel, e as PRÓXIMAS conversas do
// mesmo número já chegam reconhecidas. Conversa sem telefone (LID): o contato
// fica reconhecido pelo LID mesmo assim, e o telefone digitado aqui é o que
// permite responder pelo portal.
// =============================================================================

import { useState } from 'react'
import { Loader2, UserPen, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useCompanies } from '@/hooks/use-companies'
import { mascaraTelefone, soDigitosTelefone } from '@/lib/utils'
import { whatsappApi, type WAConversationDetail } from '@/lib/api/whatsapp'
import { digitosDoJid, ehNomeProprio, ehSemTelefone } from '@/lib/wa-contato'

export function CadastrarContatoDialog({
  conversa,
  onSalvo,
}: {
  conversa: WAConversationDetail
  onSalvo?: () => void
}) {
  const { toast } = useToast()
  const [aberto, setAberto] = useState(false)
  const semTelefone = ehSemTelefone(conversa.remoteJid)
  const jaTemContato = Boolean(conversa.contact)

  const nomeInicial = () => {
    const candidatos = [conversa.contact?.name, conversa.contactName]
    for (const n of candidatos) {
      const t = String(n ?? '').trim()
      // Nome só com dígitos é o próprio número, não nome.
      if (t && !ehNomeProprio(t) && /\D/.test(t.replace(/[\s()+-]/g, ''))) return t
    }
    return ''
  }
  const telefoneInicial = () => {
    const doCadastro = conversa.contact?.whatsapp || conversa.contact?.phone
    if (doCadastro) return mascaraTelefone(`+${soDigitosTelefone(doCadastro)}`)
    return semTelefone ? '' : mascaraTelefone(`+${digitosDoJid(conversa.remoteJid)}`)
  }

  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const { cadastradas, loading: carregandoEmpresas } = useCompanies()
  const empresas = [...cadastradas].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const abrir = () => {
    setNome(nomeInicial())
    setTelefone(telefoneInicial())
    setEmpresaId(conversa.company?.id ?? '')
    setErro('')
    setAberto(true)
  }

  const telDigitos = soDigitosTelefone(telefone)
  const telInvalido = telDigitos.length > 0 && (telDigitos.length < 10 || telDigitos.length > 13)
  const pronto = Boolean(nome.trim()) && !telInvalido

  const salvar = async () => {
    setErro(''); setSalvando(true)
    try {
      const r = await whatsappApi.cadastrarContato(conversa.id, {
        nome: nome.trim(),
        telefone: telDigitos || undefined,
        empresa_id: empresaId || undefined,
      })
      toast({
        title: jaTemContato || r.data.ja_existia ? 'Contato atualizado' : 'Contato cadastrado',
        description: r.data.sem_telefone
          ? 'Sem telefone: a pessoa fica reconhecida, mas responder pelo portal precisa do número.'
          : 'As próximas conversas deste número já chegam com o nome.',
      })
      setAberto(false)
      onSalvo?.()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <button type="button" onClick={abrir}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        {jaTemContato ? <UserPen className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
        {jaTemContato ? 'Editar contato' : 'Cadastrar contato'}
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{jaTemContato ? 'Editar contato' : 'Cadastrar contato'}</DialogTitle>
          <DialogDescription>
            O nome passa a aparecer nesta conversa, e as próximas conversas deste número já chegam
            reconhecidas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="cc-nome">Nome *</Label>
            <Input id="cc-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cc-tel">
              WhatsApp {semTelefone ? '' : <span className="font-normal text-muted-foreground">(veio da conversa)</span>}
            </Label>
            <Input id="cc-tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="+55 (19) 99999-9999" />
            {telInvalido && <p className="text-xs text-destructive">Informe o número com DDD.</p>}
            {semTelefone && (
              <p className="text-xs text-muted-foreground">
                O WhatsApp não mostrou o número desta pessoa. Sem ele o contato fica reconhecido nas
                próximas conversas, mas só dá para responder pelo portal com o número informado aqui.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cc-empresa">
              Empresa <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <select id="cc-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} disabled={carregandoEmpresas}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50">
              <option value="">{carregandoEmpresas ? 'Carregando…' : 'Sem empresa'}</option>
              {empresas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={!pronto || salvando} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar contato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
