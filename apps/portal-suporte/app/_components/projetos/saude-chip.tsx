'use client'

// =============================================================================
// A saúde do projeto — com os motivos escritos.
//
// Um selo "em risco" sem dizer por quê não muda o comportamento de ninguém: a
// pessoa olha, encolhe os ombros e segue. O que muda comportamento é "4 cards
// atrasados; o marco de homologação venceu há 3 dias". Por isso o motivo NÃO
// fica escondido num tooltip: tooltip não existe em toque, e o motivo é a
// informação, não o detalhe.
// =============================================================================

import { CheckCircle2, TriangleAlert, OctagonAlert } from 'lucide-react'
import type { SaudeProjeto } from '@/lib/api/projetos'

const ESTILO: Record<SaudeProjeto['estado'], { classe: string; rotulo: string; Icone: typeof CheckCircle2 }> = {
  ok:      { classe: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', rotulo: 'No prazo',  Icone: CheckCircle2 },
  atencao: { classe: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',        rotulo: 'Atenção',   Icone: TriangleAlert },
  critico: { classe: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',                rotulo: 'Crítico',   Icone: OctagonAlert },
}

export function SaudeChip({ saude, compacto = false }: { saude: SaudeProjeto; compacto?: boolean }) {
  const e = ESTILO[saude.estado] ?? ESTILO.ok
  const { Icone } = e
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${e.classe}`}>
      <div className="flex items-center gap-1.5">
        {/* Ícone além da cor: quem não distingue vermelho de verde precisa da
            mesma informação. */}
        <Icone className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs font-semibold">{e.rotulo}</span>
      </div>
      {!compacto && saude.motivos.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {saude.motivos.map((m, i) => (
            <li key={i} className="text-[11px] leading-snug opacity-90">• {m}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
