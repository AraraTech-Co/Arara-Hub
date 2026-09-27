'use client'

// Uma linha do Gantt — nas duas metades. A ESQUERDA (nome) e a DIREITA (barra)
// são renderizadas separadamente mas precisam ter exatamente a mesma altura e a
// mesma ordem, senão o nome deixa de corresponder à barra. Por isso a altura é
// uma constante única, exportada daqui.

import { TriangleAlert, Lock } from 'lucide-react'
import type { LinhaGantt } from '@/hooks/use-gantt-datas'
import { DEV_LABELS, numeroDev, type DevStatus } from '@/lib/kanban-dev'
import { dataBR } from '@/lib/projetos'

export const ALTURA_LINHA = 32

export function GanttNome({
  linha,
  onAbrir,
}: {
  linha: LinhaGantt
  onAbrir?: () => void
}) {
  if (linha.tipo === 'fase') {
    return (
      <div
        className="flex items-center gap-2 px-3 border-b border-border bg-muted/40"
        style={{ height: ALTURA_LINHA }}
      >
        <span className="text-xs font-semibold text-foreground truncate">{linha.fase.nome}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {linha.fase.total_cards || 0} card(s)
        </span>
      </div>
    )
  }

  const c = linha.card
  const semData = linha.inicio === null && linha.fim === null
  return (
    <div className="flex items-center gap-2 px-3 pl-6 border-b border-border" style={{ height: ALTURA_LINHA }}>
      <button
        type="button"
        onClick={onAbrir}
        className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
      >
        {numeroDev(c.ticket_number)}
      </button>
      <span className="text-xs text-foreground truncate flex-1" title={c.title || ''}>
        {c.title}
      </span>
      {linha.bloqueado && <Lock className="w-3 h-3 text-red-500 shrink-0" />}
      {semData && (
        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">sem data</span>
      )}
    </div>
  )
}

/** O texto que aparece ao passar o mouse na barra — é onde estão os números. */
export function tituloDaBarra(linha: LinhaGantt): string {
  if (linha.tipo === 'fase') {
    return `${linha.fase.nome} · ${linha.fase.progresso || 0}%`
  }
  const c = linha.card
  const partes = [
    `${numeroDev(c.ticket_number)} — ${c.title || ''}`,
    `Status: ${DEV_LABELS[c.status as DevStatus] || c.status}`,
    `${dataBR(c.inicio_planejado)} → ${dataBR(c.previsao_entrega)}`,
    `Progresso: ${c.progresso_efetivo || 0}%`,
  ]
  if (c.atrasado) partes.push('ATRASADO')
  if (linha.bloqueado) partes.push('BLOQUEADO por dependência')
  return partes.join('\n')
}

export function AvisoSemData({ quantos }: { quantos: number }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>
        {quantos} card(s) sem data de planejamento não aparecem como barra — eles existem no
        projeto e contam no progresso, mas não têm onde ser desenhados. Defina início e
        previsão no bloco de planejamento.
      </span>
    </div>
  )
}
