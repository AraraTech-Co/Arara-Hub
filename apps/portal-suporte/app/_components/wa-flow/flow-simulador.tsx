'use client'

// =============================================================================
// Simulador de fluxo — conferir o desenho sem gastar mensagem.
//
// Até aqui, a única forma de saber o que o robô responderia era mandar mensagem
// de verdade para o WhatsApp da empresa, e o provedor cobra por mensagem. O
// simulador percorre o MESMO caminho no servidor, sem enviar e sem gravar.
//
// Ele simula o RASCUNHO aberto no editor, não o publicado: a pergunta que
// importa é "o que eu acabei de desenhar faz o que eu quero?".
// =============================================================================

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Clock, Loader2, Play, RotateCcw, Send, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { waFlowApi, type WASimulacao, type WASimulacaoPasso } from '@/lib/api/wa-flow'
import type { WAGraph } from '@/lib/wa-flow-graph'
import { cn } from '@/lib/utils'

/** Relógio fingido, para ver os dois ramos da condição de horário. */
const QUANDO = [
  { rotulo: 'agora', valor: null },
  { rotulo: 'dia de semana, 10h', valor: '2026-10-12T13:00:00Z' },
  { rotulo: 'dia de semana, 20h', valor: '2026-10-12T23:00:00Z' },
  { rotulo: 'domingo, 10h', valor: '2026-10-18T13:00:00Z' },
]

export function FlowSimulador({
  flowId, graph, onFechar,
}: {
  flowId: string
  graph: WAGraph
  onFechar: () => void
}) {
  const { toast } = useToast()
  type Fala = string | { semResposta: true }
  const [mensagens, setMensagens] = useState<Fala[]>([])
  const [rascunho, setRascunho] = useState('')
  const [quando, setQuando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<WASimulacao | null>(null)
  const [rodando, setRodando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)

  // O servidor recebe a conversa inteira a cada passo: o estado da simulação
  // não mora em lugar nenhum, então repetir a sequência é o que a mantém.
  async function rodar(todas: Fala[]) {
    setRodando(true)
    try {
      const r = await waFlowApi.simular(flowId, { graph, mensagens: todas, agora: quando })
      setResultado(r.data)
      setMensagens(todas)
      requestAnimationFrame(() => fim.current?.scrollIntoView({ behavior: 'smooth' }))
    } catch (err) {
      toast({
        title: 'A simulação não rodou',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setRodando(false)
    }
  }

  const enviar = () => {
    const t = rascunho.trim()
    if (!t) return
    setRascunho('')
    void rodar([...mensagens, t])
  }

  // O silêncio do cliente é um passo da conversa como outro qualquer: entra na
  // mesma lista e pode ser intercalado entre falas.
  const naoRespondeu = () => void rodar([...mensagens, { semResposta: true }])

  const cor = (p: WASimulacaoPasso) =>
    p.de === 'cliente'
      ? 'ml-auto bg-primary text-primary-foreground'
      : p.de === 'robo'
        ? 'bg-muted'
        : 'mx-auto border border-dashed border-border bg-background text-[11px] italic text-muted-foreground'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Simulador do fluxo"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex items-start gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Simulador</h2>
            <p className="text-[11px] text-muted-foreground">
              Percorre o <strong>rascunho</strong> aberto aqui. Nada é enviado ao cliente e nada é
              gravado.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <label htmlFor="sim-quando" className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Relógio
          </label>
          <select
            id="sim-quando"
            value={quando ?? ''}
            disabled={rodando}
            onChange={(e) => setQuando(e.target.value || null)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {QUANDO.map((q) => (
              <option key={q.rotulo} value={q.valor ?? ''}>{q.rotulo}</option>
            ))}
          </select>
          <Button
            type="button" size="sm" variant="outline" className="ml-auto gap-1"
            disabled={rodando}
            onClick={() => { setMensagens([]); setResultado(null); void rodar([]) }}
          >
            {rodando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Começar
          </Button>
          {mensagens.length > 0 && (
            <Button
              type="button" size="sm" variant="ghost" className="gap-1"
              disabled={rodando}
              onClick={() => { setMensagens([]); setResultado(null) }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Limpar
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {!resultado && (
            <p className="text-xs italic text-muted-foreground">
              Clique em <strong>Começar</strong> para ver a abertura do fluxo, ou escreva como se
              fosse o cliente.
            </p>
          )}
          {resultado?.passos.map((p, i) => (
            <div
              key={i}
              className={cn('max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm', cor(p))}
            >
              {p.texto}
            </div>
          ))}
          {resultado?.desfecho && (
            <p className="pt-1 text-[11px] text-muted-foreground">
              <strong>Desfecho:</strong> {resultado.desfecho}
            </p>
          )}
          <div ref={fim} />
        </div>

        <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Input
            value={rascunho}
            disabled={rodando}
            placeholder="Escreva como o cliente…"
            aria-label="Mensagem do cliente"
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviar() } }}
            className="h-9"
          />
          <Button
            type="button" size="sm" variant="outline" className="gap-1"
            disabled={rodando}
            onClick={naoRespondeu}
            title="Avança o relógio até o prazo do card e segue a saída “sem resposta”"
          >
            <Clock className="h-3.5 w-3.5" />
            Não respondeu
          </Button>
          <Button type="button" size="sm" disabled={rodando || !rascunho.trim()} onClick={enviar} className="gap-1">
            {rodando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar
          </Button>
        </footer>
      </div>
    </div>
  )
}
