'use client'

// =============================================================================
// Trocar o servidor HML de um card já em teste.
//
// Antes, o servidor só era escolhido na passagem para Pronto p/ Teste: quem
// errou a escolha, ou precisava liberar a máquina, tinha de mover o card para
// trás. Decisão do Leonardo (29/10/2026), a pedido do Willian.
//
// SÓ APARECE nas duas colunas em que o servidor está reservado. Fora delas o
// campo não significa nada, e oferecer a troca daria a impressão de que
// significa — a rota recusa, e a tela não deve oferecer o que a rota recusa.
//
// O botão só habilita quando o valor MUDA: o servidor recusa gravar valor
// igual, para não mexer no carimbo nem encher o histórico de troca que não
// aconteceu.
// =============================================================================

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { kanbanDevApi } from '@/lib/api/kanban-dev'
import {
  SEM_SERVIDOR_HML, SERVIDORES_HML, labelServidorHml, travaHml, trocaMudouAlgo,
} from '@/lib/servidores-hml'

export type CardParaTroca = {
  id: string
  status: string
  environment?: string | null
}

export function TrocarServidorHml({
  card, cards, podeEditar, aoTrocar,
}: {
  card: CardParaTroca
  cards: { id: string; status: string; environment?: string | null }[]
  podeEditar: boolean
  aoTrocar: () => void
}) {
  const atual = String(card.environment || '')
  const [escolha, setEscolha] = useState(atual)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Livres = não ocupados por OUTRO card nas colunas de teste. O atual continua
  // na lista, senão o seletor abriria mostrando outra coisa que não o que está
  // gravado.
  const opcoes = useMemo(() => {
    const ocupados = new Set<string>()
    for (const c of cards) {
      if (String(c.id) === String(card.id)) continue
      if (!travaHml(c.status)) continue
      const env = String(c.environment || '').trim()
      // O valor reservado não ocupa nada: não entra no conjunto.
      if (env && env !== SEM_SERVIDOR_HML) ocupados.add(env)
    }
    return SERVIDORES_HML.filter((s) => !ocupados.has(s) || s === atual)
  }, [cards, card.id, atual])

  if (!travaHml(card.status)) return null

  const mudou = escolha !== atual

  async function salvar() {
    if (!mudou || salvando) return
    setSalvando(true)
    setErro('')
    try {
      const r = await kanbanDevApi.trocarServidorHml(card.id, escolha)
      // `mudou: false` significa que o servidor recusou regravar valor igual:
      // recarregar o quadro ali seria pedir tudo de novo para nada.
      if (trocaMudouAlgo(r)) aoTrocar()
    } catch (e) {
      // O erro fica na tela e a escolha continua: a recusa mais comum é
      // servidor tomado por outro card no meio do caminho, e a pessoa precisa
      // ler isso para escolher outro.
      setErro(e instanceof Error ? e.message : 'Não deu para trocar o servidor agora.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mt-3 rounded-md border border-border p-2.5">
      <label htmlFor="troca-hml" className="text-xs font-medium text-foreground">
        Servidor HML
      </label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Só aparecem servidores livres e o atual. Trocar libera o anterior na hora.
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <select
          id="troca-hml"
          value={escolha}
          onChange={(e) => setEscolha(e.target.value)}
          disabled={!podeEditar || salvando}
          className="h-8 min-w-48 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60"
        >
          {/* O atual pode não estar entre as opções se for um valor antigo que
              saiu da lista: sem esta entrada o seletor mostraria vazio e o
              botão acharia que houve troca. */}
          {!!atual && !opcoes.includes(atual as (typeof SERVIDORES_HML)[number])
            && atual !== SEM_SERVIDOR_HML && (
            <option value={atual}>{labelServidorHml(atual)}</option>
          )}
          {opcoes.map((s) => (
            <option key={s} value={s}>{labelServidorHml(s)}</option>
          ))}
          <option value={SEM_SERVIDOR_HML}>{labelServidorHml(SEM_SERVIDOR_HML)}</option>
        </select>
        <button
          onClick={salvar}
          disabled={!podeEditar || !mudou || salvando}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {salvando && <Loader2 className="w-3 h-3 animate-spin" />}
          Salvar
        </button>
        {!podeEditar && (
          <span className="text-xs text-muted-foreground">Trocar o servidor exige nível developer.</span>
        )}
        {podeEditar && !mudou && (
          <span className="text-xs text-muted-foreground">Nada mudou ainda.</span>
        )}
      </div>
      {erro && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>
      )}
    </div>
  )
}
