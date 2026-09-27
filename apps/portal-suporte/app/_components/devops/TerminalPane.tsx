'use client'

import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Copy,
  Terminal as TerminalIcon,
  Server,
  Maximize2,
} from 'lucide-react'
import Link from 'next/link'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

type Session = { nome: string; host: string; usuario: string }

export default function TerminalPane({ serverId }: { serverId?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef      = useRef<Terminal | null>(null)
  const fitRef       = useRef<FitAddon | null>(null)
  const wsRef        = useRef<WebSocket | null>(null)
  const inputHandlerRef = useRef<{ dispose: () => void } | null>(null)

  const connectingRef = useRef(false) // impede dupla conexão no StrictMode

  const [session,    setSession]    = useState<Session | null>(null)
  const [connected,  setConnected]  = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  // ── init xterm (browser-only) ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (termRef.current || !containerRef.current) return

    const term = new Terminal({
      cursorBlink:  true,
      cursorStyle:  'block',
      fontSize:     14,
      lineHeight:   1.2,
      fontFamily:   '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
      scrollback:   5000,
      convertEol:   false,
      allowProposedApi: true,
      theme: {
        background:  '#0d0e11',
        foreground:  '#cdd6f4',
        cursor:      '#89b4fa',
        cursorAccent:'#0d0e11',
        selectionBackground: '#313244',
        black:       '#45475a',
        red:         '#f38ba8',
        green:       '#a6e3a1',
        yellow:      '#f9e2af',
        blue:        '#89b4fa',
        magenta:     '#cba6f7',
        cyan:        '#89dceb',
        white:       '#bac2de',
        brightBlack: '#585b70',
        brightRed:   '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow:'#f9e2af',
        brightBlue:  '#89b4fa',
        brightMagenta:'#cba6f7',
        brightCyan:  '#89dceb',
        brightWhite: '#a6adc8',
      },
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)

    // defer fit until browser has calculated layout dimensions
    requestAnimationFrame(() => {
      if (!containerRef.current) return
      const { clientWidth, clientHeight } = containerRef.current
      if (clientWidth > 0 && clientHeight > 0) {
        try { fit.fit() } catch {}
      }
    })

    termRef.current = term
    fitRef.current  = fit

    return () => {
      inputHandlerRef.current?.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current  = null
    }
  }, [])

  // ── resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (!fitRef.current || !termRef.current) return
      const { clientWidth, clientHeight } = el
      if (clientWidth === 0 || clientHeight === 0) return
      try {
        fitRef.current.fit()
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const { cols, rows } = termRef.current
          wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
        }
      } catch {}
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── auto connect ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    if (serverId) connect(() => cancelled)
    return () => {
      cancelled = true
      disconnect(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  // ── WS URL ─────────────────────────────────────────────────────────────────
  function buildWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host  = window.location.host // inclui porta se não for 80/443
    return `${proto}://${host}/api/devops/terminal-ws?serverId=${encodeURIComponent(serverId ?? '')}`
  }

  // ── connect ────────────────────────────────────────────────────────────────
  async function connect(isCancelled?: () => boolean) {
    if (!serverId || connectingRef.current || wsRef.current) return
    connectingRef.current = true

    // sempre lê termRef.current em tempo de execução — evita capturar null no auto-connect
    const t = () => termRef.current

    setConnecting(true)
    setSession(null)
    t()?.clear()
    t()?.writeln('\x1b[2m  Estabelecendo conexão SSH…\x1b[0m')

    // busca info do servidor para exibir o comando antes de conectar
    try {
      const res  = await araraApiFetch(`/api/devops/terminal?serverId=${encodeURIComponent(serverId)}`)
      const ct   = res.headers.get('content-type') ?? ''
      const info = (res.ok && ct.includes('application/json')) ? await res.json() : null
      if (isCancelled?.()) { connectingRef.current = false; return }
      if (info?.usuario && info?.host) {
        const portSuffix = info.port && info.port !== 22 ? ` -p ${info.port}` : ''
        t()?.writeln(`\x1b[90m  ssh ${info.usuario}@${info.host}${portSuffix}\x1b[0m`)
      }
    } catch {}

    if (isCancelled?.()) { connectingRef.current = false; return }

    try {
      const ws = new WebSocket(buildWsUrl())
      wsRef.current = ws
      connectingRef.current = false

      ws.onopen = () => {
        setConnecting(false)
        setConnected(true)
        t()?.writeln('\x1b[90m  Autenticando…\x1b[0m')
        inputHandlerRef.current?.dispose()
        inputHandlerRef.current = t()?.onData(data => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data }))
          }
        }) ?? null
        const term = t()
        if (term) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
          term.focus()
        }
      }

      ws.onmessage = ev => {
        console.log('[ws] msg:', ev.data, '| term:', !!termRef.current)
        try {
          const msg = JSON.parse(ev.data as string)
          switch (msg.type) {
            case 'session': {
              const s: Session = msg.data
              setSession(s)
              t()?.writeln(`\x1b[32m  ✓ Conectado — ${s.nome}\x1b[0m`)
              t()?.writeln('')
              break
            }
            case 'output':
              t()?.write(msg.data)
              break
            case 'error':
              t()?.writeln(`\x1b[31m\r\n  ✗ ${msg.message}\x1b[0m\r\n`)
              setConnecting(false)
              break
            case 'close':
              t()?.writeln('\x1b[33m\r\n  *** Sessão encerrada ***\x1b[0m')
              _onClose()
              break
          }
        } catch {
          t()?.write(ev.data as string)
        }
      }

      ws.onclose = (ev) => {
        console.log('[ws] onclose code:', ev.code, 'reason:', ev.reason, 'wasClean:', ev.wasClean)
        _onClose()
      }
      ws.onerror = (ev) => {
        console.log('[ws] onerror:', ev)
        t()?.writeln('\x1b[31m\r\n  ✗ Erro de conexão WebSocket\x1b[0m\r\n')
        _onClose()
      }
    } catch (e: any) {
      connectingRef.current = false
      t()?.writeln(`\x1b[31m  ✗ ${e.message}\x1b[0m`)
      setConnecting(false)
    }
  }

  function _onClose() {
    connectingRef.current = false
    setConnected(false)
    setConnecting(false)
    inputHandlerRef.current?.dispose()
    inputHandlerRef.current = null
    wsRef.current = null
  }

  function disconnect(silent = false) {
    connectingRef.current = false
    try {
      wsRef.current?.send(JSON.stringify({ type: 'disconnect' }))
      wsRef.current?.close()
    } catch {}
    if (!silent) {
      termRef.current?.writeln('\x1b[33m\r\n  *** Desconectado ***\x1b[0m')
    }
    _onClose()
  }

  function clear() { termRef.current?.clear() }

  function copySelection() {
    const sel = termRef.current?.getSelection()
    if (sel) navigator.clipboard.writeText(sel)
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`devops-theme flex flex-col bg-devops-surface ${fullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}>

      {/* ── title bar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-devops-surface border-b border-devops-border/80 flex-shrink-0">
        {/* traffic lights */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => disconnect()}
            title="Desconectar"
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors group relative"
          >
            <span className="absolute inset-0 flex items-center justify-center text-sem-error-fg opacity-0 group-hover:opacity-100 text-[8px] font-bold">✕</span>
          </button>
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <button
            onClick={() => setFullscreen(f => !f)}
            title="Tela cheia"
            className="w-3 h-3 rounded-full bg-emerald-500 hover:bg-emerald-400 transition-colors group relative"
          >
            <span className="absolute inset-0 flex items-center justify-center text-sem-success-fg opacity-0 group-hover:opacity-100 text-[8px] font-bold">+</span>
          </button>
        </div>

        {/* address/session bar */}
        <div className="flex-1 flex items-center gap-2 bg-devops-surface border border-devops-border/50 rounded px-3 py-1 max-w-md mx-auto">
          <TerminalIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground/70 truncate font-mono">
            {session
              ? `${session.usuario}@${session.host}`
              : connecting
              ? 'Conectando…'
              : 'Terminal SSH'
            }
          </span>
        </div>

        {/* right controls */}
        <div className="flex items-center gap-1">
          {/* status indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-devops-panel/50 mr-1">
            {connecting ? (
              <><RefreshCw className="w-3 h-3 text-devops-warning animate-spin" /><span className="text-[11px] text-devops-warning">Conectando</span></>
            ) : connected ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" /><span className="text-[11px] text-devops-success">Conectado</span></>
            ) : (
              <><span className="w-1.5 h-1.5 rounded-full bg-devops-muted" /><span className="text-[11px] text-devops-muted">Offline</span></>
            )}
          </div>

          {!connected && !connecting && (
            <button
              onClick={() => connect()}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              <Wifi className="w-3.5 h-3.5" /> Conectar
            </button>
          )}
          {connected && (
            <button
              onClick={() => disconnect()}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-devops-border hover:border-red-800 hover:bg-red-600/10 text-muted-foreground/70 hover:text-devops-error transition-colors"
            >
              <WifiOff className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={copySelection} title="Copiar seleção (Ctrl+Shift+C)"
            className="p-1.5 rounded hover:bg-devops-panel text-muted-foreground hover:text-devops-foreground transition-colors">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={clear} title="Limpar"
            className="p-1.5 rounded hover:bg-devops-panel text-muted-foreground hover:text-devops-foreground transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setFullscreen(f => !f)} title="Tela cheia"
            className="p-1.5 rounded hover:bg-devops-panel text-muted-foreground hover:text-devops-foreground transition-colors">
            <Maximize2 className="w-4 h-4" />
          </button>
          {!fullscreen && serverId && (
            <Link
              href={`/admin/devops/_/?serverId=${encodeURIComponent(serverId)}`}
              className="p-1.5 rounded hover:bg-devops-panel text-muted-foreground hover:text-devops-foreground transition-colors"
              title="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      {/* ── xterm viewport ── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden"
        style={{ padding: '8px 4px 4px 8px' }}
      />

      {/* ── status bar ── */}
      <div className="flex items-center justify-between px-4 py-1 bg-devops-surface border-t border-devops-border/40 flex-shrink-0 text-[10px] text-foreground/60">
        <div className="flex items-center gap-3">
          {session && (
            <><Server className="w-3 h-3" /><span>{session.nome}</span></>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span>SSH</span>
          {termRef.current && (
            <span>{termRef.current.cols}×{termRef.current.rows}</span>
          )}
        </div>
      </div>
    </div>
  )
}
