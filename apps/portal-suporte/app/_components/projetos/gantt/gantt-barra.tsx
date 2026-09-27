'use client'

// =============================================================================
// A barra de um card (ou de uma fase) na linha do tempo.
//
// Atrasado e bloqueado NÃO são apenas vermelho: têm hachura na barra e um
// símbolo na ponta. Quem não distingue vermelho de verde precisa enxergar a
// mesma informação — e num Gantt colorido a cor sozinha some no meio das
// outras.
//
// O arrasto acontece aqui só no gesto de INÍCIO; o cálculo e a gravação são do
// componente pai, que é quem conhece a régua.
// =============================================================================

import { TriangleAlert, Lock } from 'lucide-react'

export type ModoArrasto = 'mover' | 'inicio' | 'fim' | 'ligar'

export function GanttBarra({
  esquerda,
  largura,
  progresso,
  titulo,
  atrasado,
  bloqueado,
  tipo,
  arrastando,
  onClick,
  aoIniciarArrasto,
}: {
  esquerda: number
  largura: number
  progresso: number
  titulo: string
  atrasado?: boolean
  bloqueado?: boolean
  tipo: 'card' | 'fase'
  arrastando?: boolean
  onClick?: () => void
  /** Ausente = barra só de leitura (fase, ou sem permissão de planejar). */
  aoIniciarArrasto?: (modo: ModoArrasto, e: React.PointerEvent) => void
}) {
  const base = tipo === 'fase'
    ? 'bg-muted-foreground/20 border-muted-foreground/40'
    : atrasado
      ? 'bg-red-500/20 border-red-500/60'
      : 'bg-indigo-500/20 border-indigo-500/60'

  const preenchimento = tipo === 'fase'
    ? 'bg-muted-foreground/50'
    : atrasado ? 'bg-red-500/70' : 'bg-indigo-500/70'

  const podeArrastar = !!aoIniciarArrasto

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 group ${arrastando ? 'z-20' : 'z-10'}`}
      style={{ left: esquerda, width: Math.max(largura, 6), height: tipo === 'fase' ? 12 : 20 }}
    >
      <button
        type="button"
        onClick={onClick}
        onPointerDown={podeArrastar ? (e) => aoIniciarArrasto('mover', e) : undefined}
        title={titulo}
        className={`absolute inset-0 rounded-md border overflow-hidden text-left ${base} ${
          arrastando ? 'ring-2 ring-indigo-400 brightness-110' : ''
        } ${podeArrastar ? 'cursor-grab active:cursor-grabbing' : onClick ? 'cursor-pointer' : 'cursor-default'}`}
        style={{
          // Hachura: a marca visual de "atenção" que não depende de enxergar cor.
          // Cinza médio e não preto: preto some no tema escuro, e o portal é usado
          // nos dois temas.
          backgroundImage: atrasado || bloqueado
            ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(120,120,120,0.45) 4px, rgba(120,120,120,0.45) 8px)'
            : undefined,
        }}
      >
        <span
          className={`absolute inset-y-0 left-0 ${preenchimento}`}
          style={{ width: `${Math.max(0, Math.min(100, progresso))}%` }}
        />
        {(atrasado || bloqueado) && tipo === 'card' && (
          <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-red-700 dark:text-red-300">
            {bloqueado ? <Lock className="w-3 h-3" /> : <TriangleAlert className="w-3 h-3" />}
          </span>
        )}
      </button>

      {podeArrastar && (
        <>
          {/* Pegadores de redimensionar. Aparecem no hover para não poluir, mas
              a área de toque é a barra inteira nas pontas. */}
          <span
            onPointerDown={(e) => aoIniciarArrasto('inicio', e)}
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-l-md bg-indigo-600/0 group-hover:bg-indigo-600/70"
            title="Arraste para mudar o início"
          />
          <span
            onPointerDown={(e) => aoIniciarArrasto('fim', e)}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r-md bg-indigo-600/0 group-hover:bg-indigo-600/70"
            title="Arraste para mudar a previsão"
          />
          {/* Ponto de ligação: puxe daqui até outra barra para dizer que ela só
              começa depois desta. */}
          <span
            onPointerDown={(e) => aoIniciarArrasto('ligar', e)}
            className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-indigo-500 bg-background opacity-0 group-hover:opacity-100 cursor-crosshair"
            title="Puxe até outro card para criar dependência"
          />
        </>
      )}
    </div>
  )
}
