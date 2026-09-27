'use client'

// =============================================================================
// Ordenação do Kanban Dev (item 2.5). A regra mora em lib/dev-ordenacao.ts;
// aqui é só a escolha do critério e da direção. Fica na mesma linha dos
// filtros: recorte e ordem são as duas decisões de quem olha o quadro.
// =============================================================================

import { ArrowDownAZ, ArrowUpAZ, GripVertical } from 'lucide-react'
import { OPCOES_ORDENACAO, opcaoDe, type OrdenacaoDev, type OrdenarPor } from '@/lib/dev-ordenacao'

const SELECT = 'h-8 rounded-md border border-border bg-background px-2 text-sm'

export function DevSortBar({
  ordenacao,
  onChange,
  temTimes,
}: {
  ordenacao: OrdenacaoDev
  onChange: (o: OrdenacaoDev) => void
  /** Sem times cadastrados, "Time do responsável" não ordena nada e some. */
  temTimes: boolean
}) {
  const opcao = opcaoDe(ordenacao.por)
  const escolher = (por: OrdenarPor) => onChange({ por, dir: opcaoDe(por).dirPadrao })
  const inverter = () => onChange({ ...ordenacao, dir: ordenacao.dir === 'asc' ? 'desc' : 'asc' })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Ordenar:</span>
      <select
        value={ordenacao.por}
        onChange={(e) => escolher(e.target.value as OrdenarPor)}
        aria-label="Ordenar por"
        className={`${SELECT} ${ordenacao.por !== 'manual' ? 'border-primary/60' : ''}`}
      >
        {OPCOES_ORDENACAO.filter((o) => o.value !== 'time' || temTimes).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={inverter}
        title="Inverter a direção"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-foreground/80 hover:bg-muted"
      >
        {ordenacao.dir === 'asc'
          ? <ArrowUpAZ className="h-3.5 w-3.5 text-muted-foreground" />
          : <ArrowDownAZ className="h-3.5 w-3.5 text-muted-foreground" />}
        {opcao.rotulos[ordenacao.dir]}
      </button>
      {ordenacao.por === 'manual' ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <GripVertical className="h-3 w-3" /> arraste dentro da coluna para reordenar
        </span>
      ) : (
        <span className="rounded border border-sem-warning-bd bg-sem-warning px-1.5 py-0.5 text-[10px] font-medium text-sem-warning-fg">
          Ordenado por {opcao.label.toLowerCase()} — reordenar manualmente desativado
        </span>
      )}
    </div>
  )
}
