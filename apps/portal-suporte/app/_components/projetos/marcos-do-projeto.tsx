'use client'

// =============================================================================
// Os marcos do projeto — datas que importam e não têm duração.
//
// Marcar como atingido NÃO muda a data planejada: é a distância entre a data
// planejada e o dia em que aconteceu que conta a história do projeto. Sobrescrever
// a primeira apagaria justamente o que interessa.
// =============================================================================

import { useState } from 'react'
import { Flag, Plus, Trash2, Check, RotateCcw } from 'lucide-react'
import { projetosApi, type ProjetoDetalhe } from '@/lib/api/projetos'
import { dataBR, dataCal, hojeCal } from '@/lib/projetos'

export function MarcosDoProjeto({
  projeto,
  podePlanejar,
  aoMudar,
}: {
  projeto: ProjetoDetalhe
  podePlanejar: boolean
  aoMudar: () => void
}) {
  const [nome, setNome] = useState('')
  const [data, setData] = useState(hojeCal())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const marcos = [...projeto.marcos].sort(
    (a, b) => String(a.data || '').localeCompare(String(b.data || '')),
  )

  async function acao(fn: () => Promise<unknown>) {
    setSalvando(true)
    setErro('')
    try {
      await fn()
      aoMudar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const hoje = hojeCal()

  return (
    <div className="rounded-xl bg-card p-5 shadow-[var(--shadow-media)]">
      <h2 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
        <Flag className="w-4 h-4 text-amber-500" /> Marcos
      </h2>

      {erro && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{erro}</p>
      )}

      {marcos.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-3">
          Nenhum marco. São as datas que a reunião cobra: homologação, virada, entrega.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {marcos.map((m) => {
            const venceu = !m.atingido_em && dataCal(m.data) < hoje
            return (
              <li key={m.id} className="flex items-center gap-3 text-sm">
                <span
                  className={`w-2.5 h-2.5 rotate-45 border shrink-0 ${
                    m.atingido_em
                      ? 'bg-emerald-500 border-emerald-600'
                      : venceu ? 'bg-red-400 border-red-600' : 'bg-amber-400 border-amber-600'
                  }`}
                />
                <span className="flex-1 text-foreground">{m.nome}</span>
                <span className={venceu ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}>
                  {dataBR(m.data)}
                  {m.atingido_em && ` · atingido em ${dataBR(m.atingido_em)}`}
                  {venceu && ' · venceu'}
                </span>
                {podePlanejar && (
                  <>
                    <button
                      onClick={() => acao(() => projetosApi.marcos.editar(projeto.id, m.id, {
                        atingido: !m.atingido_em, updated_at: m.updated_at,
                      }))}
                      disabled={salvando}
                      title={m.atingido_em ? 'Desmarcar' : 'Marcar como atingido'}
                      className="text-muted-foreground hover:text-emerald-600 disabled:opacity-40"
                    >
                      {m.atingido_em ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm(`Remover o marco "${m.nome}"?`)) return
                        acao(() => projetosApi.marcos.remover(projeto.id, m.id))
                      }}
                      disabled={salvando}
                      className="text-muted-foreground hover:text-red-500 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {podePlanejar && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Homologação do cliente"
            className="h-9 flex-1 min-w-[12rem] rounded-lg border border-border bg-background px-3 text-sm"
          />
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button
            onClick={() => {
              if (!nome.trim()) return
              acao(async () => {
                await projetosApi.marcos.criar(projeto.id, { nome: nome.trim(), data })
                setNome('')
              })
            }}
            disabled={salvando || !nome.trim()}
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline disabled:opacity-40 dark:text-indigo-400"
          >
            <Plus className="w-4 h-4" /> Acrescentar marco
          </button>
        </div>
      )}
    </div>
  )
}
