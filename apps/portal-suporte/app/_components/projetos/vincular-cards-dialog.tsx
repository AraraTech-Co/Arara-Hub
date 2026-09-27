'use client'

// =============================================================================
// Pendurar cards do quadro Dev num projeto.
//
// Só aparecem os cards que ainda não pertencem a projeto nenhum: um card com
// dois donos seria a primeira fonte de número errado. O servidor recusa de
// novo, com 409 — esta lista é cortesia.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { X, Search } from 'lucide-react'
import { projetosApi, type ProjetoDetalhe } from '@/lib/api/projetos'
import { kanbanDevApi } from '@/lib/api/kanban-dev'
import { DEV_LABELS, numeroDev, type DevStatus } from '@/lib/kanban-dev'

type CardDev = {
  id: string
  ticket_number?: string
  title?: string
  status?: string
  projeto_id?: string
}

export function VincularCardsDialog({
  projeto,
  onFechar,
  onVinculado,
}: {
  projeto: ProjetoDetalhe
  onFechar: () => void
  onVinculado: () => void
}) {
  const [cards, setCards] = useState<CardDev[]>([])
  const [busca, setBusca] = useState('')
  const [escolhidos, setEscolhidos] = useState<Record<string, boolean>>({})
  const [faseId, setFaseId] = useState(projeto.fases[0]?.id || '')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    kanbanDevApi.listar()
      .then((r) => setCards((r.tickets || []) as unknown as CardDev[]))
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [])

  const disponiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return cards
      .filter((c) => !c.projeto_id)
      .filter((c) => String(c.status || '') !== 'descartado')
      .filter((c) => !termo
        || String(c.title || '').toLowerCase().includes(termo)
        || String(c.ticket_number || '').toLowerCase().includes(termo))
  }, [cards, busca])

  const quantos = Object.values(escolhidos).filter(Boolean).length

  async function salvar() {
    const ids = Object.keys(escolhidos).filter((k) => escolhidos[k])
    if (!ids.length) return
    setSalvando(true)
    try {
      await projetosApi.cards.vincular(projeto.id, ids, faseId)
      onVinculado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao pendurar os cards.')
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold text-foreground text-sm">Pendurar cards em {projeto.codigo}</h2>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número ou título"
              className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
            />
          </div>
          {projeto.fases.length > 0 && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Colocar na fase</label>
              <select
                value={faseId}
                onChange={(e) => setFaseId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">Sem fase</option>
                {projeto.fases.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {carregando ? (
            <p className="p-5 text-sm text-muted-foreground">Carregando cards…</p>
          ) : disponiveis.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Nenhum card livre no quadro Dev. Cards que já pertencem a um projeto não
              aparecem aqui.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {disponiveis.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={!!escolhidos[c.id]}
                      onChange={(e) => setEscolhidos({ ...escolhidos, [c.id]: e.target.checked })}
                    />
                    <span className="font-mono text-xs text-muted-foreground w-20">
                      {numeroDev(c.ticket_number)}
                    </span>
                    <span className="flex-1 text-sm text-foreground truncate">{c.title}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground/70">
                      {DEV_LABELS[c.status as DevStatus] || c.status}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {erro && <p className="px-5 py-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onFechar} className="px-4 py-2 text-sm text-foreground/70 hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || quantos === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {salvando ? 'Salvando…' : `Pendurar ${quantos || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  )
}
