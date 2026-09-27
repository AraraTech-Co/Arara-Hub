'use client'

// =============================================================================
// As setas de dependência, desenhadas por cima das barras.
//
// Camada própria (SVG) e não borda de elemento: uma seta liga DUAS linhas
// diferentes, e nenhum dos dois elementos pode desenhá-la sozinho. `pointer-
// events: none` na camada inteira, exceto na própria seta — senão ela roubaria
// o clique das barras que estão embaixo.
// =============================================================================

import { ALTURA_LINHA } from './gantt-linha'

export type Seta = {
  id: string
  /** coluna x do fim da barra de origem e da largada da barra de destino */
  xOrigem: number
  xDestino: number
  linhaOrigem: number
  linhaDestino: number
}

export function GanttDependencias({
  setas,
  largura,
  altura,
  podeRemover,
  aoRemover,
}: {
  setas: Seta[]
  largura: number
  altura: number
  podeRemover: boolean
  aoRemover: (id: string) => void
}) {
  if (!setas.length) return null
  const y = (linha: number) => linha * ALTURA_LINHA + ALTURA_LINHA / 2

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none z-[15]"
      width={largura}
      height={altura}
    >
      <defs>
        <marker id="seta-dep" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" className="fill-foreground/50" />
        </marker>
      </defs>
      {setas.map((s) => {
        const y1 = y(s.linhaOrigem)
        const y2 = y(s.linhaDestino)
        // Cotovelo: sai da origem, anda um pouco, desce/sobe, entra no destino.
        // Um traço reto na diagonal cruzaria as barras do meio e viraria teia.
        const meio = s.xDestino > s.xOrigem + 16
          ? s.xOrigem + 10
          : s.xDestino - 12
        const d = `M ${s.xOrigem} ${y1} L ${meio} ${y1} L ${meio} ${y2} L ${s.xDestino - 4} ${y2}`
        return (
          <g key={s.id} className="group">
            <path d={d} fill="none" className="stroke-foreground/40" strokeWidth={1.5} markerEnd="url(#seta-dep)" />
            {podeRemover && (
              <>
                {/* Alvo largo e invisível: uma linha de 1,5px é impossível de
                    acertar com o mouse. Só ele escuta o ponteiro. */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => aoRemover(s.id)}
                >
                  <title>Clique para remover esta dependência</title>
                </path>
                {/* O botão aparece só no hover da própria seta. Fixo, ele
                    cobriria a barra de outro card e roubaria o clique dela. */}
                <circle
                  cx={meio}
                  cy={(y1 + y2) / 2}
                  r={6}
                  className="fill-background stroke-red-500 opacity-0 group-hover:opacity-100 pointer-events-none"
                />
                <path
                  d={`M ${meio - 2.5} ${(y1 + y2) / 2} L ${meio + 2.5} ${(y1 + y2) / 2}`}
                  className="stroke-red-500 opacity-0 group-hover:opacity-100 pointer-events-none"
                  strokeWidth={1.5}
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
