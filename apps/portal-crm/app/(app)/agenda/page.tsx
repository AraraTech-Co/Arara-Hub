'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { arara, useAuth } from '@/lib/arara'
import { formatDate, formatTime } from '@/lib/format'
import { activityLabels } from '@/lib/labels'
import { ActivityIcon } from '@/components/crm/ActivityIcon'

function dayLabel(date: Date, today: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  const s = new Date(date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function AgendaInner() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const status = searchParams.get('status') || ''
  const [activities, setActivities] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    arara
      .activities({ ownerId: user.id })
      .then((r) => {
        if (!cancelled) setActivities(r.data || [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (status === 'pendente') return !a.doneAt
      if (status === 'concluida') return !!a.doneAt
      return true
    })
  }, [activities, status])

  const today = new Date()
  const groups: {
    key: string
    label: string
    items: Record<string, unknown>[]
  }[] = []
  for (const a of filtered) {
    const d = new Date(String(a.scheduledAt))
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, label: dayLabel(d, today), items: [] }
      groups.push(g)
    }
    g.items.push(a)
  }

  async function complete(id: string) {
    try {
      await arara.completeActivity(id)
      setActivities((prev) =>
        prev.map((a) =>
          String(a.id) === id ? { ...a, doneAt: new Date().toISOString() } : a,
        ),
      )
    } catch {
      // ignore
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Carregando agenda…</p>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Agenda &amp; Atividades</h1>
        <Link
          href="/agenda/nova"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg min-h-[44px] inline-flex items-center"
        >
          + Nova Atividade
        </Link>
      </div>

      <div className="flex gap-2">
        {[
          { value: '', label: 'Todas' },
          { value: 'pendente', label: 'Pendentes' },
          { value: 'concluida', label: 'Concluídas' },
        ].map((opt) => {
          const isActive = status === opt.value
          const href = opt.value ? `?status=${opt.value}` : '?'
          return (
            <Link
              key={opt.value || 'all'}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                isActive ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600'
              }`}
            >
              {opt.label}
            </Link>
          )
        })}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500 py-12 text-center">Nenhuma atividade encontrada</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{g.label}</h2>
            <ul className="bg-white rounded-xl border border-gray-200 divide-y">
              {g.items.map((a) => {
                const client = a.client as { name?: string } | null
                return (
                  <li key={String(a.id)} className="flex items-center gap-3 px-4 py-3">
                    <ActivityIcon
                      type={String(a.type)}
                      size={16}
                      className={a.doneAt ? 'text-green-500' : 'text-indigo-500'}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {activityLabels[String(a.type) as keyof typeof activityLabels] || a.type}
                        {client?.name ? ` — ${client.name}` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatTime(String(a.scheduledAt))} · {formatDate(String(a.scheduledAt))}
                      </p>
                    </div>
                    {!a.doneAt && (
                      <button
                        onClick={() => complete(String(a.id))}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Concluir
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Carregando…</p>}>
      <AgendaInner />
    </Suspense>
  )
}
