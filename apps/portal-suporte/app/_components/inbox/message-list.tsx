'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Citacao, MessageActions, Reacoes } from './message-actions'
import { whatsappApi, type WAThreadMessage } from '@/lib/api/whatsapp'
import { cn } from '@/lib/utils'

// Duas formas de "quem falou" vêm embutidas no texto e precisam sair dele:
//  - saída: a assinatura que injetamos (`*Cris — Suporte Arara*\n texto`);
//  - entrada de GRUPO: o WhatsApp prefixa o autor (`*Rodrigo Cezimbra:*\n texto`).
// Sem isso o asterisco aparece cru na bolha, como no BotConversa.
const AUTHOR_PREFIX_RE = /^\*(.+?):?\*\n([\s\S]*)$/

export function splitAuthor(body: string): { author: string | null; text: string } {
  const m = body.match(AUTHOR_PREFIX_RE)
  if (!m) return { author: null, text: body }
  return { author: m[1]!.replace(/:$/, ''), text: m[2]! }
}

function messageTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface MessageListProps {
  messages: WAThreadMessage[]
  loading: boolean
  /**
   * A última busca falhou. Separado de "sem mensagem" de propósito: até
   * 09/10/2026 os dois desenhavam a mesma frase, e quem atendia não tinha
   * como saber se a conversa estava vazia ou se o portal não conseguiu
   * buscar (TCK000638).
   */
  falhou?: boolean
  /** O que o portal tem desta conversa — ver use-conversation-stream. */
  historico?: { total: number; desde: string | null; lacuna: boolean } | null
  /** Tentar buscar de novo, quando falhou. */
  onTentarDeNovo?: () => void
  /** Quantas estavam por ler ao abrir: o divisor entra antes dessas. */
  naoLidas?: number
  /** Id do atendente logado — marca a reação que é sua. */
  meId?: string | null
  /** Citar esta mensagem no composer. */
  onResponder?: (m: WAThreadMessage) => void
  /** Atualiza a thread depois de reagir ou apagar. */
  onMudou?: () => void
}

/** Quem assina a mensagem — autor embutido (grupo) ou o remetente. */
function autorDe(m: WAThreadMessage): string | null {
  const { author } = splitAuthor(m.body ?? '')
  // Nossa mensagem: a assinatura embutida (portal) ou quem o servidor soube
  // que respondeu (pelo portal, ou pelo WhatsApp Web mapeado por dispositivo).
  // Sem nenhum dos dois, fica sem nome — nunca "você" por padrão.
  return author ?? m.sender_name ?? null
}

export function MessageList({
  messages, loading, naoLidas = 0, meId = null, onResponder, onMudou,
  falhou = false, historico = null, onTentarDeNovo,
}: MessageListProps) {
  // Onde entra o divisor: antes da N-ésima mensagem RECEBIDA contando do fim.
  // Só mensagem do cliente conta como "por ler" — o que nós mandamos já foi
  // lido por quem escreveu.
  const iDivisor = useMemo(() => {
    if (naoLidas <= 0) return -1
    let faltam = naoLidas
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.from_me) continue
      faltam -= 1
      if (faltam === 0) return i
    }
    return -1
  }, [messages, naoLidas])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {loading && messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Carregando mensagens…</p>
      ) : falhou && messages.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground">Não foi possível carregar as mensagens.</p>
          <p className="text-sm text-muted-foreground">
            A conversa pode ter histórico — isto é uma falha ao buscar, não uma conversa vazia.
          </p>
          {onTentarDeNovo && (
            <button
              type="button"
              onClick={onTentarDeNovo}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
            >
              Tentar de novo
            </button>
          )}
        </div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {historico?.lacuna
            ? 'O portal não recebeu mensagens desta conversa. Se houver histórico no WhatsApp, ele não chegou aqui.'
            : 'Nenhuma mensagem nesta conversa.'}
        </p>
      ) : (
        // Mensagens seguidas da mesma pessoa formam um bloco: o nome aparece uma
        // vez e o respiro entre blocos é maior que dentro deles. Repetir "Erika
        // Baisi" a cada linha vira ruído e some com a informação de quem falou.
        messages.map((m, i) => {
          // Lacuna: a conversa é bem anterior à mensagem mais antiga que o
          // portal tem. Dizer desde quando é mais honesto que deixar o
          // atendente achar que viu tudo.
          const avisoLacuna =
            i === 0 && historico?.lacuna && historico.desde ? (
              <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                O portal tem o histórico desta conversa desde{' '}
                {new Date(historico.desde).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
                . Mensagens anteriores podem existir no WhatsApp e não aparecem aqui.
              </p>
            ) : null
          const anterior = i > 0 ? messages[i - 1] : null
          const mesmoBloco =
            !!anterior &&
            anterior.from_me === m.from_me &&
            autorDe(anterior) === autorDe(m)
          return (
            <div key={m.id}>
              {avisoLacuna}
              {i === iDivisor && (
                <div className="my-4 flex items-center gap-3" role="separator">
                  <span className="h-px flex-1 bg-primary/35" />
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {naoLidas === 1 ? '1 mensagem não lida' : `${naoLidas} mensagens não lidas`}
                  </span>
                  <span className="h-px flex-1 bg-primary/35" />
                </div>
              )}
              <MessageBubble
                message={m}
                continuacao={mesmoBloco && i !== iDivisor}
                className={mesmoBloco && i !== iDivisor ? 'mt-1' : 'mt-4 first:mt-0'}
                meId={meId}
                onResponder={onResponder}
                onMudou={onMudou}
              />
            </div>
          )
        })
      )}
      <div ref={bottomRef} />
    </div>
  )
}

/** Renderiza a mídia baixada (imagem/vídeo/áudio/documento) na bolha. */
// Mídia guardada no servidor (foto, áudio, vídeo decifrados do WhatsApp).
// Não vem na lista — pesaria MB a cada consulta —, é pedida quando a bolha
// aparece. Enquanto carrega, o rótulo do corpo ("[imagem recebida]") já diz
// que há algo; se falhar, o rótulo fica e a bolha avisa.
function MediaSobDemanda({ id, type, nome }: { id: string; type: string | null; nome?: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let vivo = true
    whatsappApi.midia(id)
      .then((r) => { if (vivo) setUrl(r.data.data_uri) })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [id])
  if (url) return <MessageMedia url={url} type={type} nome={nome} />
  if (erro) return <p className="mt-1 text-xs text-foreground/65">Não foi possível carregar a mídia.</p>
  return <p className="mt-1 text-xs text-foreground/65">Carregando mídia…</p>
}

// Abrir/baixar conteúdo embutido (data: URI). O Chrome BLOQUEIA navegar para
// `data:` em aba nova (fica about:blank) — por isso vai como `blob:`, que ele
// aceita, com nome de arquivo para o download.
function blobDe(dataUri: string): { url: string; ext: string } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUri)
  if (!m) return null
  const mime = m[1] || 'application/octet-stream'
  const bytes = m[2] ? atob(m[3]) : decodeURIComponent(m[3])
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  const ext = mime.split('/')[1]?.split('+')[0] || 'bin'
  return { url: URL.createObjectURL(new Blob([buf], { type: mime })), ext }
}

function baixar(url: string, nome: string) {
  const b = url.startsWith('data:') ? blobDe(url) : { url, ext: 'bin' }
  if (!b) return
  const a = document.createElement('a')
  a.href = b.url
  a.download = `${nome}.${b.ext}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (b.url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(b.url), 60_000)
}

// Foto em tela cheia dentro do portal — aba nova com `data:` não abre.
function Lightbox({ url, onFechar }: { url: string; onFechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])
  return (
    <div
      role="dialog"
      aria-label="Imagem em tela cheia"
      onClick={onFechar}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Imagem recebida" className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => baixar(url, 'imagem-whatsapp')}
          className="rounded-md bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted">
          Baixar
        </button>
        <button type="button" onClick={onFechar}
          className="rounded-md bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted">
          Fechar
        </button>
      </div>
    </div>
  )
}

function MessageMedia({ url, type, nome }: { url: string; type: string | null; nome?: string | null }) {
  const [aberta, setAberta] = useState(false)
  if (type === 'image' || type === 'sticker') {
    return (
      <>
        <button type="button" onClick={() => setAberta(true)} className="block" title="Ver em tela cheia">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Imagem recebida" loading="lazy" className="mt-1 max-h-64 rounded-lg" />
        </button>
        {aberta && <Lightbox url={url} onFechar={() => setAberta(false)} />}
      </>
    )
  }
  if (type === 'video') {
    return <video src={url} controls preload="metadata" className="mt-1 max-h-64 rounded-lg" />
  }
  if (type === 'audio') {
    return <audio src={url} controls preload="none" className="mt-1 w-56" />
  }
  return (
    <button
      type="button"
      onClick={() => baixar(url, nome?.replace(/\.[^.]+$/, '') || 'arquivo-whatsapp')}
      className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1.5 text-left hover:bg-muted"
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate text-xs">{nome || 'Baixar arquivo'}</span>
    </button>
  )
}

function MessageBubble({
  message: m,
  continuacao = false,
  className,
  meId = null,
  onResponder,
  onMudou,
}: {
  message: WAThreadMessage
  continuacao?: boolean
  className?: string
  meId?: string | null
  onResponder?: (m: WAThreadMessage) => void
  onMudou?: () => void
}) {
  const { toast } = useToast()
  const { text } = splitAuthor(m.body ?? '')
  const who = autorDe(m)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState('')
  // O WhatsApp só aceita editar nos primeiros 15 min, e nunca mensagem com
  // arquivo. Esconder o item é melhor que mostrar e falhar depois do clique.
  const podeEditar =
    m.from_me &&
    !m.media_ref &&
    !m.media_url &&
    Date.now() - new Date(m.timestamp).getTime() < 15 * 60 * 1000
  // Mensagem anterior a esta função não tem id do WhatsApp: sem ele, reagir,
  // responder e apagar não existem do outro lado.
  const temMenu = Boolean(m.message_id) && !m.apagada

  const AVISO_FALHA: Record<string, string> = {
    apagar: 'Não foi possível apagar',
    reagir: 'Não foi possível reagir',
    editar: 'Não foi possível editar',
  }

  async function agir(acao: 'reagir' | 'apagar' | 'editar', extra?: { emoji?: string; message?: string }) {
    if (ocupado) return
    setOcupado(true)
    try {
      await whatsappApi.acaoNaMensagem(m.id, acao, extra)
      setEditando(false)
      onMudou?.()
    } catch (err) {
      toast({
        title: AVISO_FALHA[acao] ?? 'Não foi possível',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setOcupado(false)
    }
  }

  if (m.apagada) {
    return (
      <div className={cn('flex', m.from_me ? 'justify-end' : 'justify-start', className)}>
        <p className="rounded-2xl border border-dashed border-border px-3.5 py-2 text-xs italic text-muted-foreground">
          Mensagem apagada
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group flex items-start gap-1',
        m.from_me ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      {m.from_me && temMenu && (
        <div className="mt-1 shrink-0">
          <MessageActions
            podeApagar
            podeEditar={podeEditar}
            reagindo={ocupado}
            alinharDireita={false}
            onResponder={() => onResponder?.(m)}
            onReagir={(e) => void agir('reagir', { emoji: e })}
            onCopiar={() => {
              void navigator.clipboard?.writeText(text || m.body || '')
              toast({ title: 'Texto copiado' })
            }}
            onEditar={() => { setRascunho(text || m.body || ''); setEditando(true) }}
            onApagar={() => void agir('apagar')}
          />
        </div>
      )}
      <div
        className={cn(
          'max-w-[68ch] rounded-2xl border px-3.5 py-2 text-sm',
          // A mensagem do time é a maioria do que se vê numa conversa de
          // atendimento. Pintá-la de primary cheio fazia dela o maior campo de
          // cor da tela e tirava o destaque de Enviar e Atender, que são as
          // ações de verdade. Aqui ela é uma tinta: quem fala continua óbvio
          // pelo lado e pela cauda, e o primary volta a significar "aja".
          m.from_me
            ? 'border-primary/25 bg-primary/10 text-foreground'
            : 'border-border bg-muted text-foreground',
          // Dentro de um bloco a cauda some: só a última do lado a mantém.
          m.from_me
            ? continuacao ? 'rounded-br-2xl' : 'rounded-br-sm'
            : continuacao ? 'rounded-bl-2xl' : 'rounded-bl-sm',
        )}
      >
        {who && !continuacao && (
          <p className="mb-1 text-xs font-semibold text-foreground/70">{who}</p>
        )}

        {m.citacao && (
          <Citacao autor={m.citacao.autor} corpo={m.citacao.corpo} className="mb-1.5" />
        )}

        {editando ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={rascunho}
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (rascunho.trim()) void agir('editar', { message: rascunho.trim() })
                }
                if (e.key === 'Escape') setEditando(false)
              }}
              rows={2}
              autoFocus
              className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={ocupado || !rascunho.trim()}
                onClick={() => void agir('editar', { message: rascunho.trim() })}
                className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <span className="text-[11px] text-muted-foreground">Enter salva · Esc cancela</span>
            </div>
          </div>
        ) : (
          text && <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
        )}
        {m.media_url
          ? <MessageMedia url={m.media_url} type={m.media_type} />
          : m.media_ref ? <MediaSobDemanda id={m.media_ref} type={m.media_type} nome={m.media_name} /> : null}

        {/* Mesmo papel dos dois lados, mesmo tratamento — antes o horário da
            própria mensagem era branco sobre indigo (2,63:1) e o da recebida
            era `muted-foreground` (4,14:1). Os dois ficavam abaixo do piso de
            4,5:1 do projeto. `foreground/65` passa nas quatro combinações:
            bolha própria e recebida, tema escuro e claro (5,19:1 no pior caso). */}
        <p className="mt-1 text-right text-[11px] text-foreground/65">
          {m.editada && <span className="mr-1 italic">editada</span>}
          <span className="tabular-nums">{messageTime(m.timestamp)}</span>
        </p>

        <Reacoes
          reacoes={m.reacoes ?? []}
          meId={meId}
          onRemover={() => void agir('reagir', { emoji: '' })}
        />
      </div>
      {!m.from_me && temMenu && (
        <div className="mt-1 shrink-0">
          <MessageActions
            podeApagar={false}
            podeEditar={false}
            reagindo={ocupado}
            alinharDireita={false}
            onResponder={() => onResponder?.(m)}
            onReagir={(e) => void agir('reagir', { emoji: e })}
            onCopiar={() => {
              void navigator.clipboard?.writeText(text || m.body || '')
              toast({ title: 'Texto copiado' })
            }}
            onEditar={() => {}}
            onApagar={() => {}}
          />
        </div>
      )}
    </div>
  )
}
