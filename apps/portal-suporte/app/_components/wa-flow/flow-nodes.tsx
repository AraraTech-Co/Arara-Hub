'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  ListChecks, MessageSquareText, UserRoundCheck, GitBranch, Sparkles, Timer, Tag, MessageCircleQuestion, Shuffle, Webhook,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Cards do editor de fluxo — um componente por tipo de bloco, no espírito da
 * paleta do BotConversa (cada tipo com sua cor), mas usando os tokens do portal
 * (nada de hex inline, funciona em claro e escuro).
 *
 * Cada card expõe as PORTAS: entrada à esquerda; saída à direita — um handle por
 * opção no menu, um `next` no conteúdo, nenhuma no handoff (terminal).
 */

const CARD = 'w-64 rounded-xl border bg-card shadow-sm'
const HEADER = 'flex items-center gap-1.5 rounded-t-xl border-b px-3 py-1.5 text-xs font-semibold'

function Body({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-xs text-muted-foreground">{children}</div>
}

/** Handle de entrada (todo nó, menos a raiz, recebe). */
function TargetHandle() {
  return <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border !border-border !bg-muted" />
}

// ─── Espera pela resposta (menu e pergunta) ─────────────────────────────────

/**
 * A porta "sem resposta" e a linha que a explica.
 *
 * Fica num componente só porque o menu e a pergunta têm o MESMO campo: dois
 * JSX iguais lado a lado é como as duas telas passam a divergir. A porta só
 * aparece quando há prazo — bolinha sem prazo é um caminho que nunca é usado,
 * e o validador avisa justamente sobre isso.
 */
function SaidaSemResposta({ minutos, cor }: { minutos: number; cor: string }) {
  if (!(minutos > 0)) return null
  return (
    <>
      <p className="pt-1 text-[11px] text-muted-foreground">
        Sem resposta em {minutos} min →
      </p>
      <Handle
        type="source"
        id="timeout"
        title="sem resposta"
        aria-label="Saída: sem resposta"
        position={Position.Bottom}
        className={cn('!h-2 !w-2 !border', cor)}
      />
    </>
  )
}

// ─── Menu ────────────────────────────────────────────────────────────────────

export const MenuNode = memo(function MenuNode({ data }: NodeProps) {
  const d = data as {
    label: string; text: string; options?: { id: string; label: string }[]; semRespostaMin?: number
  }
  const options = d.options ?? []
  return (
    <div className={cn(CARD, 'border-sem-info-bd')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-sem-info-bd bg-sem-info text-sem-info-fg')}>
        <ListChecks className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        <p className="mb-2 line-clamp-3 whitespace-pre-wrap text-foreground/80">{d.text}</p>
        <ul className="space-y-1">
          {options.map((o, i) => (
            <li
              key={o.id}
              className="relative rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground/80"
            >
              {i + 1}. {o.label}
              {/* uma porta por opção */}
              <Handle
                type="source"
                id={`opt:${o.id}`}
                position={Position.Right}
                className="!h-2 !w-2 !border !border-sem-info-bd !bg-sem-info"
                style={{ right: -14, top: '50%' }}
              />
            </li>
          ))}
        </ul>
        <SaidaSemResposta
          minutos={Number(d.semRespostaMin ?? 0)}
          cor="!border-sem-info-bd !bg-sem-info"
        />
      </Body>
    </div>
  )
})

// ─── Conteúdo ────────────────────────────────────────────────────────────────

export const ContentNode = memo(function ContentNode({ data }: NodeProps) {
  const d = data as { label: string; text: string }
  return (
    <div className={cn(CARD, 'border-border')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-border bg-muted text-foreground')}>
        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        <p className="line-clamp-4 whitespace-pre-wrap text-foreground/80">{d.text}</p>
      </Body>
      <Handle
        type="source"
        id="next"
        position={Position.Right}
        className="!h-2 !w-2 !border !border-border !bg-muted-foreground"
      />
    </div>
  )
})

// ─── Handoff (atendente) ─────────────────────────────────────────────────────

export const HandoffNode = memo(function HandoffNode({ data }: NodeProps) {
  const d = data as { label: string; text: string; area?: string }
  return (
    <div className={cn(CARD, 'border-sem-warning-bd')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-sem-warning-bd bg-sem-warning text-sem-warning-fg')}>
        <UserRoundCheck className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        <p className="line-clamp-3 whitespace-pre-wrap text-foreground/80">{d.text}</p>
        <p className="mt-1 text-[11px] italic opacity-70">Avisa o plantão (Configuração de avisos)</p>
      </Body>
    </div>
  )
})

// ─── Condição ────────────────────────────────────────────────────────────────

const CHECK_LABEL: Record<string, string> = {
  businessHours: 'Está dentro do horário de atendimento?',
  hasTicket: 'A conversa já tem chamado aberto?',
}

export const ConditionNode = memo(function ConditionNode({ data }: NodeProps) {
  const d = data as { label: string; check?: string }
  return (
    <div className={cn(CARD, 'border-sem-success-bd')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-sem-success-bd bg-sem-success text-sem-success-fg')}>
        <GitBranch className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        <p className="mb-2 text-foreground/80">{CHECK_LABEL[d.check ?? 'businessHours']}</p>
        {/* duas saídas: sim / não */}
        <div className="relative rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
          Sim
          <Handle type="source" id="true" position={Position.Right} className="!h-2 !w-2 !border !border-sem-success-bd !bg-sem-success" style={{ right: -14, top: '50%' }} />
        </div>
        <div className="relative mt-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
          Não
          <Handle type="source" id="false" position={Position.Right} className="!h-2 !w-2 !border !border-border !bg-muted-foreground" style={{ right: -14, top: '50%' }} />
        </div>
      </Body>
    </div>
  )
})

// ─── Assistente (Claude) ─────────────────────────────────────────────────────

export const AssistantNode = memo(function AssistantNode({ data }: NodeProps) {
  const d = data as { label: string; text: string }
  return (
    <div className={cn(CARD, 'border-primary/50')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-primary/50 bg-primary/10 text-foreground')}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        {d.text && <p className="line-clamp-2 whitespace-pre-wrap text-foreground/80">{d.text}</p>}
        <p className="mt-1 text-[11px] italic opacity-70">
          O assistente assume a conversa a partir daqui
        </p>
      </Body>
    </div>
  )
})

// ─── Atraso ──────────────────────────────────────────────────────────────────

/**
 * Quanto o robô ESPERA de verdade: 3 s por card, nunca mais.
 *
 * O card mostrava o valor gravado formatado em minutos ("5 min"), herança de
 * quando o campo aceitava 900 s. O motor nunca esperou isso — corta em 3 s por
 * card e 6 s somados por mensagem, porque o robô está segurando a resposta ao
 * WhatsApp e demorar demais faz o provedor reenviar a mensagem do cliente.
 *
 * Fluxo antigo pode ter 300 gravado. Mostrar "5 min" seria mentir sobre o que
 * acontece, então o card mostra o que o robô faz e diz que o resto é ignorado.
 */
const ESPERA_MAXIMA_POR_CARD = 3

function textoDaEspera(pedido: number | undefined): string {
  const quis = Number(pedido ?? ESPERA_MAXIMA_POR_CARD)
  const vale = Math.max(0, Math.min(quis, ESPERA_MAXIMA_POR_CARD))
  if (quis > ESPERA_MAXIMA_POR_CARD) return `Espera ${vale}s (o card pede ${quis}s; o resto é ignorado)`
  return `Espera ${vale}s antes de continuar`
}

export const DelayNode = memo(function DelayNode({ data }: NodeProps) {
  const d = data as { label: string; seconds?: number }
  return (
    <div className={cn(CARD, 'border-border')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-border bg-muted text-foreground')}>
        <Timer className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        <p className="text-foreground/80">{textoDaEspera(d.seconds)}</p>
      </Body>
      <Handle
        type="source"
        id="next"
        position={Position.Right}
        className="!h-2 !w-2 !border !border-border !bg-muted-foreground"
      />
    </div>
  )
})

// ─── Randomizador ────────────────────────────────────────────────────────────

export const RandomNode = memo(function RandomNode({ data }: NodeProps) {
  const d = data as { label: string; branches?: { id: string; label: string; weight: number }[] }
  const branches = d.branches ?? []
  const total = branches.reduce((s, b) => s + (b.weight || 0), 0) || 1
  return (
    <div className={cn(CARD, 'border-sem-info-bd')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-sem-info-bd bg-sem-info text-sem-info-fg')}>
        <Shuffle className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        <ul className="space-y-1">
          {branches.map((b) => (
            <li
              key={b.id}
              className="relative flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground/80"
            >
              <span className="truncate">{b.label}</span>
              <span className="shrink-0 opacity-70">{Math.round((b.weight / total) * 100)}%</span>
              <Handle
                type="source"
                id={`out:${b.id}`}
                position={Position.Right}
                className="!h-2 !w-2 !border !border-sem-info-bd !bg-sem-info"
                style={{ right: -14, top: '50%' }}
              />
            </li>
          ))}
        </ul>
      </Body>
    </div>
  )
})

// ─── Integração (webhook) ────────────────────────────────────────────────────

export const IntegrationNode = memo(function IntegrationNode({ data }: NodeProps) {
  const d = data as { label: string; url?: string }
  return (
    <div className={cn(CARD, 'border-primary/50')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-primary/50 bg-primary/10 text-foreground')}>
        <Webhook className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        <p className="mb-2 truncate font-mono text-[11px] text-foreground/80">
          {d.url || 'sem URL configurada'}
        </p>
        <div className="relative rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
          Sucesso
          <Handle type="source" id="success" position={Position.Right} className="!h-2 !w-2 !border !border-sem-success-bd !bg-sem-success" style={{ right: -14, top: '50%' }} />
        </div>
        <div className="relative mt-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
          Erro
          <Handle type="source" id="error" position={Position.Right} className="!h-2 !w-2 !border !border-destructive !bg-destructive" style={{ right: -14, top: '50%' }} />
        </div>
      </Body>
    </div>
  )
})

/** Mapa de tipos que o React Flow usa para escolher o componente. */
export const TagNode = memo(function TagNode({ data }: NodeProps) {
  const d = data as { label: string; tagsAplicar?: string[]; tagsRemover?: string[] }
  const aplicar = d.tagsAplicar ?? []
  const remover = d.tagsRemover ?? []
  return (
    <div className={cn(CARD, 'border-border')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-border bg-muted text-foreground')}>
        <Tag className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        {aplicar.length === 0 && remover.length === 0 && (
          <p className="italic text-muted-foreground">Nenhuma etiqueta escolhida</p>
        )}
        {aplicar.length > 0 && (
          <p className="text-foreground/80">Marca: {aplicar.join(', ')}</p>
        )}
        {remover.length > 0 && (
          <p className="text-foreground/80">Desmarca: {remover.join(', ')}</p>
        )}
      </Body>
      <Handle
        type="source"
        id="next"
        position={Position.Right}
        className="!h-2 !w-2 !border !border-border !bg-muted-foreground"
      />
    </div>
  )
})

const RESPOSTA_ESPERADA: Record<string, string> = {
  qualquer: 'qualquer texto',
  numero: 'só números',
  email: 'um e-mail',
  telefone: 'um telefone',
  cnpj: 'um CNPJ válido',
}

export const QuestionNode = memo(function QuestionNode({ data }: NodeProps) {
  const d = data as {
    label: string; text?: string; validacao?: string; tentativas?: number; semRespostaMin?: number
  }
  return (
    <div className={cn(CARD, 'border-border')}>
      <TargetHandle />
      <div className={cn(HEADER, 'border-border bg-muted text-foreground')}>
        <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden />
        {d.label}
      </div>
      <Body>
        <p className="whitespace-pre-wrap text-foreground/80">
          {d.text?.trim() || <span className="italic text-muted-foreground">Sem a pergunta</span>}
        </p>
        <p className="pt-1 text-[11px] text-muted-foreground">
          Espera {RESPOSTA_ESPERADA[d.validacao ?? 'qualquer'] ?? 'qualquer texto'} ·{' '}
          {d.tentativas ?? 2} tentativa(s)
        </p>
        <SaidaSemResposta
          minutos={Number(d.semRespostaMin ?? 0)}
          cor="!border-muted-foreground !bg-muted-foreground"
        />
      </Body>
      {/* Duas saídas: respondeu certo, e desistiu depois das tentativas. */}
      <Handle
        type="source" id="next" position={Position.Right} style={{ top: '38%' }}
        className="!h-2 !w-2 !border !border-emerald-600 !bg-emerald-500"
      />
      <Handle
        type="source" id="fail" position={Position.Right} style={{ top: '72%' }}
        className="!h-2 !w-2 !border !border-amber-600 !bg-amber-500"
      />
    </div>
  )
})

export const waFlowNodeTypes = {
  menu: MenuNode,
  content: ContentNode,
  handoff: HandoffNode,
  condition: ConditionNode,
  tag: TagNode,
  question: QuestionNode,
  delay: DelayNode,
  // Assistente, randomizador e integração saíram do editor na entrega 6 do
  // Fluxo v2 (o motor nunca os executou), mas continuam desenhados: fluxo
  // antigo que já os tem precisa aparecer na tela.
  assistant: AssistantNode,
  random: RandomNode,
  integration: IntegrationNode,
}
