import { FormEvent, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import {
  api,
  araraLogin,
  getStoredUser,
  getToken,
  isStaffUser,
  logout,
  notifications,
  type AppNotification,
  type AraraUser,
  type Course,
  type Lesson,
} from './lib/arara'

function useSession() {
  const [user, setUser] = useState<AraraUser | null>(() => getStoredUser())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = getToken()
    const stored = getStoredUser()
    if (!token || !stored) {
      setUser(null)
      setReady(true)
      return
    }
    setUser(stored)
    setReady(true)
  }, [])

  return { ready, user, staff: isStaffUser(user), setUser }
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)

  const refresh = async () => {
    try {
      const res = await notifications.list(10)
      setItems(res.notifications || [])
      setUnread(res.unreadCount || 0)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(id)
  }, [])

  async function markAll() {
    await notifications.markAllRead()
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)
  }

  async function openItem(n: AppNotification) {
    try {
      await notifications.markRead(n.id)
    } catch {
      /* ignore */
    }
    setOpen(false)
    if (n.href) window.location.href = n.href
    else refresh()
  }

  return (
    <div className="notif-wrap">
      <button
        type="button"
        className="notif-bell"
        aria-label="Notificações"
        onClick={() => {
          setOpen((v) => !v)
          refresh()
        }}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Notificações</strong>
            {unread > 0 && (
              <button type="button" className="linkish" onClick={markAll}>
                Marcar lidas
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted" style={{ padding: '1rem', margin: 0 }}>
              Nenhuma notificação
            </p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-item ${n.read ? '' : 'unread'}`}
                    onClick={() => openItem(n)}
                  >
                    <span className={`sev sev-${n.severity || 'info'}`} />
                    <span>
                      <strong>{n.title}</strong>
                      <small>{n.body}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Shell({
  user,
  children,
}: {
  user: AraraUser | null
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand">
          <img src="/arara-mark.png" alt="Arara Tech" />
          <span className="word">
            <small>Arara Tech</small>
            <strong>Cursos</strong>
          </span>
        </Link>
        <nav>
          <a href="https://hub.arara-tech.com">← Hub</a>
          <Link to="/">Catálogo</Link>
          <Link to="/courses/new">Novo curso</Link>
          <NotificationBell />
          {user && <span className="muted">{user.email}</span>}
          <button
            type="button"
            className="linkish"
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Sair
          </button>
        </nav>
      </header>
      {children}
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, user, staff } = useSession()
  if (!ready) return <div className="shell muted">Carregando…</div>
  if (!getToken() || !user) return <Navigate to="/login" replace />
  if (!staff) {
    return (
      <div className="shell">
        <h1>Sem permissão</h1>
        <p className="muted">
          O Portal de Cursos é restrito a contas com papel support, developer ou admin.
        </p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            logout()
            window.location.href = '/login'
          }}
        >
          Trocar conta
        </button>
      </div>
    )
  }
  return <Shell user={user}>{children}</Shell>
}

function LoginPage() {
  const navigate = useNavigate()
  const { staff } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (getToken() && staff) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { user } = await araraLogin(email.trim(), password)
      if (!isStaffUser(user)) {
        setError('Conta sem permissão de staff')
        return
      }
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <img className="login-mark" src="/arara-mark.png" alt="Arara Tech" />
        <p className="company">Arara Tech</p>
        <h1 className="product">Cursos</h1>
        <p className="muted">How-tos internos para o time (support, developer, admin).</p>
        <form onSubmit={onSubmit}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function CatalogPage() {
  const [q, setQ] = useState('')
  const [courses, setCourses] = useState<Course[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const t = window.setTimeout(() => {
      api
        .listCourses(q)
        .then((res) => {
          if (!cancelled) setCourses(res.data || [])
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao listar')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q])

  return (
    <>
      <section className="hero">
        <div className="hero-brand">
          <img src="/arara-mark.png" alt="Arara Tech" />
          <div>
            <h1>
              <em>Cursos</em>
            </h1>
            <p>Documentação operacional do time — edite Markdown direto no portal.</p>
          </div>
        </div>
      </section>
      <div className="toolbar">
        <input
          className="search"
          placeholder="Buscar por título ou tags…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Link className="btn btn-primary" to="/courses/new">
          Novo curso
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Carregando…</p>
      ) : courses.length === 0 ? (
        <p className="empty">Nenhum curso encontrado.</p>
      ) : (
        <ul className="course-list">
          {courses.map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
              <Link className="course-row" to={`/courses/${c.slug}`}>
                <h2>{c.title}</h2>
                {c.summary && <p>{c.summary}</p>}
                {!!c.tags?.length && (
                  <div className="tags">
                    {c.tags.map((t) => (
                      <span className="tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function CoursePage() {
  const { slug = '' } = useParams()
  const [search] = useSearchParams()
  const lessonSlug = search.get('lesson')
  const [course, setCourse] = useState<Course | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    api
      .getCourse(slug)
      .then((res) => {
        if (cancelled) return
        setCourse(res.data.course)
        setLessons(res.data.lessons || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  const active = useMemo(() => {
    if (!lessons.length) return null
    if (lessonSlug) {
      const found = lessons.find((l) => l.slug === lessonSlug || l.id === lessonSlug)
      if (found) return found
    }
    return lessons[0]
  }, [lessons, lessonSlug])

  async function onDelete() {
    if (!course) return
    if (!confirm(`Excluir o curso "${course.title}" e todas as lições?`)) return
    await api.deleteCourse(course.id)
    navigate('/')
  }

  if (error) return <p className="error">{error}</p>
  if (!course) return <p className="muted">Carregando…</p>

  return (
    <>
      <div className="actions">
        <Link className="btn btn-ghost" to={`/courses/${course.slug}/edit`}>
          Editar curso
        </Link>
        <Link className="btn btn-ghost" to={`/courses/${course.slug}/lessons/new`}>
          Nova lição
        </Link>
        {active && (
          <Link className="btn btn-ghost" to={`/courses/${course.slug}/lessons/${active.id}/edit`}>
            Editar lição
          </Link>
        )}
        <button type="button" className="btn btn-danger" onClick={onDelete}>
          Excluir curso
        </button>
      </div>
      <div className="layout-course">
        <aside className="outline">
          <h3>{course.title}</h3>
          {course.summary && <p className="muted">{course.summary}</p>}
          <ol>
            {lessons.map((l) => (
              <li key={l.id}>
                <Link
                  className={active?.id === l.id ? 'active' : undefined}
                  to={`/courses/${course.slug}?lesson=${encodeURIComponent(l.slug)}`}
                >
                  {l.title}
                </Link>
              </li>
            ))}
          </ol>
          {!lessons.length && <p className="muted">Sem lições ainda.</p>}
        </aside>
        <article className="viewer">
          {active ? (
            <>
              <h1>{active.title}</h1>
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{active.body_markdown || ''}</ReactMarkdown>
              </div>
            </>
          ) : (
            <p className="empty">Crie a primeira lição para começar.</p>
          )}
        </article>
      </div>
    </>
  )
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function CourseFormPage({ mode }: { mode: 'new' | 'edit' }) {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [courseSlug, setCourseSlug] = useState('')
  const [summary, setSummary] = useState('')
  const [tags, setTags] = useState('')
  const [published, setPublished] = useState(true)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(mode === 'edit')

  useEffect(() => {
    if (mode !== 'edit') return
    let cancelled = false
    api
      .getCourse(slug)
      .then((res) => {
        if (cancelled) return
        const c = res.data.course
        setCourseId(c.id)
        setTitle(c.title)
        setCourseSlug(c.slug)
        setSummary(c.summary || '')
        setTags((c.tags || []).join(', '))
        setPublished(c.published !== false)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, slug])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const payload = {
      title: title.trim(),
      slug: (courseSlug || slugify(title)).trim(),
      summary: summary.trim(),
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      published,
    }
    try {
      if (mode === 'new') {
        const res = await api.createCourse(payload)
        navigate(`/courses/${res.data.slug}`)
      } else if (courseId) {
        const res = await api.updateCourse(courseId, payload)
        navigate(`/courses/${res.data.slug}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    }
  }

  if (loading) return <p className="muted">Carregando…</p>

  return (
    <>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>{mode === 'new' ? 'Novo curso' : 'Editar curso'}</h1>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Título
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (mode === 'new' && !courseSlug) setCourseSlug(slugify(e.target.value))
            }}
            required
          />
        </label>
        <label>
          Slug
          <input value={courseSlug} onChange={(e) => setCourseSlug(e.target.value)} required />
        </label>
        <label>
          Resumo
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
        </label>
        <label>
          Tags (separadas por vírgula)
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Publicado
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn btn-primary" type="submit">
            Salvar
          </button>
          <Link className="btn btn-ghost" to={mode === 'edit' ? `/courses/${slug}` : '/'}>
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}

function LessonFormPage({ mode }: { mode: 'new' | 'edit' }) {
  const { slug = '', id = '' } = useParams()
  const navigate = useNavigate()
  const [courseId, setCourseId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [lessonSlug, setLessonSlug] = useState('')
  const [body, setBody] = useState('# Nova lição\n\n')
  const [published, setPublished] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .getCourse(slug)
      .then((res) => {
        if (cancelled) return
        setCourseId(res.data.course.id)
        if (mode === 'edit') {
          const lesson = (res.data.lessons || []).find((l) => l.id === id)
          if (!lesson) throw new Error('Lição não encontrada')
          setTitle(lesson.title)
          setLessonSlug(lesson.slug)
          setBody(lesson.body_markdown || '')
          setPublished(lesson.published !== false)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, id, mode])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!courseId) return
    setError('')
    const payload = {
      title: title.trim(),
      slug: (lessonSlug || slugify(title)).trim(),
      body_markdown: body,
      published,
    }
    try {
      if (mode === 'new') {
        const res = await api.createLesson(courseId, payload)
        navigate(`/courses/${slug}?lesson=${encodeURIComponent(res.data.slug)}`)
      } else {
        const res = await api.updateLesson(id, payload)
        navigate(`/courses/${slug}?lesson=${encodeURIComponent(res.data.slug)}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    }
  }

  async function onDelete() {
    if (mode !== 'edit') return
    if (!confirm('Excluir esta lição?')) return
    await api.deleteLesson(id)
    navigate(`/courses/${slug}`)
  }

  if (loading) return <p className="muted">Carregando…</p>

  return (
    <>
      <h1 style={{ fontFamily: 'var(--font-display)' }}>{mode === 'new' ? 'Nova lição' : 'Editar lição'}</h1>
      <form className="form-grid" onSubmit={onSubmit} style={{ maxWidth: '100%' }}>
        <label>
          Título
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              if (mode === 'new' && !lessonSlug) setLessonSlug(slugify(e.target.value))
            }}
            required
          />
        </label>
        <label>
          Slug
          <input value={lessonSlug} onChange={(e) => setLessonSlug(e.target.value)} required />
        </label>
        <label className="check">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Publicado
        </label>
        <div className="editor-split">
          <label>
            Markdown
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18} />
          </label>
          <div>
            <div className="muted" style={{ marginBottom: '0.35rem', fontWeight: 600 }}>
              Preview
            </div>
            <div className="preview-pane markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn btn-primary" type="submit">
            Salvar
          </button>
          <Link className="btn btn-ghost" to={`/courses/${slug}`}>
            Cancelar
          </Link>
          {mode === 'edit' && (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              Excluir
            </button>
          )}
        </div>
      </form>
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <CatalogPage />
          </RequireAuth>
        }
      />
      <Route
        path="/courses/new"
        element={
          <RequireAuth>
            <CourseFormPage mode="new" />
          </RequireAuth>
        }
      />
      <Route
        path="/courses/:slug"
        element={
          <RequireAuth>
            <CoursePage />
          </RequireAuth>
        }
      />
      <Route
        path="/courses/:slug/edit"
        element={
          <RequireAuth>
            <CourseFormPage mode="edit" />
          </RequireAuth>
        }
      />
      <Route
        path="/courses/:slug/lessons/new"
        element={
          <RequireAuth>
            <LessonFormPage mode="new" />
          </RequireAuth>
        }
      />
      <Route
        path="/courses/:slug/lessons/:id/edit"
        element={
          <RequireAuth>
            <LessonFormPage mode="edit" />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
