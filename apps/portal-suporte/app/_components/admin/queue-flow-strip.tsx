'use client'

// =============================================================================
// A fila do suporte desenhada como o caminho que ela é.
//
// Antes: seis pílulas cinzas numa grade 2×3, fora da ordem do quadro, com a
// contagem em 14px e a cor reduzida a um ponto de 8px vindo de hex fixo. Para
// saber onde a fila entope era preciso ler seis números e comparar de cabeça.
//
// Aqui cada coluna do Kanban vira um segmento com LARGURA proporcional à
// contagem, na ordem real do fluxo, pintado com o token do próprio status. O
// gargalo deixa de ser um número e vira forma: quando Pendência incha para 40%
// da faixa, se enxerga de longe. É a mesma cor que a pessoa já leu no quadro,
// então não há um segundo código de cores para aprender.
//
// Resolvidos NÃO entra. Antes entrava, e quem consumia somava tudo: o painel
// anunciava "454 ativos" quando havia 76 — histórico contado como trabalho.
//
// Largura mínima por segmento: uma coluna com 1 chamado precisa continuar
// clicável e legível; proporcional puro a reduziria a um fio.
// =============================================================================

import Link from 'next/link'
import { useMemo } from 'react'

export type ColunaFila = { label: string; value: number; token: string }

const MINIMO_PCT = 6

export function QueueFlowStrip({
  colunas,
  resolvidos,
}: {
  colunas: ColunaFila[]
  resolvidos?: number
}) {
  const total = colunas.reduce((s, c) => s + c.value, 0)

  const comLargura = useMemo(() => {
    const visiveis = colunas.filter((c) => c.value > 0)
    if (!visiveis.length || !total) return []
    const cru = visiveis.map((c) => ({ ...c, pct: (c.value / total) * 100 }))
    // Devolve aos maiores o espaço emprestado aos menores, para a soma fechar
    // em 100% e a faixa não sobrar nem estourar.
    const emprestado = cru.reduce((s, c) => s + Math.max(0, MINIMO_PCT - c.pct), 0)
    const doadores = cru.filter((c) => c.pct > MINIMO_PCT)
    const somaDoadores = doadores.reduce((s, c) => s + c.pct, 0) || 1
    return cru.map((c) =>
      c.pct < MINIMO_PCT
        ? { ...c, pct: MINIMO_PCT }
        : { ...c, pct: c.pct - emprestado * (c.pct / somaDoadores) },
    )
  }, [colunas, total])

  if (!comLargura.length) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
        Nenhum chamado em aberto.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="text-2xl font-bold text-foreground">{total}</span> em aberto
        </p>
        {typeof resolvidos === 'number' && (
          // Histórico existe, mas recuado: não é trabalho a fazer.
          <p className="text-xs text-muted-foreground">{resolvidos} já resolvidos</p>
        )}
      </div>

      {/* h-14 e não h-2: o número mora DENTRO do segmento. Uma barra fina
          exigiria legenda separada, e aí voltaria a ser ler-e-comparar. */}
      <div className="flex h-14 w-full overflow-hidden rounded-lg border border-border">
        {comLargura.map((c, i) => (
          <Link
            key={c.label}
            href={`/admin/kanban/`}
            title={`${c.value} em ${c.label}`}
            style={{
              width: `${c.pct}%`,
              // A cor da etapa vira um FIO no topo, não o preenchimento.
              // Os tokens `status-*` são tintas de distintivo pequeno; esticadas
              // numa faixa de 56px por toda a largura viravam marrom, oliva e
              // vinho embarrados. Como fio, identificam a etapa sem sujar — e a
              // proporção, que é a informação de verdade, continua na largura.
              boxShadow: `inset 0 3px 0 0 var(--status-${c.token}-fg)`,
            }}
            className={`flex min-w-0 flex-col items-center justify-center bg-muted/40 transition-colors hover:bg-muted ${
              i > 0 ? 'border-l border-border/60' : ''
            }`}
          >
            <span
              className="text-lg font-bold leading-none text-foreground"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {c.value}
            </span>
            <span
              className="mt-0.5 max-w-full truncate px-1 text-[11px] leading-none"
              style={{ color: `var(--status-${c.token}-fg)` }}
            >
              {c.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
