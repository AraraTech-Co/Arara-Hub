'use client'

// =============================================================================
// Portfólio — todos os projetos na mesma régua de tempo.
//
// É a tela de reunião: responde "como está tudo" sem abrir projeto por projeto.
// A ordem vem do servidor e é a dos PIORES primeiro — quem abre esta tela quer
// ver o que está pegando fogo, não a ordem alfabética.
//
// A régua reusa a mesma matemática de dia do Gantt (`projetos-datas.ts`): uma
// segunda conta de data seria uma segunda chance de errar o dia por causa de
// fuso.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, GanttChartSquare, RefreshCw } from 'lucide-react'
import { projetosApi, type LinhaPortfolio } from '@/lib/api/projetos'
import {
  PROJETO_STATUS_LABELS, PROJETO_TIPO_LABELS, dataBR, type ProjetoStatus,
} from '@/lib/projetos'
import { PX_POR_DIA, diaDe, faixasDeMes, hojeDia, janela } from '@/lib/projetos-datas'
import { arara } from '@/lib/arara/client'
import { SaudeChip } from '@/components/projetos/saude-chip'

const ALTURA = 56
const PX_DIA = PX_POR_DIA.mes // o portfólio é sempre de longo alcance

export default function PortfolioPage() {
  const [linhas, setLinhas] = useState<LinhaPortfolio[]>([])
  const [empresas, setEmpresas] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tipo, setTipo] = useState('')
  const [status, setStatus] = useState('')
  const [companyId, setCompanyId] = useState('')
  const rolagem = useRef<HTMLDivElement>(null)

  const carregar = useCallback(() => {
    setCarregando(true)
    projetosApi
      .portfolio({ tipo: tipo || undefined, status: status || undefined, company_id: companyId || undefined })
      .then((r) => { setLinhas(r.data || []); setErro('') })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
  }, [tipo, status, companyId])

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
      .catch(() => {})
  }, [])

  const regua = useMemo(() => {
    const datas: unknown[] = []
    for (const l of linhas) { datas.push(l.inicio, l.fim); for (const m of l.marcos) datas.push(m.data) }
    const { inicio, fim } = janela(datas, 7)
    return {
      inicio, fim,
      totalDias: fim - inicio + 1,
      largura: (fim - inicio + 1) * PX_DIA,
      meses: faixasDeMes(inicio, fim),
      hoje: hojeDia(),
      x: (dia: number) => (dia - inicio) * PX_DIA,
    }
  }, [linhas])

  useEffect(() => {
    const el = rolagem.current
    if (!el) return
    el.scrollLeft = Math.max(0, regua.x(regua.hoje) - el.clientWidth / 3)
  }, [regua])

  const contagem = useMemo(() => ({
    critico: linhas.filter((l) => l.saude.estado === 'critico').length,
    atencao: linhas.filter((l) => l.saude.estado === 'atencao').length,
    ok: linhas.filter((l) => l.saude.estado === 'ok').length,
  }), [linhas])

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/projetos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="w-4 h-4" /> Projetos
          </Link>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GanttChartSquare className="w-6 h-6 text-indigo-500" />
            Portfólio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {linhas.length} projeto(s) ·{' '}
            <span className="text-red-600 dark:text-red-400">{contagem.critico} crítico(s)</span> ·{' '}
            <span className="text-amber-600 dark:text-amber-400">{contagem.atencao} em atenção</span> ·{' '}
            <span className="text-emerald-600 dark:text-emerald-400">{contagem.ok} no prazo</span>
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={carregando}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-sm text-foreground/70 hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Todos os tipos</option>
          <option value="interno">Interno</option>
          <option value="cliente">Cliente</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Todos os status</option>
          {Object.entries(PROJETO_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Todos os clientes</option>
          {Object.entries(empresas)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">{erro}</div>
      )}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum projeto para os filtros escolhidos.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <div className="flex">
            {/* Coluna fixa */}
            <div className="w-[17rem] sm:w-[24rem] shrink-0 border-r border-border">
              <div className="h-8 border-b border-border flex items-end px-3 pb-1">
                <span className="text-[11px] font-medium text-muted-foreground">Projeto</span>
              </div>
              {linhas.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-3 border-b border-border" style={{ height: ALTURA }}>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/projetos/ver?id=${encodeURIComponent(l.id)}`}
                      className="text-sm font-medium text-foreground hover:text-indigo-600 dark:hover:text-indigo-400 truncate block"
                    >
                      {l.nome}
                    </Link>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {l.codigo} · {PROJETO_TIPO_LABELS[l.tipo] || l.tipo}
                      {l.company_id && empresas[l.company_id] ? ` · ${empresas[l.company_id]}` : ''}
                      {' · '}{PROJETO_STATUS_LABELS[l.status as ProjetoStatus] || l.status}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{l.progresso}%</span>
                </div>
              ))}
            </div>

            {/* Régua */}
            <div ref={rolagem} className="flex-1 overflow-x-auto">
              <div className="relative" style={{ width: regua.largura }}>
                <div className="h-8 border-b border-border sticky top-0 bg-background">
                  {regua.meses.map((m) => (
                    <div
                      key={m.dia}
                      className="absolute top-0 h-8 flex items-center border-l border-border text-[11px] text-foreground/70 whitespace-nowrap"
                      style={{ left: regua.x(m.dia), width: m.dias * PX_DIA }}
                    >
                      <span className="sticky left-0 px-2 bg-background">{m.label}</span>
                    </div>
                  ))}
                </div>

                <div className="relative" style={{ height: linhas.length * ALTURA }}>
                  {regua.meses.map((m) => (
                    <div key={`v_${m.dia}`} className="absolute top-0 bottom-0 border-l border-border/40" style={{ left: regua.x(m.dia) }} />
                  ))}
                  {regua.hoje >= regua.inicio && regua.hoje <= regua.fim && (
                    <div className="absolute top-0 bottom-0 w-px bg-red-500/70 z-[1]" style={{ left: regua.x(regua.hoje) }} title="Hoje" />
                  )}

                  {linhas.map((l, i) => {
                    const a = diaDe(l.inicio)
                    const z = diaDe(l.fim)
                    return (
                      <div key={l.id} className="absolute left-0 right-0 border-b border-border" style={{ top: i * ALTURA, height: ALTURA }}>
                        {a !== null && z !== null ? (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-md border overflow-hidden ${
                              l.saude.estado === 'critico'
                                ? 'bg-red-500/20 border-red-500/60'
                                : l.saude.estado === 'atencao'
                                  ? 'bg-amber-500/20 border-amber-500/60'
                                  : 'bg-emerald-500/20 border-emerald-500/60'
                            }`}
                            style={{ left: regua.x(a), width: Math.max((z - a + 1) * PX_DIA, 6) }}
                            title={`${dataBR(l.inicio)} → ${dataBR(l.fim)} · ${l.progresso}%`}
                          >
                            <span
                              className={`absolute inset-y-0 left-0 ${
                                l.saude.estado === 'critico' ? 'bg-red-500/70'
                                  : l.saude.estado === 'atencao' ? 'bg-amber-500/70' : 'bg-emerald-500/70'
                              }`}
                              style={{ width: `${l.progresso}%` }}
                            />
                          </div>
                        ) : (
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                            sem datas
                          </span>
                        )}
                        {l.marcos.filter((m) => m.data).map((m) => {
                          const d = diaDe(m.data)
                          if (d === null) return null
                          return (
                            <span
                              key={m.id}
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                              style={{ left: regua.x(d) }}
                              title={`${m.nome} · ${dataBR(m.data)}${m.atingido_em ? ' · atingido' : ''}`}
                            >
                              <span className={`block w-2 h-2 rotate-45 border ${
                                m.atingido_em ? 'bg-emerald-500 border-emerald-600' : 'bg-amber-400 border-amber-600'
                              }`} />
                            </span>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Os motivos, por extenso, fora da régua — é o que se lê na reunião. */}
      {linhas.some((l) => l.saude.motivos.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {linhas.filter((l) => l.saude.motivos.length > 0).map((l) => (
            <div key={l.id} className="rounded-xl bg-card p-4 shadow-[var(--shadow-media)]">
              <Link
                href={`/admin/projetos/ver?id=${encodeURIComponent(l.id)}`}
                className="text-sm font-medium text-foreground hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                {l.codigo} · {l.nome}
              </Link>
              <div className="mt-2">
                <SaudeChip saude={l.saude} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
