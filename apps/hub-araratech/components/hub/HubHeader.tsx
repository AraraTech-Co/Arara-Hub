'use client'

import { useEffect, useState } from 'react'
import { arara, useAuth, type AraraNotification } from '@/lib/arara'

export function HubHeader() {
  const { user, memberships, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<AraraNotification[]>([])

  useEffect(() => {
    let alive = true
    arara.notifications().then((n) => { if (alive) setNotes(n) })
    return () => { alive = false }
  }, [])

  const unread = notes.filter((n) => !n.readAt)

  async function openNote(n: AraraNotification) {
    if (!n.readAt) { await arara.markRead(n.id); setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))) }
    if (n.href) window.location.href = n.href
  }

  const name = user?.name || user?.email || 'você'
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase()

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-grid place-items-center h-8 w-8 rounded-lg bg-indigo-600 text-white font-bold">A</span>
          <span className="font-semibold text-slate-900">Arara Hub</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Sino */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="relative h-9 w-9 grid place-items-center rounded-full hover:bg-slate-100"
              aria-label="Notificações"
            >
              <span className="text-lg">🔔</span>
              {unread.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] grid place-items-center">
                  {unread.length}
                </span>
              )}
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-100 text-sm font-medium text-slate-700">Notificações</div>
                {notes.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">Nada por aqui.</p>
                ) : (
                  <ul className="max-h-96 overflow-auto">
                    {notes.slice(0, 20).map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNote(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${n.readAt ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            {!n.readAt && <span className="h-2 w-2 rounded-full bg-indigo-500" />}
                            <span className="text-sm font-medium text-slate-800">{n.title || 'Aviso'}</span>
                            {n.sourceApp && <span className="ml-auto text-[10px] text-slate-400">{n.sourceApp}</span>}
                          </div>
                          {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Usuário */}
          <div className="flex items-center gap-2">
            <span className="h-9 w-9 grid place-items-center rounded-full bg-slate-800 text-white font-semibold">{initial}</span>
            <div className="hidden sm:block leading-tight">
              <p className="text-sm font-medium text-slate-900">{name}</p>
              <p className="text-xs text-slate-500">
                {memberships.length} {memberships.length === 1 ? 'sistema' : 'sistemas'}
              </p>
            </div>
          </div>

          <button type="button" onClick={logout} className="text-sm text-slate-500 hover:text-slate-800">
            Sair
          </button>
        </div>
      </div>
    </header>
  )
}
