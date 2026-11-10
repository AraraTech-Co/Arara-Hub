'use client'

import { useState } from 'react'
import Link from 'next/link'
import { arara } from '@/lib/arara'
import { ETAPAS, MOTIVOS_PERDA, TOQUES, etapaDe, rotuloEtapa } from '@/lib/funil'

type Registro = Record<string, unknown>

type Props = {
  /** O registro que carrega a etapa: a matriz (ou o cadastro avulso). */
  matriz: Registro
  /** Verdadeiro quando a tela é de uma filial: mostra a etapa da matriz, sem mexer. */
  daFilial?: boolean
  podeMover: boolean
  aoMover?: (atualizado: Registro, negociacao: Registro | null) => void
}

const campo =
  'h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

export function FunilCard({ matriz, daFilial = false, podeMover, aoMover }: Props) {
  const [atual, setAtual] = useState<Registro>(matriz)
  const [etapa, setEtapa] = useState(etapaDe(matriz))
  const [toque, setToque] = useState(typeof matriz.toque === 'string' ? matriz.toque : '')
  const [motivo, setMotivo] = useState(typeof matriz.motivoPerda === 'string' ? matriz.motivoPerda : '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const semDono = !atual.ownerId
  const faltaToque = etapa === 'em_cadencia' && !toque
  const faltaMotivo = etapa === 'perdido' && !motivo

  async function mover() {
    setSalvando(true)
    setErro('')
    setAviso('')
    try {
      const r = await arara.moverEtapa(String(atual.id), {
        etapa,
        ...(etapa === 'em_cadencia' ? { toque } : {}),
        ...(etapa === 'perdido' ? { motivoPerda: motivo } : {}),
      })
      const novo = { ...atual, ...r.data }
      setAtual(novo)
      if (r.negociacao) setAviso('Negociação aberta no pipeline, no estágio Proposta.')
      aoMover?.(novo, r.negociacao)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível mover a etapa.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-gray-900">Funil</h2>
        <span data-testid="etapa-atual" className="text-xs px-2.5 py-1 rounded-full font-medium bg-indigo-50 text-indigo-700">
          {rotuloEtapa(atual)}
        </span>
      </div>

      {daFilial ? (
        <p className="text-sm text-gray-500">
          Etapa da matriz{' '}
          <Link href={`/clientes/view?id=${encodeURIComponent(String(atual.id))}`} className="text-indigo-600 hover:text-indigo-800">
            {String(atual.name ?? '')}
          </Link>
          .
        </p>
      ) : semDono ? (
        <p className="text-sm text-gray-500">Lead no pool: fica em Mapeado até alguém pegar.</p>
      ) : !podeMover ? (
        <p className="text-sm text-gray-500">Só o dono do lead ou o gestor move a etapa.</p>
      ) : (
        <div className="space-y-3">
          {erro && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </div>
          )}
          {aviso && (
            <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {aviso}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-gray-700">
              <span className="block mb-1">Etapa</span>
              <select aria-label="Etapa" value={etapa} onChange={(e) => setEtapa(e.target.value)} className={campo}>
                {ETAPAS.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </label>
            {etapa === 'em_cadencia' && (
              <label className="text-sm text-gray-700">
                <span className="block mb-1">Toque</span>
                <select aria-label="Toque" value={toque} onChange={(e) => setToque(e.target.value)} className={campo}>
                  <option value="">—</option>
                  {TOQUES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            {etapa === 'perdido' && (
              <label className="text-sm text-gray-700">
                <span className="block mb-1">Motivo da perda</span>
                <select aria-label="Motivo da perda" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo}>
                  <option value="">—</option>
                  {MOTIVOS_PERDA.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={mover}
              disabled={salvando || faltaToque || faltaMotivo}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 h-10 rounded-lg"
            >
              {salvando ? 'Salvando…' : 'Mover'}
            </button>
          </div>
          {etapa === 'proposta' && etapaDe(atual) !== 'proposta' && (
            <p className="text-xs text-gray-500">Ao entrar em Proposta, abre uma negociação no pipeline.</p>
          )}
        </div>
      )}
    </div>
  )
}
