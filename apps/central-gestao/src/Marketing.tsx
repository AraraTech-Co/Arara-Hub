import { useCallback, useEffect, useRef, useState } from 'react'
import { api, dataBr, ErroApi, instanteBr, type Membro, novaChave, type RegistroMkt, STATUS_MKT } from './lib/api'

type Props = { membros: Membro[]; nomeDe: (id: string | null) => string; onSessaoPerdida: () => void }

export function Marketing({ membros, nomeDe, onSessaoPerdida }: Props) {
  const [status, setStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [q, setQ] = useState('')
  const [dados, setDados] = useState<{ itens: RegistroMkt[]; total: number; incompleto: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<RegistroMkt | 'novo' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setErro(null)
    api
      .marketing({ status, q })
      .then(setDados)
      .catch((e) => {
        if (e instanceof ErroApi && (e.status === 401 || e.status === 403)) return onSessaoPerdida()
        setErro(e instanceof Error ? e.message : 'Falha ao carregar.')
      })
  }, [status, q, onSessaoPerdida])

  useEffect(carregar, [carregar])
  useEffect(() => {
    const t = setTimeout(() => setQ(busca), 300)
    return () => clearTimeout(t)
  }, [busca])
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const filtroAtivo = !!(status || q.trim())

  return (
    <>
      <div className="cabeca">
        <div>
          <h1>Marketing</h1>
          <p className="mudo">Ações e atividades de marketing registradas na Central. Não há ligação com redes sociais, anúncios ou o CRM.</p>
        </div>
        <button type="button" className="botao primario" onClick={() => setAberto('novo')}>+ Novo registro</button>
      </div>

      <section className="filtros" aria-label="Filtros">
        <label>
          Buscar no título
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={200} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_MKT.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </label>
      </section>

      {filtroAtivo && dados && (
        <p className="aviso" role="status">
          Filtro ativo · {dados.total} {dados.total === 1 ? 'registro' : 'registros'}.{' '}
          <button type="button" className="link" onClick={() => { setStatus(''); setBusca('') }}>Limpar filtros</button>
        </p>
      )}
      {erro && <p className="aviso aviso-erro" role="alert">{erro} <button type="button" className="link" onClick={carregar}>Tentar de novo</button></p>}
      {aviso && <div className="toast" role="status">{aviso}</div>}
      {!dados && !erro && <p className="mudo">Carregando…</p>}

      {dados && (
        <div className="tabela-wrap">
          {dados.itens.length === 0 ? (
            <p className="mudo">{filtroAtivo ? 'Nenhum registro neste filtro.' : 'Nenhum registro ainda. A base começa vazia.'}</p>
          ) : (
            <ul className="lista-mkt">
              {dados.itens.map((r) => (
                <li key={r.id}>
                  <button type="button" className="mkt-item" onClick={() => setAberto(r)}>
                    <span className="mkt-titulo">{r.titulo}</span>
                    <span className="item-meta">
                      <span className={`selo selo-mkt-${r.status}`}>{STATUS_MKT.find((s) => s.id === r.status)?.nome}</span>
                      <span>{nomeDe(r.responsavel_id)}</span>
                      {r.data_referencia && <span>Ref. {dataBr(r.data_referencia)}</span>}
                      <span>Criado em {instanteBr(r.criado_em)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aberto && (
        <MktPainel
          registro={aberto === 'novo' ? null : aberto}
          membros={membros}
          onFechar={() => setAberto(null)}
          onSalvo={() => { setAberto(null); setAviso('Registro salvo.'); carregar() }}
        />
      )}
    </>
  )
}

type Form = { titulo: string; descricao: string; status: string; responsavel_id: string; data_referencia: string }
const doReg = (r: RegistroMkt): Form => ({
  titulo: r.titulo,
  descricao: r.descricao ?? '',
  status: r.status,
  responsavel_id: r.responsavel_id ?? '',
  data_referencia: r.data_referencia ?? '',
})

function MktPainel({ registro, membros, onFechar, onSalvo }: { registro: RegistroMkt | null; membros: Membro[]; onFechar: () => void; onSalvo: () => void }) {
  const [base, setBase] = useState(registro)
  const [form, setForm] = useState<Form>(registro ? doReg(registro) : { titulo: '', descricao: '', status: 'planejado', responsavel_id: '', data_referencia: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<{ msg: string; campo?: string } | null>(null)
  const [conflito, setConflito] = useState<RegistroMkt | null>(null)
  const chave = useRef(novaChave())
  const titulo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titulo.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const mudou = !base || (Object.keys(form) as (keyof Form)[]).some((k) => doReg(base)[k] !== form[k])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) return setErro({ msg: 'Título é obrigatório.', campo: 'titulo' })
    setSalvando(true)
    setErro(null)
    try {
      if (!base) await api.criarMkt({ ...form, chave_criacao: chave.current })
      else {
        const b = doReg(base)
        const dados: Record<string, unknown> = { versao: base.versao }
        for (const k of Object.keys(b) as (keyof Form)[]) if (b[k] !== form[k]) dados[k] = form[k]
        await api.editarMkt(base.id, dados)
      }
      onSalvo()
    } catch (err) {
      if (err instanceof ErroApi && err.status === 409 && err.corpo.atual) setConflito(err.corpo.atual as RegistroMkt)
      else if (err instanceof ErroApi) {
        if (err.codigo === 'chave_em_uso') chave.current = novaChave()
        setErro({ msg: err.message, campo: typeof err.corpo.campo === 'string' ? err.corpo.campo : undefined })
      } else setErro({ msg: 'Não foi possível salvar. Tente de novo.' })
    } finally {
      setSalvando(false)
    }
  }

  const erroDe = (c: string) => (erro?.campo === c ? erro.msg : null)

  return (
    <div className="veu" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <aside className="painel" role="dialog" aria-modal="true" aria-labelledby="mkt-titulo">
        <header className="painel-topo">
          <h2 id="mkt-titulo">{base ? 'Registro de marketing' : 'Novo registro de marketing'}</h2>
          <button type="button" className="botao fantasma" onClick={onFechar} aria-label="Fechar">✕</button>
        </header>
        {conflito && (
          <div className="aviso aviso-erro" role="alert">
            <strong>Outra pessoa alterou este registro.</strong> Sua edição não foi salva.
            <button type="button" className="botao" onClick={() => { setBase(conflito); setForm(doReg(conflito)); setConflito(null) }}>Carregar versão atual</button>
          </div>
        )}
        <form onSubmit={salvar} className="formulario" noValidate>
          <fieldset disabled={salvando}>
            <label>
              Título *
              <input ref={titulo} value={form.titulo} onChange={set('titulo')} maxLength={200} aria-invalid={!!erroDe('titulo')} />
              {erroDe('titulo') && <span className="erro-campo">{erroDe('titulo')}</span>}
            </label>
            <div className="duas">
              <label>
                Status
                <select value={form.status} onChange={set('status')}>
                  {STATUS_MKT.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </label>
              <label>
                Responsável
                <select value={form.responsavel_id} onChange={set('responsavel_id')} aria-invalid={!!erroDe('responsavel_id')}>
                  <option value="">Sem responsável</option>
                  {membros.map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
                </select>
                {erroDe('responsavel_id') && <span className="erro-campo">{erroDe('responsavel_id')}</span>}
              </label>
            </div>
            <label>
              Data de referência
              <input type="date" value={form.data_referencia} onChange={set('data_referencia')} aria-invalid={!!erroDe('data_referencia')} />
              {erroDe('data_referencia') && <span className="erro-campo">{erroDe('data_referencia')}</span>}
            </label>
            <label>
              Descrição
              <textarea value={form.descricao} onChange={set('descricao')} rows={4} maxLength={5000} placeholder="Sem dados pessoais de leads." />
              {erroDe('descricao') && <span className="erro-campo">{erroDe('descricao')}</span>}
            </label>
          </fieldset>
          {erro && !erro.campo && <p className="aviso aviso-erro" role="alert">{erro.msg}</p>}
          <div className="acoes">
            <button type="submit" className="botao primario" disabled={salvando || !mudou || !!conflito}>
              {salvando ? 'Salvando…' : base ? 'Salvar' : 'Criar registro'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
