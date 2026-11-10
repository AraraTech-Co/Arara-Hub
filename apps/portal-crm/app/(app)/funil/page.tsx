'use client'

import { useEffect, useState } from 'react'
import { arara } from '@/lib/arara'
import { ETAPAS, MOTIVOS_PERDA } from '@/lib/funil'

type Resumo = {
  total: number
  porEtapa: Record<string, number>
  porMotivo: Record<string, number>
  perdidoSemMotivo: number
}

function Barra({ rotulo, valor, maximo }: { rotulo: string; valor: number; maximo: number }) {
  const pct = maximo > 0 ? Math.round((valor / maximo) * 100) : 0
  return (
    <li className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
      <span className="text-gray-700">{rotulo}</span>
      <span className="h-2 rounded-full bg-gray-100" aria-hidden>
        <span className="block h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right tabular-nums text-gray-900">{valor}</span>
    </li>
  )
}

export default function FunilPage() {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelled = false
    arara
      .funilResumo()
      .then((r) => {
        if (!cancelled) setResumo(r)
      })
      .catch((e) => {
        if (!cancelled) setErro(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (erro) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Não foi possível carregar o funil: {erro}
      </div>
    )
  }
  if (!resumo) return <p className="text-sm text-gray-500">Carregando…</p>

  const maxEtapa = Math.max(0, ...ETAPAS.map((e) => resumo.porEtapa[e.value] ?? 0))
  const maxMotivo = Math.max(0, ...MOTIVOS_PERDA.map((m) => resumo.porMotivo[m.value] ?? 0))

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Funil</h1>
        <p className="text-sm text-gray-500 mt-1">{resumo.total} prospects (matrizes e cadastros avulsos).</p>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-medium text-gray-900 mb-4">Por etapa</h2>
        <ul className="space-y-2">
          {ETAPAS.map((e) => (
            <Barra key={e.value} rotulo={e.label} valor={resumo.porEtapa[e.value] ?? 0} maximo={maxEtapa} />
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-medium text-gray-900 mb-4">Perdidos por motivo</h2>
        <ul className="space-y-2">
          {MOTIVOS_PERDA.map((m) => (
            <Barra key={m.value} rotulo={m.label} valor={resumo.porMotivo[m.value] ?? 0} maximo={maxMotivo} />
          ))}
        </ul>
        {resumo.perdidoSemMotivo > 0 ? (
          <p className="mt-3 text-xs text-gray-500">{resumo.perdidoSemMotivo} perdidos sem motivo registrado.</p>
        ) : null}
      </section>
    </div>
  )
}
