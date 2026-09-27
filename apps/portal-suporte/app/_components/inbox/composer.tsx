'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CornerUpLeft, Loader2, Paperclip, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { whatsappApi, type WAQuickReply } from '@/lib/api/whatsapp'
import { ANEXO_ACCEPT, ANEXO_MAX_MB, lerDataUri, motivoRecusaAnexo } from '@/lib/anexos'
import { Citacao } from './message-actions'

interface ComposerProps {
  conversationId: string
  /** Mensagem citada (menu → Responder); `null` quando não há citação. */
  respondendoA?: { id: string; message_id?: string | null; autor: string | null; corpo: string } | null
  onCancelarResposta?: () => void
  /** Chamado após o envio: atualiza a thread sem esperar o próximo ciclo. */
  onSent?: () => void
  agentFirstName: string | null
}

export function Composer({ conversationId, agentFirstName, onSent, respondendoA, onCancelarResposta }: ComposerProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [erro, setErro] = useState('')
  const [quickReplies, setQuickReplies] = useState<WAQuickReply[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const campoRef = useRef<HTMLTextAreaElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)

  // Limpa o rascunho ao trocar de conversa — senão o texto vaza para outro cliente.
  useEffect(() => {
    setDraft('')
    setPickerOpen(false)
    setArquivo(null)
    onCancelarResposta?.()
    // `onCancelarResposta` vem do pai e muda a cada render; incluí-lo aqui
    // limparia a citação recém-escolhida. A dependência é a CONVERSA.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // Mesmas regras do anexo de chamado (tipo e 10 MB) — uma verdade só.
  function escolher(file: File | null) {
    if (!file) return
    const recusa = motivoRecusaAnexo(file)
    if (recusa) {
      setErro(`Não dá para enviar "${file.name}": ${recusa}.`)
      return
    }
    setErro('')
    setArquivo(file)
    campoRef.current?.focus()
  }

  // Respostas rápidas: uma busca só, cache em memória.
  useEffect(() => {
    if (quickReplies !== null) return
    let cancelled = false
    whatsappApi
      .listQuickReplies()
      .then((res) => {
        if (!cancelled) setQuickReplies(res.data.filter((q) => q.active))
      })
      .catch(() => {
        if (!cancelled) setQuickReplies([])
      })
    return () => {
      cancelled = true
    }
  }, [quickReplies])

  useEffect(() => {
    if (!pickerOpen) return
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  // Filtra pelo que vem depois da "/" — antes o picker listava tudo, sem filtrar.
  const query = draft.startsWith('/') ? draft.slice(1).toLowerCase().trim() : null
  const matches =
    query === null
      ? []
      : (quickReplies ?? []).filter(
          (q) =>
            !query ||
            q.shortcut.toLowerCase().includes(query) ||
            q.title.toLowerCase().includes(query),
        )
  const showPicker = pickerOpen && matches.length > 0

  async function handleSend() {
    const message = draft.trim()
    if ((!message && !arquivo) || sending) return
    setSending(true)
    try {
      // O arquivo é lido aqui, não ao escolher: escolher e desistir não deve
      // custar a leitura de 10 MB.
      const anexo = arquivo
        ? { nome: arquivo.name, dados: await lerDataUri(arquivo) }
        : undefined
      // `POST /whatsapp` entrega no provedor e devolve `entregue` — o aviso
      // fixo de "envio não está ligado" que vivia aqui virou mentira quando a
      // entrega passou a existir. Agora quem fala é o resultado de CADA envio:
      // gravado sempre, entregue nem sempre.
      const r = (await whatsappApi.sendMessage(
        conversationId,
        message,
        anexo,
        respondendoA?.message_id ? { message_id: respondendoA.message_id } : undefined,
      )) as
        | { data?: { entregue?: boolean; erro_entrega?: string } }
        | undefined
      const dados = r?.data ?? (r as { entregue?: boolean; erro_entrega?: string } | undefined)
      setDraft('')
      setArquivo(null)
      onCancelarResposta?.()
      if (arquivoRef.current) arquivoRef.current.value = ''
      if (dados && dados.entregue === false) {
        setErro(
          'Gravado no histórico, mas o WhatsApp não aceitou a entrega' +
            (dados.erro_entrega ? ` (${dados.erro_entrega})` : '') +
            '. Responda por outro canal.',
        )
      } else {
        setErro('')
      }
      onSent?.()
    } catch (err) {
      setErro((err instanceof Error ? err.message : 'Não foi possível enviar') + ' — a mensagem não foi enviada nem registrada.')
    } finally {
      setSending(false)
      // O cursor volta para o campo: quem atende manda várias mensagens
      // seguidas e não deve ter que clicar de novo a cada envio. Vale também
      // para quem clicou em Enviar com o mouse — o foco estava no botão.
      campoRef.current?.focus()
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape' && pickerOpen) {
      e.preventDefault()
      setPickerOpen(false)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div ref={wrapRef} className="relative border-t border-border bg-card p-3">
      {showPicker && (
        <div className="absolute inset-x-3 bottom-full mb-2 max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-md">
          <p className="border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Respostas rápidas
          </p>
          <ul>
            {matches.map((qr) => (
              <li key={qr.id}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(qr.body)
                    setPickerOpen(false)
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="text-xs font-medium text-foreground">
                    <span className="text-muted-foreground">/{qr.shortcut}</span> · {qr.title}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{qr.body}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}


      {/* Duas situações diferentes, e confundi-las custa caro: falha de REDE
          (não gravou nem enviou, pode repetir) e falha de ENTREGA (gravou, o
          cliente não recebeu, repetir duplica no histórico). O texto do erro
          já diz qual é; o sufixo fixo de antes afirmava sempre a primeira. */}
      {erro && (
        <p className="mb-2 rounded-lg border border-sem-error-bd bg-sem-error px-3 py-2 text-xs text-sem-error-fg">
          {erro}
        </p>
      )}

      <p className="mb-2 text-xs text-muted-foreground">
        Sua resposta será assinada como{' '}
        <span className="font-medium text-foreground">
          *{agentFirstName ?? 'Você'} — Suporte Arara*
        </span>
      </p>

      {/* Citação: a mensagem que está sendo respondida fica à vista até enviar. */}
      {respondendoA && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <CornerUpLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Citacao autor={respondendoA.autor} corpo={respondendoA.corpo} className="min-w-0 flex-1 border-l-0 bg-transparent p-0" />
          <button
            type="button"
            onClick={() => onCancelarResposta?.()}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Cancelar resposta"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      {/* Arquivo escolhido: fica à vista até enviar, com o caminho de desistir. */}
      {arquivo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">{arquivo.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {(arquivo.size / 1024 / 1024).toFixed(1)} MB
          </span>
          <button
            type="button"
            onClick={() => {
              setArquivo(null)
              if (arquivoRef.current) arquivoRef.current.value = ''
              campoRef.current?.focus()
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Remover arquivo"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={arquivoRef}
          type="file"
          accept={ANEXO_ACCEPT}
          className="sr-only"
          onChange={(e) => escolher(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => arquivoRef.current?.click()}
          disabled={sending}
          title={`Anexar arquivo (até ${ANEXO_MAX_MB} MB)`}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          <span className="sr-only">Anexar arquivo</span>
        </Button>
        <Textarea
          ref={campoRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setPickerOpen(e.target.value.startsWith('/'))
          }}
          onKeyDown={handleKeyDown}
          placeholder="Escreva uma mensagem…  (digite / para respostas rápidas · Enter envia · Shift+Enter quebra linha)"
          rows={2}
          className="resize-none"
          // `readOnly` no lugar de `disabled`: campo desabilitado PERDE o foco
          // no navegador, e era por isso que o cursor sumia depois do Enter.
          // Somente-leitura bloqueia a digitação durante o envio e mantém o
          // cursor onde estava.
          readOnly={sending}
        />
        <Button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || (draft.trim().length === 0 && !arquivo)}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="ml-1.5">Enviar</span>
        </Button>
      </div>
    </div>
  )
}
