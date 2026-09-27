'use client'

// =============================================================================
// Projetos — a lista.
//
// Entrega 1 do plano (docs/plans/plano-modulo-projetos-e-gantt-portal-suporte.md):
// dado e vínculo. Sem Gantt ainda — e mesmo assim já responde "que trabalho os
// chamados geraram".
//
// A régua de permissão aqui só decide o que aparece na tela. Quem recusa de
// verdade é o servidor, em cada rota do módulo `projetos`.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Plus, TriangleAlert, Archive, GanttChartSquare } from 'lucide-react'
import { projetosApi, type Projeto } from '@/lib/api/projetos'
import {
  PROJETO_STATUS_CLASSES, PROJETO_STATUS_LABELS, PROJETO_TIPO_LABELS,
  dataBR, type ProjetoStatus,
} from '@/lib/projetos'
import { useMeuAcesso } from '@/hooks/use-meu-acesso'
import { arara } from '@/lib/arara/client'
import { NovoProjetoDialog } from '@/components/projetos/novo-projeto-dialog'

export default function ProjetosPage() {
  const acesso = useMeuAcesso()
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [empresas, setEmpresas] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [criando, setCriando] = useState(false)
  const [tipo, setTipo] = useState('')
  const [status, setStatus] = useState('')
  const [meus, setMeus] = useState(false)
  const [arquivados, setArquivados] = useState(false)

  const carregar = useCallback(() => {
    setCarregando(true)
    projetosApi
      .listar({ tipo: tipo || undefined, status: status || undefined, meus, arquivados })
      .then((r) => setProjetos(r.data || []))
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [tipo, status, meus, arquivados])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    arara.companies()
      .then((r) => {
        const mapa: Record<string, string> = {}
        for (const c of (r.data || []) as Record<string, unknown>[]) {
          mapa[String(c.id)] = String(c.name || c.nome || c.razao_social || '')
        }
        setEmpresas(mapa)
      })
      .catch(() => { /* nome do cliente é enfeite; a lista funciona sem ele */ })
  }, [])

  const totais = useMemo(() => ({
    projetos: projetos.length,
    atrasados: projetos.filter((p) => (p.cards_atrasados || 0) > 0).length,
    cards: projetos.reduce((s, p) => s + (p.total_cards || 0), 0),
  }), [projetos])

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-indigo-500" />
            Projetos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totais.projetos} projeto(s) · {totais.cards} card(s) do quadro Dev
            {totais.atrasados > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {' '}· {totais.atrasados} com atraso
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Link
          href="/admin/projetos/portfolio"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-sm text-foreground/70 hover:bg-muted"
        >
          <GanttChartSquare className="w-4 h-4" />
          Portfólio
        </Link>
        {acesso.podePlanejar && (
          <button
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo projeto
          </button>
        )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="">Todos os tipos</option>
          <option value="interno">Interno</option>
          <option value="cliente">Cliente</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="">Todos os status</option>
          {Object.entries(PROJETO_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
          <input type="checkbox" checked={meus} onChange={(e) => setMeus(e.target.checked)} />
          Só os meus
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
          <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} />
          <Archive className="w-3.5 h-3.5" />
          Arquivados
        </label>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : projetos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <FolderKanban className="w-8 h-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {arquivados ? 'Nenhum projeto arquivado.' : 'Nenhum projeto ainda.'}
          </p>
          {acesso.podePlanejar && !arquivados && (
            <button onClick={() => setCriando(true)} className="mt-3 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Criar o primeiro
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projetos.map((p) => (
            <Link
              key={p.id}
              href={`/admin/projetos/ver?id=${encodeURIComponent(p.id)}`}
              className="rounded-xl bg-card p-4 transition-shadow shadow-[var(--shadow-media)] hover:shadow-[var(--shadow-alta)]"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-mono text-xs text-muted-foreground">{p.codigo}</span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${PROJETO_STATUS_CLASSES[p.status as ProjetoStatus] || ''}`}>
                  {PROJETO_STATUS_LABELS[p.status as ProjetoStatus] || p.status}
                </span>
              </div>
              <h2 className="font-semibold text-foreground leading-snug mb-1">{p.nome}</h2>
              <p className="text-xs text-muted-foreground mb-3">
                {PROJETO_TIPO_LABELS[p.tipo] || p.tipo}
                {p.tipo === 'cliente' && p.company_id && ` · ${empresas[p.company_id] || 'cliente'}`}
              </p>

              <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${p.progresso || 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{p.progresso || 0}% · {p.total_cards || 0} card(s)</span>
                {(p.cards_atrasados || 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                    <TriangleAlert className="w-3 h-3" />
                    {p.cards_atrasados} atrasado(s)
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground/80">
                {dataBR(p.inicio_planejado)} → {dataBR(p.fim_planejado)}
              </p>
            </Link>
          ))}
        </div>
      )}

      {criando && (
        <NovoProjetoDialog
          onFechar={() => setCriando(false)}
          onCriado={() => { setCriando(false); carregar() }}
        />
      )}
    </div>
  )
}
