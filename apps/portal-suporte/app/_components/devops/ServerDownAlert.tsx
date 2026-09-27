'use client'

import { useEffect, useRef, useState } from 'react'
import { X, WifiOff } from 'lucide-react'

export type ServerAlert = {
  id:          string
  nome:        string
  host:        string
  detectedAt:  Date
}

interface Props {
  alerts:    ServerAlert[]
  onDismiss: (id: string) => void
}

const AUTO_DISMISS_MS = 12_000

export default function ServerDownAlert({ alerts, onDismiss }: Props) {
  if (alerts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-[340px] pointer-events-none">
      {alerts.map(a => (
        <AlertCard key={a.id} alert={a} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function AlertCard({ alert, onDismiss }: { alert: ServerAlert; onDismiss: (id: string) => void }) {
  const [pct, setPct] = useState(100)
  const startRef = useRef(Date.now())
  const rafRef   = useRef<number>()

  useEffect(() => {
    function tick() {
      const elapsed   = Date.now() - startRef.current
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100)
      setPct(remaining)
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        onDismiss(alert.id)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [alert.id, onDismiss])

  return (
    <div className="pointer-events-auto rounded-xl overflow-hidden shadow-2xl shadow-black/60 border border-red-900/50 bg-devops-surface animate-in slide-in-from-right-4 duration-300">
      {/* Top accent line */}
      <div className="h-[2px] bg-gradient-to-r from-red-600 to-red-400" />

      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        {/* Icon */}
        <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0">
          <WifiOff className="w-4 h-4 text-red-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
            Servidor Offline
          </p>
          <p className="text-sm font-semibold text-white mt-0.5 truncate">{alert.nome}</p>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{alert.host}</p>
          <p className="text-[10px] text-foreground/60 mt-1">
            Detectado às{' '}
            {alert.detectedAt.toLocaleTimeString('pt-BR', {
              hour:   '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => onDismiss(alert.id)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-foreground/60 hover:text-white hover:bg-devops-panel/60 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="h-[2px] bg-devops-panel/60 mx-4 mb-3 rounded-full overflow-hidden">
        <div
          className="h-full bg-red-600 rounded-full"
          style={{ width: `${pct}%`, transition: 'width 100ms linear' }}
        />
      </div>
    </div>
  )
}
