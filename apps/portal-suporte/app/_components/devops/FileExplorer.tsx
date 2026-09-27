'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate } from '@/lib/utils'
import { LoadingBlock } from '@/components/ui/loading-block'
import {
  ArrowLeft, ArrowRight, ArrowUp, RefreshCw, Search,
  Folder, FolderOpen, File, FileText, Terminal, Settings,
  Code2, Archive, Plus, Pencil, Trash2, Play, Save, X,
  ChevronRight, Copy, AlertTriangle, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── types ────────────────────────────────────────────────────────────────────

type FileItem = {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string | null
  permissions: string
  path: string
}

type SortKey = 'name' | 'size' | 'modified' | 'type'
type SortDir = 'asc' | 'desc'

type ContextMenu = { x: number; y: number; item: FileItem } | null
type EditorState  = { open: boolean; path: string; content: string; dirty: boolean }
type ExecState    = { open: boolean; path: string; output: string; running: boolean; code: number | null }
type RenameState  = { open: boolean; item: FileItem | null; value: string }
type CreateState  = { open: boolean; type: 'file' | 'directory'; value: string }

const QUICK_ACCESS = ['/', '/home', '/etc', '/var', '/opt', '/tmp', '/srv', '/root']

// ─── file icon ────────────────────────────────────────────────────────────────

function fileIcon(item: FileItem, open = false) {
  if (item.type === 'directory') {
    return open
      ? <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
      : <Folder     className="w-4 h-4 text-amber-400 flex-shrink-0" />
  }
  const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
  if (['sh', 'bash', 'zsh'].includes(ext))
    return <Terminal className="w-4 h-4 text-emerald-400 flex-shrink-0" />
  if (['txt', 'log', 'md', 'csv'].includes(ext))
    return <FileText className="w-4 h-4 text-blue-300 flex-shrink-0" />
  if (['conf', 'config', 'ini', 'env', 'yaml', 'yml', 'toml', 'json'].includes(ext))
    return <Settings className="w-4 h-4 text-purple-400 flex-shrink-0" />
  if (['js', 'ts', 'py', 'rb', 'go', 'java', 'c', 'cpp', 'php'].includes(ext))
    return <Code2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
  if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar'].includes(ext))
    return <Archive className="w-4 h-4 text-orange-400 flex-shrink-0" />
  return <File className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" />
}

function isTextFile(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['txt', 'log', 'md', 'csv', 'sh', 'bash', 'conf', 'config', 'ini',
    'env', 'yaml', 'yml', 'toml', 'json', 'js', 'ts', 'py', 'rb', 'go',
    'java', 'c', 'cpp', 'php', 'html', 'css', 'xml', 'sql', 'dockerfile',
    'gitignore', 'htaccess'].includes(ext) || !name.includes('.')
}

function fmtSize(bytes: number) {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}


// ─── main component ───────────────────────────────────────────────────────────

export default function FileExplorer({ serverId }: { serverId?: string }) {
  const [files,     setFiles]     = useState<FileItem[]>([])
  const [currentPath, setCurrentPath] = useState('/')
  const [history,   setHistory]   = useState<string[]>(['/'])
  const [histIdx,   setHistIdx]   = useState(0)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [sortKey,   setSortKey]   = useState<SortKey>('name')
  const [sortDir,   setSortDir]   = useState<SortDir>('asc')
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(false)

  const [ctx,       setCtx]       = useState<ContextMenu>(null)
  const [editor,    setEditor]    = useState<EditorState>({ open: false, path: '', content: '', dirty: false })
  const [exec,      setExec]      = useState<ExecState>({ open: false, path: '', output: '', running: false, code: null })
  const [rename,    setRename]    = useState<RenameState>({ open: false, item: null, value: '' })
  const [create,    setCreate]    = useState<CreateState>({ open: false, type: 'file', value: '' })

  const ctxRef  = useRef<HTMLDivElement>(null)

  // ── API helpers ─────────────────────────────────────────────────────────────
  const base = serverId ? `/api/devops/${serverId}/files` : null

  const loadDir = useCallback(async (dir: string, pushHistory = true) => {
    if (!base) return
    setLoading(true)
    setSelected(new Set())
    setSearch('')
    try {
      const res  = await fetch(`${base}/list?path=${encodeURIComponent(dir)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setFiles(json.files)
      setCurrentPath(json.currentPath)
      if (pushHistory) {
        setHistory(h => {
          const next = h.slice(0, histIdx + 1)
          next.push(dir)
          setHistIdx(next.length - 1)
          return next
        })
      }
    } catch (e: any) {
      toast.error('Erro ao listar: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [base, histIdx])

  useEffect(() => { loadDir('/') }, [serverId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── close context menu on outside click ─────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtx(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── navigation ───────────────────────────────────────────────────────────────
  function goBack() {
    if (histIdx <= 0) return
    const prev = history[histIdx - 1]
    setHistIdx(i => i - 1)
    loadDir(prev, false)
  }
  function goForward() {
    if (histIdx >= history.length - 1) return
    const next = history[histIdx + 1]
    setHistIdx(i => i + 1)
    loadDir(next, false)
  }
  function goUp() {
    const parent = currentPath === '/' ? '/' : currentPath.split('/').slice(0, -1).join('/') || '/'
    loadDir(parent)
  }

  // ── sorting ──────────────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = [...files]
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      let cmp = 0
      if (sortKey === 'name')     cmp = a.name.localeCompare(b.name)
      if (sortKey === 'size')     cmp = a.size - b.size
      if (sortKey === 'modified') cmp = (a.modified ?? '').localeCompare(b.modified ?? '')
      return sortDir === 'asc' ? cmp : -cmp
    })

  // ── selection ─────────────────────────────────────────────────────────────────
  function handleClick(item: FileItem, e: React.MouseEvent) {
    setCtx(null)
    if (e.ctrlKey || e.metaKey) {
      setSelected(s => {
        const n = new Set(s)
        n.has(item.path) ? n.delete(item.path) : n.add(item.path)
        return n
      })
    } else {
      setSelected(new Set([item.path]))
    }
  }
  function handleDblClick(item: FileItem) {
    if (item.type === 'directory') {
      loadDir(item.path)
    } else if (isTextFile(item.name)) {
      openEditor(item.path)
    }
  }
  function handleRowRightClick(e: React.MouseEvent, item: FileItem) {
    e.preventDefault()
    setSelected(new Set([item.path]))
    setCtx({ x: e.clientX, y: e.clientY, item })
  }
  function handleBgRightClick(e: React.MouseEvent) {
    e.preventDefault()
    setSelected(new Set())
    setCtx({ x: e.clientX, y: e.clientY, item: { name: '', type: 'directory', size: 0, modified: null, permissions: '', path: currentPath } })
  }

  // ── open editor ──────────────────────────────────────────────────────────────
  async function openEditor(path: string) {
    if (!base) return
    try {
      const res  = await fetch(`${base}/read?path=${encodeURIComponent(path)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setEditor({ open: true, path, content: json.content, dirty: false })
    } catch (e: any) {
      toast.error('Erro ao abrir: ' + e.message)
    }
  }
  async function saveEditor() {
    if (!base) return
    try {
      const res  = await fetch(`${base}/write`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editor.path, content: editor.content }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Arquivo salvo')
      setEditor(e => ({ ...e, dirty: false }))
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message)
    }
  }

  // ── new file with editor ──────────────────────────────────────────────────────
  function openNewFile() {
    const name = prompt('Nome do arquivo:')
    if (!name?.trim()) return
    const path = currentPath === '/' ? `/${name.trim()}` : `${currentPath}/${name.trim()}`
    setEditor({ open: true, path, content: '', dirty: true })
    setCtx(null)
  }

  // ── execute script ────────────────────────────────────────────────────────────
  async function runScript(path: string) {
    if (!base) return
    setExec({ open: true, path, output: '', running: true, code: null })
    setCtx(null)
    try {
      const res  = await fetch(`${base}/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const json = await res.json()
      setExec(s => ({ ...s, running: false, output: json.stdout || json.error || '', code: json.code ?? -1 }))
    } catch (e: any) {
      setExec(s => ({ ...s, running: false, output: e.message, code: -1 }))
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────────
  async function deleteSelected() {
    if (!base || selected.size === 0) return
    if (!confirm(`Excluir ${selected.size} item(ns)?`)) return
    setCtx(null)
    for (const p of selected) {
      try {
        await fetch(`${base}/delete`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: p }),
        })
      } catch {}
    }
    toast.success('Excluído')
    loadDir(currentPath, false)
  }

  // ── rename ────────────────────────────────────────────────────────────────────
  async function commitRename() {
    if (!base || !rename.item || !rename.value.trim()) return
    const res  = await fetch(`${base}/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: rename.item.path, newName: rename.value.trim() }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Renomeado')
    setRename({ open: false, item: null, value: '' })
    loadDir(currentPath, false)
  }

  // ── create ────────────────────────────────────────────────────────────────────
  async function commitCreate() {
    if (!base || !create.value.trim()) return
    const path = currentPath === '/' ? `/${create.value.trim()}` : `${currentPath}/${create.value.trim()}`
    const res  = await fetch(`${base}/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: create.type }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Criado')
    setCreate({ open: false, type: 'file', value: '' })
    loadDir(currentPath, false)
  }

  // ── breadcrumbs ───────────────────────────────────────────────────────────────
  const crumbs = currentPath === '/'
    ? [{ label: '/', path: '/' }]
    : ['/', ...currentPath.split('/').filter(Boolean)].reduce<{ label: string; path: string }[]>((acc, seg, i) => {
        acc.push({ label: seg, path: i === 0 ? '/' : acc[i - 1].path === '/' ? `/${seg}` : `${acc[i - 1].path}/${seg}` })
        return acc
      }, [])

  const totalSelected = sorted.filter(f => selected.has(f.path)).reduce((acc, f) => acc + f.size, 0)

  // ── render ────────────────────────────────────────────────────────────────────
  if (!serverId) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">Nenhum servidor selecionado</div>
  )

  return (
    <div className="devops-theme flex flex-col h-full min-h-0 bg-devops-panel text-white select-none text-sm">

      {/* ── toolbar ── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-devops-border/50 bg-devops-surface">
        <button onClick={goBack}    disabled={histIdx <= 0}                  className="p-1.5 rounded hover:bg-devops-overlay disabled:opacity-30 transition-colors"><ArrowLeft  className="w-4 h-4" /></button>
        <button onClick={goForward} disabled={histIdx >= history.length - 1} className="p-1.5 rounded hover:bg-devops-overlay disabled:opacity-30 transition-colors"><ArrowRight className="w-4 h-4" /></button>
        <button onClick={goUp}      disabled={currentPath === '/'}           className="p-1.5 rounded hover:bg-devops-overlay disabled:opacity-30 transition-colors"><ArrowUp    className="w-4 h-4" /></button>
        <button onClick={() => loadDir(currentPath, false)}                  className="p-1.5 rounded hover:bg-devops-overlay transition-colors"><RefreshCw className="w-4 h-4" /></button>

        {/* address bar */}
        <div className="flex-1 flex items-center gap-1 bg-devops-panel rounded px-2 py-1 mx-1 border border-devops-border">
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              <button
                onClick={() => loadDir(c.path)}
                className="hover:text-devops-accent transition-colors text-muted-foreground/50 text-xs"
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>

        {/* search */}
        <div className="relative">
          <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-muted-foreground" />
          <input
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-7 pr-2 py-1 text-xs rounded bg-devops-panel border border-devops-border w-40 focus:outline-none focus:border-devops-accent text-white placeholder:text-muted-foreground"
          />
        </div>

        {/* new buttons */}
        <button
          onClick={() => setCreate({ open: true, type: 'file', value: '' })}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-blue-600 hover:bg-blue-700 transition-colors ml-1"
        >
          <Plus className="w-3.5 h-3.5" /> Arquivo
        </button>
        <button
          onClick={() => setCreate({ open: true, type: 'directory', value: '' })}
          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-devops-panel hover:bg-devops-overlay transition-colors"
        >
          <Folder className="w-3.5 h-3.5" /> Pasta
        </button>
        {selected.size > 0 && (
          <button
            onClick={deleteSelected}
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-red-600/80 hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── sidebar ── */}
        <div className="w-40 flex-shrink-0 bg-devops-surface border-r border-devops-border/50 overflow-y-auto py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest px-3 mb-1">Acesso Rápido</p>
          {QUICK_ACCESS.map(p => (
            <button
              key={p}
              onClick={() => loadDir(p)}
              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                currentPath === p ? 'bg-blue-600/20 text-devops-accent' : 'text-muted-foreground/70 hover:bg-devops-panel hover:text-white'
              }`}
            >
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              {p}
            </button>
          ))}
        </div>

        {/* ── main panel ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* column headers */}
          <div className="grid grid-cols-[auto_1fr_80px_140px_90px] gap-0 border-b border-devops-border/50 bg-devops-surface px-2 py-1.5 text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">
            <div className="w-5" />
            <ColHeader label="Nome"     k="name"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <ColHeader label="Tamanho"  k="size"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="text-right" />
            <ColHeader label="Modificado" k="modified" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <ColHeader label="Tipo"     k="type"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
          </div>

          {/* file list */}
          <div
            className="flex-1 overflow-y-auto"
            onContextMenu={handleBgRightClick}
          >
            {loading ? (
              <LoadingBlock label="Carregando…" />
            ) : sorted.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-foreground/60">
                {search ? 'Nenhum resultado.' : 'Diretório vazio.'}
              </div>
            ) : (
              sorted.map(item => {
                const isSelected = selected.has(item.path)
                const ext = item.name.split('.').pop()?.toLowerCase() ?? ''
                const isScript = ['sh', 'bash', 'zsh'].includes(ext)
                return (
                  <div
                    key={item.path}
                    className={`grid grid-cols-[auto_1fr_80px_140px_90px] gap-0 items-center px-2 py-1 cursor-pointer transition-colors group border-b border-transparent ${
                      isSelected
                        ? 'bg-blue-600/25 border-b-blue-600/10'
                        : 'hover:bg-devops-panel/60'
                    }`}
                    onClick={e => handleClick(item, e)}
                    onDoubleClick={() => handleDblClick(item)}
                    onContextMenu={e => handleRowRightClick(e, item)}
                  >
                    <div className="w-5 flex justify-center">{fileIcon(item, isSelected && item.type === 'directory')}</div>
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                      <span className="truncate text-[13px]">{item.name}</span>
                      {isScript && <span className="text-[9px] text-emerald-400 bg-emerald-400/10 px-1 rounded">.sh</span>}
                    </div>
                    <div className="text-right text-[12px] text-muted-foreground/70 pr-3">{item.type === 'file' ? fmtSize(item.size) : '—'}</div>
                    <div className="text-[11px] text-muted-foreground">{formatDate(item.modified)}</div>
                    <div className="text-[11px] text-muted-foreground capitalize">{item.type === 'directory' ? 'Pasta' : ext || 'arquivo'}</div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ── status bar ── */}
      <div className="flex items-center justify-between px-3 py-1 bg-devops-surface border-t border-devops-border/50 text-[11px] text-muted-foreground">
        <span>{sorted.length} item(ns)</span>
        {selected.size > 0 && (
          <span>{selected.size} selecionado(s) {totalSelected > 0 ? `— ${fmtSize(totalSelected)}` : ''}</span>
        )}
      </div>

      {/* ── context menu ── */}
      {ctx && (
        <div
          ref={ctxRef}
          className="fixed z-50 bg-devops-overlay border border-devops-border rounded-lg shadow-2xl py-1 w-48 text-[13px]"
          style={{ top: ctx.y, left: ctx.x }}
        >
          {ctx.item.name && isTextFile(ctx.item.name) && (
            <CtxItem icon={<FileText className="w-3.5 h-3.5" />} label="Abrir / Editar"
              onClick={() => { openEditor(ctx.item.path); setCtx(null) }} />
          )}
          {ctx.item.name && ['sh', 'bash', 'zsh'].includes(ctx.item.name.split('.').pop()?.toLowerCase() ?? '') && (
            <CtxItem icon={<Play className="w-3.5 h-3.5 text-emerald-400" />} label="Executar Script"
              onClick={() => runScript(ctx.item.path)} />
          )}
          {ctx.item.name && (
            <>
              <CtxItem icon={<Pencil className="w-3.5 h-3.5" />} label="Renomear"
                onClick={() => { setRename({ open: true, item: ctx.item, value: ctx.item.name }); setCtx(null) }} />
              <CtxItem icon={<Copy className="w-3.5 h-3.5" />} label="Copiar caminho"
                onClick={() => { navigator.clipboard.writeText(ctx.item.path); toast.success('Caminho copiado'); setCtx(null) }} />
              <div className="border-t border-devops-border my-1" />
              <CtxItem icon={<Trash2 className="w-3.5 h-3.5 text-red-400" />} label="Excluir" danger
                onClick={() => { deleteSelected(); setCtx(null) }} />
            </>
          )}
          <div className="border-t border-devops-border my-1" />
          <CtxItem icon={<FileText className="w-3.5 h-3.5" />} label="Novo Arquivo"
            onClick={() => { openNewFile() }} />
          <CtxItem icon={<Folder className="w-3.5 h-3.5" />} label="Nova Pasta"
            onClick={() => { setCreate({ open: true, type: 'directory', value: '' }); setCtx(null) }} />
        </div>
      )}

      {/* ── editor modal (Notepad) ── */}
      {editor.open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-devops-panel">
          {/* title bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-devops-surface border-b border-devops-border">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-devops-accent" />
              <span className="text-sm font-medium">{editor.path.split('/').pop()}</span>
              {editor.dirty && <span className="text-xs text-amber-400">● não salvo</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-7 gap-1" onClick={saveEditor}>
                <Save className="w-3.5 h-3.5" /> Salvar
              </Button>
              <button
                onClick={() => {
                  if (editor.dirty && !confirm('Fechar sem salvar?')) return
                  setEditor(e => ({ ...e, open: false }))
                }}
                className="p-1.5 rounded hover:bg-devops-overlay text-muted-foreground/70 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* editor area */}
          <div className="flex flex-1 min-h-0">
            {/* line numbers */}
            <div className="w-12 bg-devops-surface border-r border-devops-border/50 py-3 overflow-hidden select-none">
              {editor.content.split('\n').map((_, i) => (
                <div key={i} className="text-right pr-3 text-[11px] text-foreground/60 leading-[1.6rem]">{i + 1}</div>
              ))}
            </div>
            <textarea
              className="flex-1 bg-transparent text-[13px] font-mono text-devops-foreground resize-none focus:outline-none px-3 py-3 leading-[1.6rem] caret-blue-400"
              value={editor.content}
              onChange={e => setEditor(s => ({ ...s, content: e.target.value, dirty: true }))}
              spellCheck={false}
              autoFocus
            />
          </div>
          <div className="px-3 py-1 bg-devops-surface border-t border-devops-border/50 text-[11px] text-muted-foreground flex gap-4">
            <span>{editor.content.split('\n').length} linhas</span>
            <span>{editor.content.length} chars</span>
            <span className="text-foreground/60">{editor.path}</span>
          </div>
        </div>
      )}

      {/* ── script executor modal ── */}
      {exec.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-devops-overlay border border-devops-border rounded-xl w-full max-w-2xl mx-4 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 bg-devops-surface border-b border-devops-border">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-medium text-sm">Executar: {exec.path.split('/').pop()}</span>
              </div>
              <div className="flex items-center gap-2">
                {!exec.running && exec.code === null && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7 gap-1"
                    onClick={() => runScript(exec.path)}>
                    <Play className="w-3.5 h-3.5" /> Executar
                  </Button>
                )}
                <button onClick={() => setExec(s => ({ ...s, open: false }))}
                  className="p-1.5 rounded hover:bg-devops-overlay text-muted-foreground/70 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-3">
              <p className="text-xs text-muted-foreground mb-2 font-mono">{exec.path}</p>
              <pre className="bg-black rounded-lg p-4 text-xs text-emerald-400 font-mono overflow-auto max-h-80 min-h-24 whitespace-pre-wrap">
                {exec.running
                  ? <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Executando…</span>
                  : exec.output || <span className="text-foreground/60">Clique em Executar para rodar o script.</span>
                }
              </pre>
              {exec.code !== null && (
                <div className={`flex items-center gap-2 mt-2 text-xs ${exec.code === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {exec.code === 0
                    ? <><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Concluído com sucesso (exit 0)</>
                    : <><AlertTriangle className="w-3.5 h-3.5" /> Erro (exit {exec.code})</>
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── rename dialog ── */}
      {rename.open && (
        <SmallDialog title="Renomear" onClose={() => setRename({ open: false, item: null, value: '' })}>
          <Input
            autoFocus
            value={rename.value}
            onChange={e => setRename(s => ({ ...s, value: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && commitRename()}
            className="bg-devops-panel border-devops-border text-white text-sm"
          />
          <div className="flex justify-end gap-2 mt-3">
            <Button size="sm" variant="outline" className="border-devops-border text-muted-foreground/50 hover:bg-devops-panel"
              onClick={() => setRename({ open: false, item: null, value: '' })}>Cancelar</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={commitRename}>Renomear</Button>
          </div>
        </SmallDialog>
      )}

      {/* ── create dialog ── */}
      {create.open && (
        <SmallDialog
          title={create.type === 'directory' ? 'Nova Pasta' : 'Novo Arquivo'}
          onClose={() => setCreate({ open: false, type: 'file', value: '' })}
        >
          <Input
            autoFocus
            placeholder={create.type === 'directory' ? 'nome-da-pasta' : 'arquivo.txt'}
            value={create.value}
            onChange={e => setCreate(s => ({ ...s, value: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && commitCreate()}
            className="bg-devops-panel border-devops-border text-white text-sm"
          />
          <div className="flex justify-end gap-2 mt-3">
            <Button size="sm" variant="outline" className="border-devops-border text-muted-foreground/50 hover:bg-devops-panel"
              onClick={() => setCreate({ open: false, type: 'file', value: '' })}>Cancelar</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={commitCreate}>Criar</Button>
          </div>
        </SmallDialog>
      )}
    </div>
  )
}

// ─── small helpers ────────────────────────────────────────────────────────────

function ColHeader({ label, k, sortKey, sortDir, onSort, cls = '' }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir
  onSort: (k: SortKey) => void; cls?: string
}) {
  return (
    <button
      onClick={() => onSort(k)}
      className={`flex items-center gap-1 hover:text-white transition-colors ${cls}`}
    >
      {label}
      {sortKey === k && <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  )
}

function CtxItem({ icon, label, onClick, danger = false }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-devops-overlay transition-colors ${danger ? 'text-devops-error' : 'text-muted-foreground/50'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function SmallDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-devops-overlay border border-devops-border rounded-xl shadow-2xl w-80 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-sm">{title}</span>
          <button onClick={onClose} className="text-devops-muted hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
