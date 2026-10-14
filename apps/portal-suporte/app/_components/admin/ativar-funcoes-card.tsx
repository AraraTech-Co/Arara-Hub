'use client'

// =============================================================================
// ⚠️ TEMPORÁRIO — remover quando tudo estiver ativo em produção.
//
// Para apagar: este arquivo, `app/lib/ativar-funcoes.ts`, a linha que monta
// este card em `whatsapp-analytics-client.tsx` e o teste
// `scripts/testes-handlers/ativar-funcoes.test.js`.
//
// Existe porque as Fases 3, 4 e 5 subiram inertes: faltam os models e as
// chaves VAPID, que eram trabalho de quatro scripts Python dependentes de um
// `.env.local` com chave de API — arquivo que não existe na máquina de quem
// precisa ligar as features. Este card faz o mesmo pelo JWT que o navegador
// de quem está logado já tem.
//
// Quando tudo estiver ativo ele mostra só isso, sem botão.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, CircleDashed, Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  PASSOS, lerEstado, criarModel, acrescentarCampo, gerarVapid, gravarVapid,
  type EstadoDoPasso,
} from '@/lib/ativar-funcoes'

export function AtivarFuncoesCard() {
  const { toast } = useToast()
  const [estado, setEstado] = useState<EstadoDoPasso[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aplicando, setAplicando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [trocandoChaves, setTrocandoChaves] = useState(false)
  const [passoAtual, setPassoAtual] = useState<string | null>(null)

  const consultar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setEstado(await lerEstado())
    } catch (e) {
      // "Sessão necessária" é a mensagem do card do token: a mesma frase para
      // a mesma causa.
      setErro(e instanceof Error ? e.message : 'Não deu para consultar o estado.')
      setEstado(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  // Ao abrir: SIMULA. Lê e não grava, como os scripts sem `--aplicar`.
  useEffect(() => { void consultar() }, [consultar])

  const faltando = (estado ?? []).filter((p) => !p.existe)
  const tudoAtivo = !!estado && faltando.length === 0

  /** Aplica só o que falta, na ordem dos scripts, parando no primeiro erro. */
  const aplicar = useCallback(async (substituirChaves = false) => {
    setAplicando(true)
    setConfirmando(false)
    setTrocandoChaves(false)
    try {
      for (const passo of PASSOS) {
        const atual = (estado ?? []).find((p) => p.chave === passo.chave)
        const jaExiste = !!atual?.existe
        // Idempotente: o que já existe é pulado. Clicar duas vezes não duplica.
        if (jaExiste && !(passo.segredos && substituirChaves)) continue
        setPassoAtual(passo.rotulo)
        if (passo.model) await criarModel(passo.model)
        else if (passo.campo) await acrescentarCampo(passo.campo.model, passo.campo.nome)
        else if (passo.segredos) await gravarVapid(await gerarVapid())
      }
      toast({ title: 'Pronto', description: 'O que faltava foi criado.' })
    } catch (e) {
      // O texto do servidor, e os passos seguintes NÃO rodam: metade de uma
      // sequência é pior quando ninguém sabe onde ela parou.
      setErro(e instanceof Error ? e.message : 'Falhou, e o servidor não disse por quê.')
      toast({
        title: `Parou em: ${passoAtual ?? 'início'}`,
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setPassoAtual(null)
      setAplicando(false)
      await consultar()   // reconsulta: a tela mostra o estado real, não o esperado
    }
  }, [estado, passoAtual, toast, consultar])

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ativar funções novas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            As contas de WhatsApp por setor, os avisos no aparelho e o repositório de arquivos já
            estão no portal, mas só funcionam depois que estes registros existirem. Nada aqui
            altera conversa, chamado ou arquivo que já exista.
          </p>

          {carregando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o que já existe…
            </p>
          )}

          {erro && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">
                {erro === 'Sessão necessária'
                  ? 'Sessão necessária — saia e entre de novo.'
                  : erro}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void consultar()}>
                Tentar de novo
              </Button>
            </div>
          )}

          {estado && (
            <ul className="space-y-1">
              {estado.map((p) => (
                <li key={p.chave} className="flex items-center gap-2 text-sm">
                  {p.existe
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-sem-success-fg" aria-hidden />
                    : <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className={p.existe ? 'text-muted-foreground' : 'text-foreground'}>
                    {p.rotulo}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {p.fase} · {p.existe ? 'já existe' : 'vai criar'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {tudoAtivo && (
            <p className="rounded-md border border-sem-success-bd bg-sem-success px-3 py-2 text-xs text-sem-success-fg">
              Tudo ativo. Este card pode ser removido do portal.
            </p>
          )}

          {estado && !tudoAtivo && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={aplicando} onClick={() => setConfirmando(true)} className="gap-1">
                {aplicando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {aplicando ? `Criando: ${passoAtual ?? '…'}` : `Ativar o que falta (${faltando.length})`}
              </Button>
            </div>
          )}

          {/* As chaves de aviso existem: trocar INVALIDA todas as inscrições,
              então nunca acontece junto do "Ativar o que falta". */}
          {estado?.some((p) => p.chave === 'vapid' && p.existe) && (
            <div className="border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">
                As chaves de assinatura dos avisos já estão cadastradas.
              </p>
              <Button
                type="button" variant="outline" size="sm" className="mt-2"
                disabled={aplicando}
                onClick={() => setTrocandoChaves(true)}
              >
                Substituir chaves
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmação do "Ativar o que falta", listando os passos. */}
      <Dialog open={confirmando} onOpenChange={(v) => { if (!v) setConfirmando(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar o que falta</DialogTitle>
            <DialogDescription>
              Serão criados {faltando.length} registro(s). Nada existente é alterado ou apagado.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {faltando.map((p) => (
              <li key={p.chave} className="flex items-center gap-2">
                <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {p.rotulo} <span className="ml-auto text-[11px] text-muted-foreground">{p.fase}</span>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button type="button" onClick={() => void aplicar(false)}>Criar agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Substituir chaves: o aviso é o ponto, não o botão. */}
      <Dialog open={trocandoChaves} onOpenChange={(v) => { if (!v) setTrocandoChaves(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Substituir as chaves de aviso</DialogTitle>
            <DialogDescription>
              Todo mundo que ligou os avisos vai parar de recebê-los e precisará ligar de novo no
              próprio aparelho. As inscrições antigas deixam de valer no mesmo instante.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTrocandoChaves(false)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void aplicar(true)}>
              Substituir mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
