import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Cartao, dataBr, ErroApi, type Eu, type Filtros, HUB_URL, type Membro, sair, STATUS, type Status, token } from './lib/api'
import { CartaoPainel } from './CartaoPainel'
import { Resumo } from './Resumo'
import { Marketing } from './Marketing'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'sem_sessao' }
  | { tipo: 'sem_acesso' }
  | { tipo: 'indisponivel'; msg: string }
  | { tipo: 'ok'; eu: Eu }

export default function App() {
  const [estado, setEstado] = useState<Estado>(token() ? { tipo: 'carregando' } : { tipo: 'sem_sessao' })

  const entrar = useCallback(() => {
    if (!token()) return setEstado({ tipo: 'sem_sessao' })
    setEstado({ tipo: 'carregando' })
    api
      .eu()
      .then((eu) => setEstado({ tipo: 'ok', eu }))
      .catch((e) => {
        if (e instanceof ErroApi && e.status === 401) {
          sair()
          setEstado({ tipo: 'sem_sessao' })
        } else if (e instanceof ErroApi && e.status === 403) setEstado({ tipo: 'sem_acesso' })
        else setEstado({ tipo: 'indisponivel', msg: e instanceof Error ? e.message : 'Falha ao carregar.' })
      })
  }, [])

  useEffect(() => {
    if (token()) entrar()
  }, [entrar])

  if (estado.tipo === 'ok') return <Principal eu={estado.eu} onSessaoPerdida={() => { sair(); setEstado({ tipo: 'sem_sessao' }) }} />

  return (
    <div className="casca">
      <Topo />
      <main className="centro">
        {estado.tipo === 'carregando' && <p className="mudo">Carregando…</p>}
        {estado.tipo === 'sem_sessao' && (
          <div className="cartao-msg">
            <h1>Entre pelo Hub</h1>
            <p>A Central de Gestão usa o mesmo acesso do Hub da Arara Tech.</p>
            <a className="botao primario" href={HUB_URL}>Ir para o Hub</a>
          </div>
        )}
        {estado.tipo === 'sem_acesso' && (
          <div className="cartao-msg">
            <h1>Sem acesso</h1>
            <p>Sua conta ainda não tem acesso à Central de Gestão. Peça a liberação ao administrador da Central.</p>
            <a className="botao" href={HUB_URL}>Voltar ao Hub</a>
          </div>
        )}
        {estado.tipo === 'indisponivel' && (
          <div className="cartao-msg">
            <h1>Não foi possível abrir</h1>
            <p>{estado.msg}</p>
            <button type="button" className="botao primario" onClick={entrar}>Tentar de novo</button>
          </div>
        )}
      </main>
    </div>
  )
}

type Aba = 'resumo' | 'kanban' | 'marketing'

function Topo({ eu, aba, onAba }: { eu?: Eu; aba?: Aba; onAba?: (a: Aba) => void }) {
  return (
    <header className="topo">
      <div className="marca">
        <span className="marca-ponto" aria-hidden="true" />
        Central de Gestão
      </div>
      {aba && onAba && (
        <nav className="abas" aria-label="Seções">
          <button type="button" className={aba === 'resumo' ? 'ativa' : ''} aria-current={aba === 'resumo' ? 'page' : undefined} onClick={() => onAba('resumo')}>Resumo</button>
          <button type="button" className={aba === 'kanban' ? 'ativa' : ''} aria-current={aba === 'kanban' ? 'page' : undefined} onClick={() => onAba('kanban')}>Kanban</button>
          <button type="button" className={aba === 'marketing' ? 'ativa' : ''} aria-current={aba === 'marketing' ? 'page' : undefined} onClick={() => onAba('marketing')}>Marketing</button>
        </nav>
      )}
      <nav className="topo-dir">
        {eu && <span className="mudo">{eu.name}</span>}
        <a href={HUB_URL}>← Hub</a>
      </nav>
    </header>
  )
}

const FILTRO_VAZIO: Filtros = { status: '', responsavel: '', vencidos: false, q: '', arquivados: false }

function Principal({ eu, onSessaoPerdida }: { eu: Eu; onSessaoPerdida: () => void }) {
  const [aba, setAba] = useState<Aba>('resumo')
  const [filtroInicial, setFiltroInicial] = useState<Filtros>(FILTRO_VAZIO)
  const [versao, setVersao] = useState(0) // remonta o quadro ao vir do resumo com outro filtro
  const [membros, setMembros] = useState<Membro[]>([])
  useEffect(() => {
    api.membros().then(setMembros).catch(() => setMembros([]))
  }, [])
  const nomes = useMemo(() => new Map(membros.map((m) => [m.id, m.name])), [membros])
  const nomeDe = useCallback(
    (id: string | null) => (!id ? 'Sem responsável' : nomes.get(id) || (id === eu.id ? eu.name : 'Pessoa sem acesso ativo')),
    [nomes, eu],
  )
  return (
    <div className="casca">
      <Topo eu={eu} aba={aba} onAba={(a) => { if (a === 'kanban') setFiltroInicial(FILTRO_VAZIO); setVersao((v) => v + 1); setAba(a) }} />
      <main>
        {aba === 'resumo' ? (
          <Resumo
            onSessaoPerdida={onSessaoPerdida}
            onAbrirKanban={(f) => { setFiltroInicial({ ...FILTRO_VAZIO, ...f }); setVersao((v) => v + 1); setAba('kanban') }}
            onAbrirMarketing={() => setAba('marketing')}
          />
        ) : aba === 'marketing' ? (
          <Marketing membros={membros} nomeDe={nomeDe} onSessaoPerdida={onSessaoPerdida} />
        ) : (
          <Quadro key={versao} eu={eu} filtroInicial={filtroInicial} onSessaoPerdida={onSessaoPerdida} />
        )}
      </main>
    </div>
  )
}

function Quadro({ eu, filtroInicial, onSessaoPerdida }: { eu: Eu; filtroInicial: Filtros; onSessaoPerdida: () => void }) {
  const [membros, setMembros] = useState<Membro[]>([])
  const [filtros, setFiltros] = useState<Filtros>(filtroInicial)
  const [busca, setBusca] = useState('')
  const [dados, setDados] = useState<{ itens: Cartao[]; total: number; incompleto: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aberto, setAberto] = useState<Cartao | 'novo' | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<Status | null>(null)

  const tratar = useCallback(
    (e: unknown) => {
      if (e instanceof ErroApi && (e.status === 401 || e.status === 403)) return onSessaoPerdida()
      setErro(e instanceof Error ? e.message : 'Falha ao carregar.')
    },
    [onSessaoPerdida],
  )

  const carregar = useCallback(() => {
    setErro(null)
    api.cartoes(filtros).then(setDados).catch(tratar)
  }, [filtros, tratar])

  useEffect(() => {
    api.membros().then(setMembros).catch(() => setMembros([]))
  }, [])
  useEffect(carregar, [carregar])
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.q === busca ? f : { ...f, q: busca })), 300)
    return () => clearTimeout(t)
  }, [busca])
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  const nomes = useMemo(() => new Map(membros.map((m) => [m.id, m.name])), [membros])
  const nomeDe = useCallback(
    (id: string | null) => (!id ? 'Sem responsável' : nomes.get(id) || (id === eu.id ? eu.name : 'Pessoa sem acesso ativo')),
    [nomes, eu],
  )

  const filtroAtivo = !!(filtros.status || filtros.responsavel || filtros.vencidos || filtros.q?.trim())

  async function mover(c: Cartao, status: Status) {
    if (c.status === status) return
    setDados((d) => d && { ...d, itens: d.itens.map((x) => (x.id === c.id ? { ...x, status } : x)) })
    try {
      const r = await api.editar(c.id, { versao: c.versao, status })
      setDados((d) => d && { ...d, itens: d.itens.map((x) => (x.id === c.id ? r.cartao : x)) })
      setAviso(`“${c.titulo}” movido para ${STATUS.find((s) => s.id === status)?.nome}.`)
    } catch (e) {
      if (e instanceof ErroApi && e.status === 409) setAviso('Outra pessoa alterou este cartão. O quadro foi recarregado.')
      else tratar(e)
      carregar()
    }
  }

  function salvo(c: Cartao, msg?: string) {
    setAberto(null)
    setAviso(msg ?? 'Cartão salvo.')
    carregar()
    void c
  }

  const colunas = filtros.arquivados ? null : STATUS

  return (
    <>
        <div className="cabeca">
          <div>
            <h1>Kanban da gestão</h1>
            <p className="mudo">Decisões e atividades da gestão. Não altera tickets, negócios nem outros sistemas.</p>
          </div>
          <button type="button" className="botao primario" onClick={() => setAberto('novo')}>
            + Novo cartão
          </button>
        </div>

        <section className="filtros" aria-label="Filtros">
          <label>
            Buscar no título
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={200} />
          </label>
          <label>
            Responsável
            <select value={filtros.responsavel} onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })}>
              <option value="">Todos</option>
              <option value="nenhum">Sem responsável</option>
              {membros.map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
              <option value="">Todos</option>
              {STATUS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={!!filtros.vencidos} onChange={(e) => setFiltros({ ...filtros, vencidos: e.target.checked })} />
            Só vencidos
          </label>
          <label className="check">
            <input type="checkbox" checked={!!filtros.arquivados} onChange={(e) => setFiltros({ ...filtros, arquivados: e.target.checked })} />
            Ver arquivados
          </label>
        </section>

        {(filtroAtivo || filtros.arquivados) && dados && (
          <p className="aviso" role="status">
            {filtros.arquivados ? 'Mostrando cartões arquivados' : 'Filtro ativo'} · {dados.total}{' '}
            {dados.total === 1 ? 'cartão' : 'cartões'}. Os demais continuam no quadro.{' '}
            <button type="button" className="link" onClick={() => { setBusca(''); setFiltros(FILTRO_VAZIO) }}>
              Limpar filtros
            </button>
          </p>
        )}
        {dados?.incompleto && <p className="aviso aviso-erro">A lista pode estar incompleta: há mais cartões do que o limite de leitura.</p>}
        {erro && (
          <p className="aviso aviso-erro" role="alert">
            {erro} <button type="button" className="link" onClick={carregar}>Tentar de novo</button>
          </p>
        )}
        <div aria-live="polite" className="sr">{aviso}</div>
        {aviso && <div className="toast" role="status">{aviso}</div>}

        {!dados && !erro && <p className="mudo">Carregando cartões…</p>}

        {dados && colunas && (
          <div className="quadro">
            {colunas.map((col) => {
              const itens = dados.itens.filter((c) => c.status === col.id)
              return (
                <section
                  key={col.id}
                  className={`coluna${alvo === col.id ? ' alvo' : ''}`}
                  aria-label={col.nome}
                  onDragOver={(e) => { if (arrastando) { e.preventDefault(); setAlvo(col.id) } }}
                  onDragLeave={() => setAlvo((a) => (a === col.id ? null : a))}
                  onDrop={(e) => {
                    e.preventDefault()
                    const c = dados.itens.find((x) => x.id === arrastando)
                    setArrastando(null)
                    setAlvo(null)
                    if (c) void mover(c, col.id)
                  }}
                >
                  <h2>{col.nome} <span className="contagem">{itens.length}</span></h2>
                  {itens.length === 0 && <p className="mudo vazio">Nenhum cartão</p>}
                  {itens.map((c) => (
                    <CartaoItem key={c.id} c={c} nomeDe={nomeDe} onAbrir={() => setAberto(c)} onMover={(s) => mover(c, s)}
                      onArrastar={(on) => setArrastando(on ? c.id : null)} />
                  ))}
                </section>
              )
            })}
          </div>
        )}

        {dados && !colunas && (
          <div className="lista-arquivados">
            {dados.itens.length === 0 && <p className="mudo">Nenhum cartão arquivado.</p>}
            {dados.itens.map((c) => (
              <CartaoItem key={c.id} c={c} nomeDe={nomeDe} onAbrir={() => setAberto(c)} />
            ))}
          </div>
        )}
      {aberto && (
        <CartaoPainel
          cartao={aberto === 'novo' ? null : aberto}
          membros={membros}
          nomeDe={nomeDe}
          onFechar={() => setAberto(null)}
          onSalvo={salvo}
        />
      )}
    </>
  )
}

function CartaoItem({
  c,
  nomeDe,
  onAbrir,
  onMover,
  onArrastar,
}: {
  c: Cartao
  nomeDe: (id: string | null) => string
  onAbrir: () => void
  onMover?: (s: Status) => void
  onArrastar?: (on: boolean) => void
}) {
  return (
    <article
      className={`item${c.vencido ? ' vencido' : ''}`}
      draggable={!!onArrastar}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onArrastar?.(true) }}
      onDragEnd={() => onArrastar?.(false)}
    >
      <button type="button" className="item-titulo" onClick={onAbrir}>{c.titulo}</button>
      <div className="item-meta">
        <span>{nomeDe(c.responsavel_id)}</span>
        {c.prazo && <span>Prazo {dataBr(c.prazo)}</span>}
        {c.vencido && <span className="selo-vencido">⚠ Vencido</span>}
      </div>
      {onMover && (
        <label className="mover">
          <span className="sr">Mover “{c.titulo}” para</span>
          <select value={c.status} onChange={(e) => onMover(e.target.value as Status)} aria-label={`Mover ${c.titulo} para`}>
            {STATUS.map((s) => <option key={s.id} value={s.id}>{s.id === c.status ? `Em: ${s.nome}` : `Mover para ${s.nome}`}</option>)}
          </select>
        </label>
      )}
    </article>
  )
}
