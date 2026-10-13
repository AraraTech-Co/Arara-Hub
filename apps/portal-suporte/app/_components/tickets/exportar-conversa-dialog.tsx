'use client'

// =============================================================================
// Exportar a conversa de WhatsApp de um chamado (Fase 1, A4).
//
// Gerado no CLIENTE, a partir da conversa que o portal já sabe buscar. Dois
// formatos: TXT (uma linha por mensagem) e PDF simples.
//
// O PDF é montado pela janela de impressão do navegador, e não por uma
// biblioteca: a conversa é texto, o navegador já sabe paginar texto, e uma
// dependência nova aqui custaria mais do que entrega. Quem quiser arquivo
// escolhe "Salvar como PDF" no diálogo de impressão.
// =============================================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { whatsappApi } from '@/lib/api/whatsapp'
import { formatarWhatsApp, textoPuro } from '@/lib/wa-formato'

interface Opcoes {
  doCliente: boolean
  nossas: boolean
  eventos: boolean
  anexos: boolean
}

/** `[dd/mm hh:mm] Nome: texto` — o formato que o handoff pede. */
function linhaDe(m: {
  from_me: boolean
  sender_name: string | null
  body: string
  created_at?: string | null
  timestamp?: string | null
  media_name?: string | null
  media_type?: string | null
}, nomeDoCliente: string, comAnexos: boolean): string | null {
  const quando = new Date(m.timestamp || m.created_at || '')
  const carimbo = isNaN(quando.getTime())
    ? '--/-- --:--'
    : `${String(quando.getDate()).padStart(2, '0')}/${String(quando.getMonth() + 1).padStart(2, '0')} ` +
      `${String(quando.getHours()).padStart(2, '0')}:${String(quando.getMinutes()).padStart(2, '0')}`
  const quem = m.from_me ? (m.sender_name || 'Atendimento') : nomeDoCliente
  // O texto sai SEM a marcação do WhatsApp: num arquivo, `*oi*` é ruído.
  const texto = textoPuro(formatarWhatsApp(m.body ?? ''))
  const anexo = m.media_type ? `[anexo: ${m.media_name || m.media_type}]` : ''
  const corpo = [texto, comAnexos ? anexo : ''].filter(Boolean).join(' ').trim()
  if (!corpo) return null
  return `[${carimbo}] ${quem}: ${corpo}`
}

export function ExportarConversaDialog({
  conversationId, nomeDoCliente, numeroDoChamado, onFechar,
}: {
  conversationId: string
  nomeDoCliente: string
  numeroDoChamado: string
  onFechar: () => void
}) {
  const { toast } = useToast()
  const [op, setOp] = useState<Opcoes>({ doCliente: true, nossas: true, eventos: false, anexos: true })
  const [ocupado, setOcupado] = useState(false)

  /** Busca a conversa e devolve as linhas já filtradas pelas opções. */
  async function montarLinhas(): Promise<{ linhas: string[]; truncado: boolean }> {
    const r = await whatsappApi.getMessages(conversationId)
    const dados = r.data as unknown
    const lista = (Array.isArray(dados) ? dados : (dados as { messages?: unknown[] })?.messages ?? []) as Parameters<typeof linhaDe>[0][]
    const historico = (r as { historico?: { truncado?: boolean } }).historico
      ?? (dados as { historico?: { truncado?: boolean } })?.historico
    const linhas: string[] = []
    for (const m of lista) {
      if (m.from_me && !op.nossas) continue
      if (!m.from_me && !op.doCliente) continue
      const l = linhaDe(m, nomeDoCliente, op.anexos)
      if (l) linhas.push(l)
    }
    return { linhas, truncado: !!historico?.truncado }
  }

  function cabecalho(truncado: boolean): string[] {
    const linhas = [
      `Conversa de WhatsApp — chamado ${numeroDoChamado}`,
      `Cliente: ${nomeDoCliente}`,
      `Exportado em ${new Date().toLocaleString('pt-BR')}`,
    ]
    // Dizer que faltou é mais importante num arquivo do que na tela: o arquivo
    // sobrevive à conversa e vai ser lido por quem não estava aqui.
    if (truncado) {
      linhas.push('ATENÇÃO: esta conversa é longa e o sistema não conseguiu trazer todas as mensagens.')
    }
    linhas.push('')
    return linhas
  }

  async function baixarTxt() {
    setOcupado(true)
    try {
      const { linhas, truncado } = await montarLinhas()
      const conteudo = [...cabecalho(truncado), ...linhas].join('\n')
      const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/plain;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `conversa-${numeroDoChamado || conversationId}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'Conversa exportada', description: `${linhas.length} mensagem(ns) no arquivo.` })
      onFechar()
    } catch (err) {
      toast({
        title: 'Não foi possível exportar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setOcupado(false)
    }
  }

  async function imprimirPdf() {
    setOcupado(true)
    try {
      const { linhas, truncado } = await montarLinhas()
      const janela = window.open('', '_blank')
      if (!janela) {
        toast({
          title: 'O navegador bloqueou a janela',
          description: 'Libere pop-ups para este site e tente de novo.',
          variant: 'destructive',
        })
        return
      }
      // `textContent` em vez de innerHTML: o conteúdo é texto de cliente.
      const doc = janela.document
      doc.title = `conversa-${numeroDoChamado || conversationId}`
      const style = doc.createElement('style')
      style.textContent = 'body{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px;white-space:pre-wrap}'
      doc.head.appendChild(style)
      const corpo = doc.createElement('pre')
      corpo.textContent = [...cabecalho(truncado), ...linhas].join('\n')
      doc.body.appendChild(corpo)
      janela.focus()
      janela.print()
      onFechar()
    } catch (err) {
      toast({
        title: 'Não foi possível gerar o PDF',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setOcupado(false)
    }
  }

  const marcar = (k: keyof Opcoes) => setOp((o) => ({ ...o, [k]: !o[k] }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog" aria-modal="true" aria-label="Exportar conversa"
        className="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex items-start gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Exportar conversa</h2>
            <p className="text-[11px] text-muted-foreground">
              A conversa de WhatsApp deste chamado, como arquivo.
            </p>
          </div>
          <button
            type="button" onClick={onFechar} aria-label="Fechar"
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-2 px-4 py-3">
          {([
            ['doCliente', 'Mensagens do cliente'],
            ['nossas', 'Nossas mensagens'],
            ['anexos', 'Anexos (como lista de nomes)'],
            ['eventos', 'Eventos do sistema'],
          ] as [keyof Opcoes, string][]).map(([chave, rotulo]) => (
            <label key={chave} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={op[chave]} onChange={() => marcar(chave)} disabled={ocupado} />
              {rotulo}
              {chave === 'eventos' && (
                <span className="text-[11px] italic text-muted-foreground">
                  — ainda não saem no arquivo
                </span>
              )}
            </label>
          ))}
        </div>

        <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void baixarTxt()}>
            {ocupado ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Baixar TXT
          </Button>
          <Button type="button" size="sm" disabled={ocupado} onClick={() => void imprimirPdf()}>
            {ocupado ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            PDF
          </Button>
        </footer>
      </div>
    </div>
  )
}
