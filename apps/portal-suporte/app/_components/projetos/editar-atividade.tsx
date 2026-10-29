'use client'

// =============================================================================
// Editar atividade — e manda só o que MUDOU.
//
// Por que só o que mudou, e não o objeto inteiro:
//   - o servidor registra no histórico o que o PATCH traz. Mandar tudo
//     encheria o histórico de campos que ninguém tocou;
//   - trocar o responsável é só de quem planeja. Um responsável salvando uma
//     descrição e mandando o objeto inteiro bateria nessa trava sem ter
//     trocado nada — foi o defeito que a revisão do 2b pegou;
//   - os quatro obrigatórios não podem ser esvaziados. Mandar um campo vazio
//     que já estava vazio levaria um 400 sem motivo.
//
// O diff é `soOqueMudou()`, função pura em `app/lib/projetos-atividades.ts`.
// O `updated_at` lido vai junto: é a concorrência otimista do módulo.
// =============================================================================

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { projetosApi } from '@/lib/api/projetos'
import {
  CAMPOS_OBRIGATORIOS, COLUNAS, ROTULOS, STATUS_LABELS, faltando, mensagemDeErro,
  soOqueMudou, type Atividade, type AtividadeStatus,
} from '@/lib/projetos-atividades'

export function EditarAtividade({
  projetoId, atividade, fases, pessoas, podePlanejar, onFechar, onSalvo,
}: {
  projetoId: string
  atividade: Atividade
  fases: { id: string; nome: string }[]
  pessoas: { id: string; nome: string }[]
  podePlanejar: boolean
  onFechar: () => void
  onSalvo: () => void
}) {
  const original = {
    titulo: String(atividade.titulo || ''),
    descricao: String(atividade.descricao || ''),
    responsavel_id: String(atividade.responsavel_id || ''),
    inicio_planejado: String(atividade.inicio_planejado || '').slice(0, 10),
    previsao_entrega: String(atividade.previsao_entrega || '').slice(0, 10),
    fase_id: String(atividade.fase_id || ''),
    status: String(atividade.status || ''),
  }
  const [r, setR] = useState(original)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')

  const falta = faltando(r)
  const mudou = soOqueMudou(original, r)
  const nada = Object.keys(mudou).length === 0
  const campo = (k: keyof typeof original) => (e: { target: { value: string } }) =>
    setR((v) => ({ ...v, [k]: e.target.value }))

  async function gravar() {
    if (falta.length || nada || gravando) return
    setGravando(true)
    setErro('')
    try {
      await projetosApi.atividades.editar(projetoId, atividade.id, {
        ...mudou,
        status: mudou.status as AtividadeStatus | undefined,
        updated_at: atividade.updated_at,
      })
      onSalvo()
    } catch (e) {
      // O rascunho continua na tela: fechar aqui apagaria o que a pessoa
      // escreveu por causa de uma falha que pode ser de rede.
      setErro(mensagemDeErro(e, 'gravar'))
    } finally {
      setGravando(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Editar atividade</p>
        <button onClick={onFechar} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <label htmlFor="ed-titulo" className="block text-xs text-muted-foreground">
          Título{CAMPOS_OBRIGATORIOS.includes('titulo') && <span aria-hidden="true"> *</span>}
        </label>
        <input id="ed-titulo" value={r.titulo} onChange={campo('titulo')}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
      </div>

      <div className="space-y-1">
        <label htmlFor="ed-desc" className="block text-xs text-muted-foreground">
          Descrição{CAMPOS_OBRIGATORIOS.includes('descricao') && <span aria-hidden="true"> *</span>}
        </label>
        <textarea id="ed-desc" value={r.descricao} onChange={campo('descricao')} rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
      </div>

      <div className="space-y-1">
        <label htmlFor="ed-status" className="block text-xs text-muted-foreground">Etapa</label>
        <select id="ed-status" value={r.status} onChange={campo('status')}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm">
          {COLUNAS.map((c) => <option key={c.status} value={c.status}>{c.titulo}</option>)}
          {/* Cancelar é o caminho: não existe apagar atividade. */}
          <option value="cancelada">{STATUS_LABELS.cancelada}</option>
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="ed-dono" className="block text-xs text-muted-foreground">
          Responsável{CAMPOS_OBRIGATORIOS.includes('responsavel_id') && <span aria-hidden="true"> *</span>}
        </label>
        {/* Trocar o responsável é só de quem planeja: para o resto o campo fica
            travado, em vez de oferecer uma troca que a rota recusa com 403. */}
        <select id="ed-dono" value={r.responsavel_id} onChange={campo('responsavel_id')}
          disabled={!podePlanejar}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60">
          <option value="">Escolha quem faz</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          {/* O responsável atual pode não estar na lista carregada; sem esta
              opção o seletor mostraria vazio e o diff acusaria uma troca. */}
          {!pessoas.some((p) => p.id === original.responsavel_id) && !!original.responsavel_id && (
            <option value={original.responsavel_id}>{original.responsavel_id}</option>
          )}
        </select>
        {!podePlanejar && (
          <p className="text-xs text-muted-foreground">Só quem planeja o projeto troca o responsável.</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="ed-ini" className="block text-xs text-muted-foreground">Início planejado</label>
          <input id="ed-ini" type="date" value={r.inicio_planejado} onChange={campo('inicio_planejado')}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="ed-fim" className="block text-xs text-muted-foreground">
            Previsão de entrega{CAMPOS_OBRIGATORIOS.includes('previsao_entrega') && <span aria-hidden="true"> *</span>}
          </label>
          <input id="ed-fim" type="date" value={r.previsao_entrega} onChange={campo('previsao_entrega')}
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
        </div>
      </div>

      {fases.length > 0 && (
        <div className="space-y-1">
          <label htmlFor="ed-fase" className="block text-xs text-muted-foreground">Fase (opcional)</label>
          <select id="ed-fase" value={r.fase_id} onChange={campo('fase_id')}
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={gravar}
          disabled={!!falta.length || nada || gravando}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {gravando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Salvar
        </button>
        <button onClick={onFechar} className="h-9 px-3 rounded-lg border border-border text-sm text-foreground/80 hover:bg-muted">
          Cancelar
        </button>
        {/* Dizer por que o botão está apagado: botão morto sem motivo é a tela
            escondendo a razão de não deixar salvar. */}
        {!!falta.length && (
          <span className="text-xs text-muted-foreground">
            Falta: {falta.map((c) => ROTULOS[c] || c).join(', ')}
          </span>
        )}
        {!falta.length && nada && (
          <span className="text-xs text-muted-foreground">Nada mudou ainda.</span>
        )}
        {!nada && (
          <span className="text-xs text-muted-foreground">
            Vai mandar: {Object.keys(mudou).map((c) => ROTULOS[c] || c).join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}
