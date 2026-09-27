'use client'

// =============================================================================
// Adicionar membro — liberação de acesso feita pelo ADMIN (15/09/2026).
//
// O convite por código não funciona para gente nova: quem resgata é a própria
// pessoa, e a plataforma recusa a chamada antes do portal rodar porque ela
// ainda não é membro do app. Aqui é o admin, com a própria sessão, que cria a
// conta (ou acha a existente), grava o perfil e dá o acesso. Ver
// lib/api/membros.ts para os três passos.
// =============================================================================

import { useState } from 'react'
import { Check, Copy, Loader2, UserPlus, Wand2 } from 'lucide-react'
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
import { mascaraTelefone, soDigitosTelefone } from '@/lib/utils'
import { gerarSenha } from '@/lib/api/crm'
import { adicionarMembro, type PapelMembro, type ResultadoMembro } from '@/lib/api/membros'

const PAPEIS: { value: PapelMembro; label: string; ajuda: string }[] = [
  { value: 'support', label: 'Suporte', ajuda: 'Atende chamados e WhatsApp' },
  { value: 'developer', label: 'Desenvolvedor', ajuda: 'Suporte + quadro Dev' },
  { value: 'admin', label: 'Administrador', ajuda: 'Tudo, inclusive equipe e configurações' },
]

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AdicionarMembroDialog({ onAdicionado }: { onAdicionado?: () => void }) {
  const { toast } = useToast()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [papel, setPapel] = useState<PapelMembro>('support')
  const [telefone, setTelefone] = useState('')
  const [trocarSenha, setTrocarSenha] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [passo, setPasso] = useState('')
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResultadoMembro | null>(null)
  const [copiado, setCopiado] = useState(false)

  const limpar = () => {
    setNome(''); setEmail(''); setSenha(''); setPapel('support'); setTelefone('')
    setTrocarSenha(false); setErro(''); setPasso(''); setResultado(null); setCopiado(false)
  }

  const telDigitos = soDigitosTelefone(telefone)
  const telInvalido = telDigitos.length > 0 && (telDigitos.length < 10 || telDigitos.length > 13)
  const pronto = Boolean(nome.trim() && EMAIL_OK.test(email.trim()) && senha.length >= 8 && !telInvalido)

  const confirmar = async () => {
    setErro(''); setSalvando(true)
    try {
      const r = await adicionarMembro(
        {
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          senha,
          role: papel,
          phone: telDigitos || undefined,
          trocarSenhaSeExistir: trocarSenha,
        },
        setPasso,
      )
      setResultado(r)
      onAdicionado?.()
      toast({ title: 'Acesso liberado', description: `${r.email} já pode entrar no portal.` })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
      setPasso('')
    }
  }

  // Senha só aparece no resumo quando é a que a pessoa vai usar: conta nova,
  // ou conta existente cuja senha foi trocada aqui.
  const senhaParaPassar = resultado && (resultado.contaCriada || resultado.senhaDefinida) ? senha : null

  const copiarDados = async () => {
    if (!resultado) return
    const linhas = [
      'Acesso ao Portal de Suporte Arara Tech',
      'Endereço: https://suporte.arara-tech.com/auth/login',
      `E-mail: ${resultado.email}`,
      senhaParaPassar ? `Senha: ${senhaParaPassar}` : 'Senha: a mesma que você já usa na Arara',
    ]
    try {
      await navigator.clipboard.writeText(linhas.join('\n'))
      setCopiado(true)
    } catch {
      toast({ title: 'Não foi possível copiar', description: 'Selecione o texto e copie manualmente.', variant: 'destructive' })
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) limpar() }}>
      <Button className="gap-2" onClick={() => setAberto(true)}>
        <UserPlus className="h-4 w-4" />
        Adicionar membro
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {!resultado ? (
          <>
            <DialogHeader>
              <DialogTitle>Adicionar membro</DialogTitle>
              <DialogDescription>
                Cria a conta (ou usa a que já existe com este e-mail), define o papel e libera o acesso
                ao portal. A pessoa entra direto pelo login, sem código de convite.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="am-nome">Nome completo *</Label>
                <Input id="am-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da pessoa" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="am-email">E-mail *</Label>
                <Input id="am-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@arara-tech.com" />
                {email && !EMAIL_OK.test(email.trim()) && <p className="text-xs text-destructive">E-mail inválido.</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="am-senha">Senha inicial *</Label>
                <div className="flex gap-2">
                  <Input id="am-senha" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password" spellCheck={false} className="font-mono" />
                  <Button type="button" variant="outline" className="shrink-0 gap-1.5" onClick={() => setSenha(gerarSenha())}>
                    <Wand2 className="h-3.5 w-3.5" />
                    Gerar
                  </Button>
                </div>
                {senha && senha.length < 8 && <p className="text-xs text-destructive">A senha precisa ter pelo menos 8 caracteres.</p>}
              </div>
              <div className="space-y-1">
                <Label>Papel</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PAPEIS.map((p) => (
                    <button key={p.value} type="button" onClick={() => setPapel(p.value)}
                      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${papel === p.value ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                      <span className="block font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.ajuda}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="am-tel">WhatsApp <span className="font-normal text-muted-foreground">(opcional — usado na recuperação de senha)</span></Label>
                <Input id="am-tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} placeholder="+55 (19) 99999-9999" />
                {telInvalido && <p className="text-xs text-destructive">Informe o número com DDD.</p>}
              </div>
              <label className="flex items-start gap-2 text-sm text-foreground/80">
                <input type="checkbox" className="mt-0.5" checked={trocarSenha} onChange={(e) => setTrocarSenha(e.target.checked)} />
                <span>
                  Se este e-mail já tiver conta na Arara, trocar a senha dela pela desta tela.
                  <span className="block text-xs text-muted-foreground">
                    Desmarcado, a pessoa continua entrando com a senha que já usa.
                  </span>
                </span>
              </label>

              {erro && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>Cancelar</Button>
              <Button onClick={confirmar} disabled={!pronto || salvando} className="gap-2">
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {salvando ? passo || 'Liberando…' : 'Adicionar e liberar acesso'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Acesso liberado</DialogTitle>
              <DialogDescription>
                {resultado.contaCriada
                  ? 'Conta criada e acesso liberado. Passe os dados abaixo para a pessoa.'
                  : resultado.senhaDefinida
                    ? 'A conta já existia; a senha foi trocada pela desta tela e o acesso liberado.'
                    : 'A conta já existia; o acesso foi liberado e a pessoa entra com a senha que já usa.'}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-muted/50 p-4 text-sm">
              <dt className="text-muted-foreground">Endereço</dt><dd>suporte.arara-tech.com/auth/login</dd>
              <dt className="text-muted-foreground">E-mail</dt><dd className="break-all">{resultado.email}</dd>
              <dt className="text-muted-foreground">Senha</dt>
              <dd className="font-mono">{senhaParaPassar ?? <span className="font-sans text-muted-foreground">a que a pessoa já usa</span>}</dd>
              <dt className="text-muted-foreground">Papel</dt><dd>{PAPEIS.find((p) => p.value === resultado.role)?.label ?? resultado.role}</dd>
            </dl>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={copiarDados} className="gap-2">
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado ? 'Copiado' : 'Copiar dados de acesso'}
              </Button>
              <Button variant="outline" onClick={limpar}>Adicionar outro</Button>
              <Button onClick={() => setAberto(false)}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
