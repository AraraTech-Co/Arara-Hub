'use client'

// =============================================================================
// Nova conversa iniciada pelo portal (Fase 2, 14/10/2026)
//
// O atendente abre conversa com um número que ainda não escreveu.
//
// ⚠️ ISTO MANDA WHATSAPP DE VERDADE para o número digitado. Um dígito errado é
// mensagem para um estranho, em nome da empresa. Por isso o diálogo tem dois
// passos: escrever e CONFERIR — o segundo mostra o número normalizado, do jeito
// que vai sair, e o texto exato. Sem passo de conferência, "Enviar" em cima de
// um campo recém-digitado é um clique longe de um engano público.
//
// Diálogo novo, e não reaproveitamento do cadastrar-contato-dialog: aquele
// recebe uma `WAConversationDetail` e é acoplado a uma conversa que já existe.
// O cadastro do NOME continua sendo dele, depois que a conversa existir.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { Loader2, MessageSquarePlus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { whatsappApi, type WAInboxConversation } from '@/lib/api/whatsapp'
import { normalizarTelefoneWhatsapp, MOTIVO_DA_RECUSA } from '@/lib/wa-telefone'
import { telefoneFormatado, rotuloDoContato } from '@/lib/wa-contato'

export function NovaConversaDialog({
  aberto,
  onFechar,
  conversas,
  onPronto,
}: {
  aberto: boolean
  onFechar: () => void
  /**
   * As conversas que a lista já tem, só para AVISAR que o número parece ter
   * conversa. Quem decide é o servidor: a lista trunca em 500 e pode não ter a
   * conversa certa, então um "não achei" aqui não significa nada.
   */
  conversas: WAInboxConversation[]
  /** Chamado com o id da conversa — criada ou já existente. */
  onPronto: (id: string, existente: boolean) => void
}) {
  const { toast } = useToast()
  const [telefone, setTelefone] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [conferindo, setConferindo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Abrir de novo não herda o número da vez anterior: seria o jeito mais fácil
  // de mandar a mensagem nova para o contato antigo.
  useEffect(() => {
    if (aberto) {
      setTelefone(''); setMensagem(''); setConferindo(false); setEnviando(false); setErro(null)
    }
  }, [aberto])

  const normal = useMemo(() => normalizarTelefoneWhatsapp(telefone), [telefone])
  const podeConferir = normal.ok && mensagem.trim().length > 0

  // Já parece ter conversa? Compara por TODAS as variantes do nono dígito — é
  // assim que o servidor procura, e é o que evita duplicata.
  const jaNaLista = useMemo(() => {
    if (!normal.ok) return null
    const jids = new Set(normal.valor.variantes.map((v) => `${v}@s.whatsapp.net`))
    return conversas.find((c) => jids.has(c.remote_jid)) ?? null
  }, [normal, conversas])

  async function enviar() {
    if (!normal.ok) return
    setEnviando(true)
    setErro(null)
    try {
      const r = await whatsappApi.novaConversa({
        telefone: normal.valor.digitos,
        message: mensagem.trim(),
      })
      onPronto(r.data.id, r.data.existente)
      onFechar()
    } catch (err) {
      // O texto do servidor vai PARA A TELA, inclusive a recusa do provedor e a
      // da janela de 24 h do WhatsApp. "Erro ao enviar" não ajudaria ninguém a
      // decidir o que fazer em seguida.
      setErro(err instanceof Error ? err.message : 'Não deu para enviar, e o servidor não disse por quê.')
      setConferindo(false)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            {conferindo ? 'Confirmar o envio' : 'Nova conversa'}
          </DialogTitle>
          <DialogDescription>
            {conferindo
              ? 'Confira o número e o texto. A mensagem vai pelo WhatsApp da empresa.'
              : 'Começa uma conversa com um número que ainda não escreveu.'}
          </DialogDescription>
        </DialogHeader>

        {!conferindo ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nc-tel">Número com DDD</Label>
              <Input
                id="nc-tel"
                autoFocus
                inputMode="tel"
                placeholder="(19) 99999-0001"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
              {/* O número que vai sair, à vista enquanto digita. */}
              {telefone.trim() !== '' && (
                normal.ok ? (
                  <p className="text-[11px] text-muted-foreground">
                    Vai sair para <strong>{telefoneFormatado(normal.valor.digitos)}</strong>
                    {normal.valor.variantes.length > 1 && (
                      <> — se esse número não atender, tentamos também sem/com o nono dígito.</>
                    )}
                  </p>
                ) : (
                  <p className="text-[11px] text-destructive">{MOTIVO_DA_RECUSA[normal.motivo]}</p>
                )
              )}
            </div>

            {jaNaLista && (
              <p className="rounded-md border border-sem-info-bd bg-sem-info px-2 py-1.5 text-[11px] text-sem-info-fg">
                Já existe conversa com <strong>{rotuloDoContato(jaNaLista.contact?.name, jaNaLista.contact_name, jaNaLista.remote_jid)}</strong>.
                Enviar aqui abre a conversa existente, sem criar outra nem mandar esta mensagem.
              </p>
            )}

            <div className="space-y-1">
              <Label htmlFor="nc-msg">Primeira mensagem</Label>
              <Textarea
                id="nc-msg"
                rows={4}
                placeholder="Olá! Aqui é o suporte da Arara Tech…"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </div>

            {erro && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                {erro}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Para</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {normal.ok ? telefoneFormatado(normal.valor.digitos) : ''}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Mensagem</p>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{mensagem.trim()}</p>
            </div>
            <p className="text-[11px] italic text-muted-foreground">
              Depois de enviar, a conversa aparece em <strong>Minhas</strong>, atribuída a você.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {conferindo ? (
            <>
              <Button type="button" variant="outline" disabled={enviando} onClick={() => setConferindo(false)}>
                Voltar e corrigir
              </Button>
              <Button type="button" disabled={enviando} onClick={() => void enviar()} className="gap-1">
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {enviando ? 'Enviando…' : 'Enviar agora'}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
              <Button type="button" disabled={!podeConferir} onClick={() => setConferindo(true)}>
                {jaNaLista ? 'Abrir a conversa existente' : 'Conferir antes de enviar'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
