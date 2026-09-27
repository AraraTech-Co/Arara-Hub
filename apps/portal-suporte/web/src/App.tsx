import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { arara, getApiBase, getApiKey, getAppSlug, getToken, setApiKey, setToken, type Company, type Ticket } from './api'
import './App.css'

function useAuth() {
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    const key = getApiKey()
    if (!token && !key) {
      setReady(true)
      return
    }
    arara
      .me()
      .then((m) => {
        setEmail(m.user?.email ?? (key ? 'api-key' : null))
      })
      .catch(() => {
        setToken(null)
        setEmail(null)
      })
      .finally(() => setReady(true))
  }, [])

  return { ready, email, loggedIn: Boolean(getToken() || getApiKey()) }
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="shell">
      <header className="top">
        <div>
          <strong>Portal Suporte</strong>
          <span className="muted"> · Arara API</span>
        </div>
        <nav>
          <Link to="/">Tickets</Link>
          <Link to="/companies">Empresas</Link>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setToken(null)
              navigate('/login')
            }}
          >
            Sair
          </button>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="foot">
        API {getApiBase()} · app {getAppSlug()}
      </footer>
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('portal-suporte@arara.local')
  const [password, setPassword] = useState('portal-suporte123')
  const [apiKey, setApiKeyInput] = useState(getApiKey())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await arara.login(email, password)
      setToken(res.token)
      if (apiKey.trim()) setApiKey(apiKey.trim())
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  function onKeyOnly(e: FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) {
      setError('Informe a API key')
      return
    }
    setApiKey(apiKey.trim())
    navigate('/')
  }

  return (
    <div className="login">
      <form className="card" onSubmit={onLogin}>
        <h1>Portal Suporte</h1>
        <p className="muted">Frontend sem backend local — consome só a Arara API.</p>
        {error && <div className="err">{error}</div>}
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label>
          API key do app (opcional, para /v1/r)
          <input
            value={apiKey}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="sk_live_..."
          />
        </label>
        <button disabled={loading} type="submit">
          {loading ? 'Entrando…' : 'Entrar com JWT'}
        </button>
        <button type="button" className="ghost" onClick={onKeyOnly}>
          Entrar só com API key
        </button>
      </form>
    </div>
  )
}

function TicketsPage() {
  const [rows, setRows] = useState<Ticket[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    arara
      .tickets()
      .then((r) => setRows(r.data || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Shell>
      <h2>Tickets</h2>
      {loading && <p className="muted">Carregando…</p>}
      {error && <div className="err">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Título</th>
              <th>Status</th>
              <th>Prioridade</th>
              <th>Empresa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/tickets/${t.id}`}>{t.ticket_number || t.id.slice(0, 8)}</Link>
                </td>
                <td>{t.title}</td>
                <td>{t.status}</td>
                <td>{t.priority}</td>
                <td>{t.company_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{rows.length} tickets</p>
    </Shell>
  )
}

function TicketDetailPage() {
  const { id } = useParams()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    arara
      .ticket(id)
      .then(setTicket)
      .catch((e) => setError(e.message))
  }, [id])

  return (
    <Shell>
      <Link to="/">← Voltar</Link>
      {error && <div className="err">{error}</div>}
      {ticket && (
        <article className="card detail">
          <h2>{ticket.title}</h2>
          <p>
            <span className="pill">{ticket.ticket_number}</span>{' '}
            <span className="pill">{ticket.status}</span>{' '}
            <span className="pill">{ticket.priority}</span>
          </p>
          <dl>
            <div>
              <dt>Empresa</dt>
              <dd>{ticket.company_name || '—'}</dd>
            </div>
            <div>
              <dt>Solicitante</dt>
              <dd>{ticket.requester || '—'}</dd>
            </div>
            <div>
              <dt>Criado</dt>
              <dd>{ticket.created_at || '—'}</dd>
            </div>
          </dl>
        </article>
      )}
    </Shell>
  )
}

function CompaniesPage() {
  const [rows, setRows] = useState<Company[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    arara
      .companies()
      .then((r) => setRows(r.data || []))
      .catch((e) => setError(e.message))
  }, [])

  return (
    <Shell>
      <h2>Empresas</h2>
      {error && <div className="err">{error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>CNPJ</th>
              <th>Cidade</th>
              <th>Ativa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.cnpj || '—'}</td>
                <td>{c.city || '—'}</td>
                <td>{c.active === false ? 'não' : 'sim'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}

function Private({ children }: { children: React.ReactNode }) {
  const { ready, loggedIn } = useAuth()
  if (!ready) return <div className="login muted">Carregando…</div>
  if (!loggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Private>
            <TicketsPage />
          </Private>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <Private>
            <TicketDetailPage />
          </Private>
        }
      />
      <Route
        path="/companies"
        element={
          <Private>
            <CompaniesPage />
          </Private>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
