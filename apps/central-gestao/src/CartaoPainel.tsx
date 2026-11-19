import { useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  type Cartao,
  ErroApi,
  type Evento,
  instanteBr,
  dataBr,
  type Membro,
  novaChave,
  ORIGENS,
  STATUS,
} from './lib/api'

type Form = {
  titulo: string
  descricao: string
  status: string
  responsavel_id: string
  prazo: string
  origem_tipo: string
  origem_texto: string
  referencia_url: string
  decisao: string
}

const vazio: Form = {
  titulo: '',
  descricao: '',
  status: 'para_decidir',
  responsavel_id: '',
  prazo: '',
  origem_tipo: '',
  origem_texto: '',
  referencia_url: '',
  decisao: '',
}

function doCartao(c: Cartao): Form {
  return {
    titulo: c.titulo,
    descricao: c.descricao ?? '',
    status: c.status,
    responsavel_id: c.responsavel_id ?? '',
    prazo: c.prazo ?? '',
    origem_tipo: c.origem_tipo ?? '',
    origem_texto: c.origem_texto ?? '',
    referencia_url: c.referencia_url ?? '',
    decisao: c.decisao ?? '',
  }
}

const NOMES_CAMPO: Record<string, string> = {
  titulo: 'Título',
  descricao: 'Descrição',
  status: 'Status',
  responsavel_id: 'Responsável',
  prazo: 'Prazo',
  origem_tipo: 'Origem',
  origem_texto: 'Detalhe da origem',
  referencia_url: 'Referência',
  decisao: 'Decisão',
  concluido_em: 'Concluído em',
  arquivado: 'Arquivado',
}

const TIPOS: Record<string, string> = {
  criado: 'criou o cartão',
  edicao: 'editou',
  status: 'mudou o status',
  arquivado: 'arquivou',
  restaurado: 'restaurou',
}

type Props = {
  cartao: Cartao | null // null = novo
  membros: Membro[]
  nomeDe: (id: string | null) => string
  onFechar: () => void
  onSalvo: (c: Cartao, aviso?: string) => void
}

export function CartaoPainel({ cartao, membros, nomeDe, onFechar, onSalvo }: Props) {
  const [form, setForm] = useState<Form>(cartao ? doCartao(cartao) : vazio)
  const [base, setBase] = useState<Cartao | null>(cartao)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<{ msg: string; campo?: string } | null>(null)
  const [conflito, setConflito] = useState<Cartao | null>(null)
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const chave = useRef(novaChave()) // reenviada se a criação for repetida
  const titulo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titulo.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  useEffect(() => {
    if (!base) return
    let vivo = true
    api
      .eventos(base.id)
      .then((r) => vivo && setEventos(r.itens))
      .catch(() => vivo && setEventos([]))
    return () => {
      vivo = false
    }
  }, [base])

  const mudou = useMemo(() => {
    if (!base) return true
    const b = doCartao(base)
    return (Object.keys(b) as (keyof Form)[]).some((k) => b[k] !== form[k])
  }, [base, form])

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) {
      setErro({ msg: 'Título é obrigatório.', campo: 'titulo' })
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      if (!base) {
        const r = await api.criar({ ...form, chave_criacao: chave.current })
        onSalvo(r.cartao, r.historico_incompleto ? 'Cartão salvo, mas o histórico não foi registrado.' : undefined)
      } else {
        const b = doCartao(base)
        const dados: Record<string, unknown> = { versao: base.versao }
        for (const k of Object.keys(b) as (keyof Form)[]) if (b[k] !== form[k]) dados[k] = form[k]
        const r = await api.editar(base.id, dados)
        onSalvo(r.cartao, r.historico_incompleto ? 'Cartão salvo, mas o histórico não foi registrado.' : undefined)
      }
    } catch (err) {
      if (err instanceof ErroApi && err.status === 409 && err.corpo.atual) {
        setConflito(err.corpo.atual as Cartao)
      } else if (err instanceof ErroApi) {
        setErro({ msg: err.message, campo: typeof err.corpo.campo === 'string' ? err.corpo.campo : undefined })
      } else {
        setErro({ msg: 'Não foi possível salvar. Tente de novo.' })
      }
    } finally {
      setSalvando(false)
    }
  }

  function carregarAtual() {
    if (!conflito) return
    setBase(conflito)
    setForm(doCartao(conflito))
    setConflito(null)
  }

  async function alternarArquivo() {
    if (!base) return
    setSalvando(true)
    setErro(null)
    try {
      const r = base.arquivado ? await api.restaurar(base.id) : await api.arquivar(base.id)
      onSalvo(r.cartao)
    } catch (err) {
      setErro({ msg: err instanceof ErroApi ? err.message : 'Não foi possível concluir.' })
    } finally {
      setSalvando(false)
    }
  }

  const somenteLeitura = !!base?.arquivado
  const erroDe = (c: string) => (erro?.campo === c ? erro.msg : null)

  function valorLegivel(k: string, v: unknown): string {
    if (v === null || v === undefined || v === '') return '—'
    if (k === 'status') return STATUS.find((s) => s.id === v)?.nome ?? String(v)
    if (k === 'responsavel_id') return nomeDe(String(v))
    if (k === 'prazo') return dataBr(String(v))
    if (k === 'origem_tipo') return ORIGENS.find((o) => o.id === v)?.nome ?? String(v)
    if (k === 'concluido_em') return instanteBr(String(v))
    if (k === 'arquivado') return v ? 'sim' : 'não'
    const s = String(v)
    return s.length > 80 ? s.slice(0, 80) + '…' : s
  }

  return (
    <div className="veu" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <aside className="painel" role="dialog" aria-modal="true" aria-labelledby="painel-titulo">
        <header className="painel-topo">
          <h2 id="painel-titulo">{base ? 'Cartão' : 'Novo cartão'}</h2>
          <button type="button" className="botao fantasma" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </header>

        {conflito && (
          <div className="aviso aviso-erro" role="alert">
            <strong>Outra pessoa alterou este cartão.</strong> Sua edição não foi salva.
            <button type="button" className="botao" onClick={carregarAtual}>
              Carregar versão atual
            </button>
          </div>
        )}
        {somenteLeitura && (
          <div className="aviso" role="status">
            Cartão arquivado. Restaure para editar.
          </div>
        )}

        <form onSubmit={salvar} className="formulario" noValidate>
          <fieldset disabled={somenteLeitura || salvando}>
            <label>
              Título *
              <input ref={titulo} value={form.titulo} onChange={set('titulo')} maxLength={200} required
                aria-invalid={!!erroDe('titulo')} />
              {erroDe('titulo') && <span className="erro-campo">{erroDe('titulo')}</span>}
            </label>
            <div className="duas">
              <label>
                Status
                <select value={form.status} onChange={set('status')}>
                  {STATUS.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              </label>
              <label>
                Responsável
                <select value={form.responsavel_id} onChange={set('responsavel_id')} aria-invalid={!!erroDe('responsavel_id')}>
                  <option value="">Sem responsável</option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>{m.name || m.id}</option>
                  ))}
                  {form.responsavel_id && !membros.some((m) => m.id === form.responsavel_id) && (
                    <option value={form.responsavel_id}>{nomeDe(form.responsavel_id)}</option>
                  )}
                </select>
                {erroDe('responsavel_id') && <span className="erro-campo">{erroDe('responsavel_id')}</span>}
              </label>
            </div>
            <div className="duas">
              <label>
                Prazo
                <input type="date" value={form.prazo} onChange={set('prazo')} aria-invalid={!!erroDe('prazo')} />
                {erroDe('prazo') && <span className="erro-campo">{erroDe('prazo')}</span>}
              </label>
              <label>
                Origem
                <select value={form.origem_tipo} onChange={set('origem_tipo')}>
                  <option value="">—</option>
                  {ORIGENS.map((o) => (
                    <option key={o.id} value={o.id}>{o.nome}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Detalhe da origem
              <input value={form.origem_texto} onChange={set('origem_texto')} maxLength={200} placeholder="Ex.: reunião de 18/11" />
            </label>
            <label>
              Descrição
              <textarea value={form.descricao} onChange={set('descricao')} rows={4} maxLength={5000} />
              {erroDe('descricao') && <span className="erro-campo">{erroDe('descricao')}</span>}
            </label>
            <label>
              Referência (https://)
              <input type="url" inputMode="url" value={form.referencia_url} onChange={set('referencia_url')}
                placeholder="https://…" aria-invalid={!!erroDe('referencia_url')} />
              {erroDe('referencia_url') && <span className="erro-campo">{erroDe('referencia_url')}</span>}
              {base?.referencia_url && (
                <a className="link-ref" href={base.referencia_url} target="_blank" rel="noopener noreferrer">
                  Abrir referência ↗
                </a>
              )}
            </label>
            <label>
              Decisão tomada
              <textarea value={form.decisao} onChange={set('decisao')} rows={3} maxLength={5000}
                placeholder={form.status === 'concluido' ? 'Se houve decisão, registre aqui (opcional).' : ''} />
            </label>
          </fieldset>

          {erro && !erro.campo && <p className="aviso aviso-erro" role="alert">{erro.msg}</p>}

          <div className="acoes">
            {base && (
              <button type="button" className="botao fantasma" onClick={alternarArquivo} disabled={salvando}>
                {base.arquivado ? 'Restaurar' : 'Arquivar'}
              </button>
            )}
            {!somenteLeitura && (
              <button type="submit" className="botao primario" disabled={salvando || !mudou || !!conflito}>
                {salvando ? 'Salvando…' : base ? 'Salvar' : 'Criar cartão'}
              </button>
            )}
          </div>
        </form>

        {base && (
          <section className="historico" aria-label="Histórico">
            <h3>Histórico</h3>
            {eventos === null && <p className="mudo">Carregando…</p>}
            {eventos?.length === 0 && <p className="mudo">Sem registros.</p>}
            <ol>
              {eventos?.map((ev) => (
                <li key={ev.id}>
                  <div>
                    <strong>{nomeDe(ev.autor_id)}</strong> {TIPOS[ev.tipo] ?? ev.tipo}
                    <time className="mudo"> · {instanteBr(ev.em)}</time>
                  </div>
                  {ev.tipo !== 'criado' && ev.depois && (
                    <ul className="mudancas">
                      {Object.keys(ev.depois).map((k) => (
                        <li key={k}>
                          {NOMES_CAMPO[k] ?? k}: {valorLegivel(k, ev.antes?.[k])} → {valorLegivel(k, ev.depois?.[k])}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </aside>
    </div>
  )
}
