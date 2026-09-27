'use client'

// =============================================================================
// Novo projeto — o diálogo de criação.
//
// As fases entram já aqui, porque projeto sem fase vira uma lista solta de
// cards e ninguém volta depois para organizar. Projeto de cliente pode partir
// de um MODELO de fases: sem isso, quem cria a quinta implantação digita as
// mesmas seis fases de novo.
// =============================================================================

import { useEffect, useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { projetosApi } from '@/lib/api/projetos'
import { arara } from '@/lib/arara/client'
import { hojeCal } from '@/lib/projetos'

const FASES_SUGERIDAS = ['Levantamento', 'Desenvolvimento', 'Testes', 'Homologação', 'Implantação']

export function NovoProjetoDialog({
  onFechar,
  onCriado,
}: {
  onFechar: () => void
  onCriado: () => void
}) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<'interno' | 'cliente'>('interno')
  const [companyId, setCompanyId] = useState('')
  const [inicio, setInicio] = useState(hojeCal())
  const [fim, setFim] = useState('')
  const [fases, setFases] = useState<string[]>([])
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    arara.companies()
      .then((r) => setEmpresas(
        ((r.data || []) as Record<string, unknown>[])
          .map((c) => ({ id: String(c.id), nome: String(c.name || c.nome || c.razao_social || 'Cliente') }))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
      ))
      .catch(() => {})
  }, [])

  async function salvar() {
    setErro('')
    if (!nome.trim()) { setErro('Informe o nome do projeto.'); return }
    if (tipo === 'cliente' && !companyId) { setErro('Projeto de cliente precisa do cliente.'); return }
    if (inicio && fim && fim < inicio) { setErro('O fim não pode ser anterior ao início.'); return }
    setSalvando(true)
    try {
      await projetosApi.criar({
        nome: nome.trim(),
        tipo,
        company_id: tipo === 'cliente' ? companyId : undefined,
        descricao: descricao.trim(),
        inicio_planejado: inicio,
        fim_planejado: fim,
        fases: fases.filter((f) => f.trim()).map((f, i) => ({ nome: f.trim(), ordem: i })),
      })
      onCriado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar o projeto.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold text-foreground">Novo projeto</h2>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Nome</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Implantação PDV — Rede Brandlar"
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'interno' | 'cliente')}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="interno">Interno</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>
            {tipo === 'cliente' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Cliente</label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">Selecione…</option>
                  {empresas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Início planejado</label>
              <input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Fim planejado</label>
              <input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Descrição</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Fases</label>
              {fases.length === 0 && (
                <button
                  onClick={() => setFases(FASES_SUGERIDAS)}
                  className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Usar as fases padrão
                </button>
              )}
            </div>
            <div className="space-y-2">
              {fases.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                  <input
                    value={f}
                    onChange={(e) => setFases(fases.map((x, j) => (j === i ? e.target.value : x)))}
                    className="flex-1 h-8 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                  <button
                    onClick={() => setFases(fases.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setFases([...fases, ''])}
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
                Acrescentar fase
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Dá para mudar depois. Fase é onde o trabalho fica no plano — não confundir
              com o status do card no quadro Dev, que é onde ele está na esteira.
            </p>
          </div>

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onFechar} className="px-4 py-2 text-sm text-foreground/70 hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {salvando ? 'Criando…' : 'Criar projeto'}
          </button>
        </div>
      </div>
    </div>
  )
}
