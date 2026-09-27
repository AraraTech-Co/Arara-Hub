'use client'

// A régua de tempo: faixa de meses em cima, marcas embaixo.

import { fimDeSemana, letraDaSemana, type Escala } from '@/lib/projetos-datas'
import type { GanttCalculado } from '@/hooks/use-gantt-datas'

export function GanttEscala({ g, escala }: { g: GanttCalculado; escala: Escala }) {
  return (
    <div className="sticky top-0 z-10 bg-background border-b border-border">
      {/* Faixa de meses */}
      <div className="relative h-6" style={{ width: g.larguraPx }}>
        {g.meses.map((m) => (
          <div
            key={m.dia}
            // Sem `overflow-hidden` de propósito: `overflow` num ancestral anula o
            // `sticky` do rótulo — foi exatamente o que impediu o mês de acompanhar
            // a rolagem na primeira tentativa.
            className="absolute top-0 h-6 flex items-center border-l border-border text-[11px] font-medium text-foreground/70 whitespace-nowrap"
            style={{ left: g.x(m.dia), width: m.dias * g.pxPorDia }}
          >
            {/* Grudado à esquerda: rolando para o meio de agosto, o rótulo "ago
                de 2026" continua visível em vez de ficar para trás com o
                começo do mês. Sem isto, quem rola perde a referência do mês. */}
            <span className="sticky left-0 px-2 bg-background">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Marcas */}
      <div className="relative h-7" style={{ width: g.larguraPx }}>
        {escala === 'dia' && Array.from({ length: g.totalDias }, (_, i) => g.inicio + i)
          .filter(fimDeSemana)
          .map((d) => (
            <div
              key={`fds_${d}`}
              className="absolute top-0 bottom-0 bg-muted/60"
              style={{ left: g.x(d), width: g.pxPorDia }}
            />
          ))}
        {g.marcas.map((m) => (
          <div
            key={m.dia}
            className={`absolute top-0 h-7 flex flex-col items-center justify-center border-l ${
              m.forte ? 'border-border' : 'border-border/40'
            }`}
            style={{ left: g.x(m.dia), width: escala === 'dia' ? g.pxPorDia : undefined }}
          >
            {/* Na escala de mês o rótulo repetiria a faixa logo acima — traço
                sem texto basta. */}
            {escala !== 'mes' && (
              <span className={`text-[10px] leading-none ${m.forte ? 'text-foreground/80 font-medium' : 'text-muted-foreground'} px-1 whitespace-nowrap`}>
                {m.label}
              </span>
            )}
            {escala === 'dia' && (
              <span className="text-[9px] leading-none text-muted-foreground/60 mt-0.5">
                {letraDaSemana(m.dia)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
