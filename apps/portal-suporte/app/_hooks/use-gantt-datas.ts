'use client'

// =============================================================================
// O cálculo do Gantt, separado do desenho.
//
// Recebe o projeto e devolve as LINHAS já ordenadas e as posições em pixel.
// Fica fora do componente por um motivo prático: com o cálculo aqui, dá para
// mudar o desenho sem tocar na matemática, e a matemática é onde moram os erros
// de data.
// =============================================================================

import { useMemo } from 'react'
import type { CardDoProjeto, ProjetoDetalhe, ProjetoFase, ProjetoMarco } from '@/lib/api/projetos'
import {
  PX_POR_DIA, diaDe, faixasDeMes, hojeDia, janela, marcasDaRegua, type Escala,
} from '@/lib/projetos-datas'

export type LinhaGantt =
  | { tipo: 'fase'; chave: string; fase: ProjetoFase; inicio: number | null; fim: number | null }
  | { tipo: 'card'; chave: string; card: CardDoProjeto; inicio: number | null; fim: number | null; bloqueado: boolean }

export type GanttCalculado = {
  linhas: LinhaGantt[]
  marcos: (ProjetoMarco & { dia: number | null })[]
  inicio: number
  fim: number
  totalDias: number
  pxPorDia: number
  larguraPx: number
  hoje: number
  marcas: ReturnType<typeof marcasDaRegua>
  meses: ReturnType<typeof faixasDeMes>
  /** Posição esquerda, em pixel, do início de um dia. */
  x: (dia: number) => number
  /** Cards que não têm data nenhuma — não desenham barra, mas existem. */
  semData: CardDoProjeto[]
}

export function useGanttDatas(projeto: ProjetoDetalhe, escala: Escala): GanttCalculado {
  return useMemo(() => {
    const cards = projeto.cards
    const pxPorDia = PX_POR_DIA[escala]

    // Card bloqueado = depende de outro que ainda não foi aplicado no cliente.
    // As dependências só podem ser criadas na entrega 3; até lá isto é sempre
    // falso, e é assim que deve ser — a regra fica pronta, não inventada depois.
    const porId: Record<string, CardDoProjeto> = {}
    for (const c of cards) porId[c.id] = c
    const bloqueia: Record<string, boolean> = {}
    for (const d of projeto.dependencias || []) {
      const origem = porId[d.origem_ticket_id]
      if (!origem || origem.status !== 'aplicado_no_cliente') bloqueia[d.destino_ticket_id] = true
    }

    const datas: unknown[] = [projeto.inicio_planejado, projeto.fim_planejado]
    for (const c of cards) { datas.push(c.inicio_planejado, c.previsao_entrega) }
    for (const m of projeto.marcos || []) datas.push(m.data)

    const { inicio, fim } = janela(datas)
    const totalDias = fim - inicio + 1
    const x = (dia: number) => (dia - inicio) * pxPorDia

    const linhaDoCard = (c: CardDoProjeto): LinhaGantt => ({
      tipo: 'card',
      chave: `c_${c.id}`,
      card: c,
      inicio: diaDe(c.inicio_planejado),
      fim: diaDe(c.previsao_entrega),
      bloqueado: !!bloqueia[c.id],
    })

    const linhas: LinhaGantt[] = []
    for (const f of projeto.fases) {
      const meus = cards.filter((c) => c.fase_id === f.id)
      linhas.push({
        tipo: 'fase',
        chave: `f_${f.id}`,
        fase: f,
        inicio: diaDe(f.inicio_efetivo || f.inicio_planejado),
        fim: diaDe(f.fim_efetivo || f.fim_planejado),
      })
      for (const c of meus) linhas.push(linhaDoCard(c))
    }
    const orfaos = cards.filter((c) => !c.fase_id)
    for (const c of orfaos) linhas.push(linhaDoCard(c))

    return {
      linhas,
      marcos: (projeto.marcos || []).map((m) => ({ ...m, dia: diaDe(m.data) })),
      inicio,
      fim,
      totalDias,
      pxPorDia,
      larguraPx: totalDias * pxPorDia,
      hoje: hojeDia(),
      marcas: marcasDaRegua(inicio, fim, escala),
      meses: faixasDeMes(inicio, fim),
      x,
      semData: cards.filter((c) => !diaDe(c.inicio_planejado) && !diaDe(c.previsao_entrega)),
    }
  }, [projeto, escala])
}
