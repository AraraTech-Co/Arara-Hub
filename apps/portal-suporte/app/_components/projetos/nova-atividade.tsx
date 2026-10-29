'use client'

// =============================================================================
// Nova atividade — o formulário, dentro do projeto.
//
// Fica num arquivo próprio porque o quadro já tem o que fazer: ele arruma
// colunas e move cartões, e misturar o cadastro ali faria o arquivo crescer
// até ninguém mais achar nada.
//
// O que é obrigatório NÃO se decide aqui: vem de `CAMPOS_OBRIGATORIOS`
// (app/lib/projetos-atividades.ts), que é o lugar único dessa decisão — ela
// ainda está com o Leonardo. O botão só desabilita com base em `faltando()`,
// e o servidor continua tendo a palavra final.
// =============================================================================

import { useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { projetosApi } from '@/lib/api/projetos'
import {
  CAMPOS_OBRIGATORIOS, RASCUNHO_VAZIO, ROTULOS, faltando, mensagemDeErro, type Rascunho,
} from '@/lib/projetos-atividades'

export function NovaAtividade({
  projetoId,
  fases,
  pessoas,
  aoCriar,
}: {
  projetoId: string
  fases: { id: string; nome: string }[]
  pessoas: { id: string; nome: string }[]
  aoCriar: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [r, setR] = useState<Rascunho>(RASCUNHO_VAZIO)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')

  const falta = faltando(r)
  const campo = (k: keyof Rascunho) => (e: { target: { value: string } }) =>
    setR((v) => ({ ...v, [k]: e.target.value }))

  function fechar() {
    setAberto(false)
    setR(RASCUNHO_VAZIO)
    setErro('')
  }

  async function gravar() {
    if (falta.length || gravando) return
    setGravando(true)
    setErro('')
    try {
      await projetosApi.atividades.criar(projetoId, {
        titulo: r.titulo.trim(),
        descricao: r.descricao.trim(),
        fase_id: r.fase_id,
        responsavel_id: r.responsavel_id,
        inicio_planejado: r.inicio_planejado,
        previsao_entrega: r.previsao_entrega,
      })
      fechar()
      aoCriar()
    } catch (e) {
      // O erro fica NA TELA e o rascunho continua: fechar aqui apagaria o que
      // a pessoa escreveu por causa de uma falha que pode ser de rede.
      setErro(mensagemDeErro(e, 'gravar'))
    } finally {
      setGravando(false)
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
      >
        <Plus className="w-3.5 h-3.5" /> Nova atividade
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Nova atividade</p>
        <button onClick={fechar} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <label htmlFor="ativ-titulo" className="block text-xs text-muted-foreground">
          Título{CAMPOS_OBRIGATORIOS.includes('titulo') && <span aria-hidden="true"> *</span>}
        </label>
        <input
          id="ativ-titulo"
          value={r.titulo}
          onChange={campo('titulo')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !falta.length) gravar() }}
          required={CAMPOS_OBRIGATORIOS.includes('titulo')}
          autoFocus
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
          placeholder="O que precisa ser feito"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="ativ-desc" className="block text-xs text-muted-foreground">
          Descrição{CAMPOS_OBRIGATORIOS.includes('descricao') && <span aria-hidden="true"> *</span>}
        </label>
        <textarea
          id="ativ-desc"
          value={r.descricao}
          onChange={campo('descricao')}
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Em celular as duas datas empilham: lado a lado, cada campo de data
          fica estreito demais para o seletor nativo. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="ativ-ini" className="block text-xs text-muted-foreground">Início planejado</label>
          <input id="ativ-ini" type="date" value={r.inicio_planejado} onChange={campo('inicio_planejado')}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="ativ-fim" className="block text-xs text-muted-foreground">
            Previsão de entrega{CAMPOS_OBRIGATORIOS.includes('previsao_entrega') && <span aria-hidden="true"> *</span>}
          </label>
          <input id="ativ-fim" type="date" value={r.previsao_entrega} onChange={campo('previsao_entrega')}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
        </div>
      </div>

      {/* Responsável é obrigatório (D5). Sem a lista de pessoas carregada, o
          campo aceita o id digitado em vez de travar a criação. */}
      <div className="space-y-1">
        <label htmlFor="ativ-dono" className="block text-xs text-muted-foreground">
          Responsável{CAMPOS_OBRIGATORIOS.includes('responsavel_id') && <span aria-hidden="true"> *</span>}
        </label>
        {pessoas.length > 0 ? (
          <select id="ativ-dono" value={r.responsavel_id} onChange={campo('responsavel_id')}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Escolha quem faz</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        ) : (
          <input id="ativ-dono" value={r.responsavel_id} onChange={campo('responsavel_id')}
            placeholder="id da pessoa"
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
        )}
      </div>

      {fases.length > 0 && (
        <div className="space-y-1">
          <label htmlFor="ativ-fase" className="block text-xs text-muted-foreground">Fase (opcional)</label>
          <select id="ativ-fase" value={r.fase_id} onChange={campo('fase_id')}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="">Sem fase</option>
            {fases.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {erro}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={gravar}
          disabled={!!falta.length || gravando}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {gravando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Criar atividade
        </button>
        <button onClick={fechar} className="h-9 px-3 rounded-lg border border-border text-sm text-foreground/80 hover:bg-muted">
          Cancelar
        </button>
        {/* Dizer O QUE falta, e não só desabilitar: botão apagado sem motivo é
            a tela escondendo a razão de não deixar gravar. */}
        {!!falta.length && (
          <span className="text-xs text-muted-foreground">
            Falta: {falta.map((c) => ROTULOS[c] || c).join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}
