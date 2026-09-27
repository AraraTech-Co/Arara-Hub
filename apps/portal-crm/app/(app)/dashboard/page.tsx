'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { arara, useAuth } from '@/lib/arara'
import { formatBRL, formatBRLCompact, formatTime } from '@/lib/format'
import { activityLabels } from '@/lib/labels'
import { ActivityIcon } from '@/components/crm/ActivityIcon'

function greeting(hour: number): string {
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const userId = user?.id || ''
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const [deals, setDeals] = useState<Record<string, unknown>[]>([])
  const [activities, setActivities] = useState<Record<string, unknown>[]>([])
  const [goal, setGoal] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([
      arara.deals({ status: 'all' }),
      arara.activities({ ownerId: userId }),
      arara.goals({
        userId,
        periodMonth: String(month),
        periodYear: String(year),
      }),
    ])
      .then(([d, a, g]) => {
        if (cancelled) return
        setDeals(d.data || [])
        setActivities(a.data || [])
        setGoal((g.data || [])[0] || null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, month, year])

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const stats = useMemo(() => {
    const mine = deals.filter((d) => String(d.ownerId) === userId)
    const wonDeals = mine.filter((d) => {
      if (d.status !== 'won') return false
      const closed = d.closedAt ? new Date(String(d.closedAt)) : null
      return closed && closed >= startOfMonth && closed <= endOfMonth
    })
    const totalVendido = wonDeals.reduce((s, d) => s + Number(d.value ?? 0), 0)
    const openDeals = mine.filter((d) => d.status === 'open').length
    const todayActivities = activities.filter((a) => {
      const t = new Date(String(a.scheduledAt))
      return t >= todayStart && t <= todayEnd
    })
    const metaValue = goal ? Number(goal.targetValue) : 0
    const pct = metaValue > 0 ? Math.min(100, Math.round((totalVendido / metaValue) * 100)) : 0
    return { totalVendido, openDeals, todayActivities, metaValue, pct }
  }, [deals, activities, goal, userId, startOfMonth, endOfMonth, todayStart, todayEnd])

  const name = (profile?.fullName || user?.name || 'Vendedor').split(' ')[0]

  if (loading) {
    return <p className="text-sm text-gray-500">Carregando dashboard…</p>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">
        {greeting(now.getHours())}, {name}
      </h1>

      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/clientes/novo"
          className="flex flex-col gap-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-4 min-h-[80px]"
        >
          <span className="text-sm font-semibold">Novo Cliente</span>
          <span className="text-xs text-indigo-200">Cadastrar lead ou cliente</span>
        </Link>
        <Link
          href="/pipeline/novo"
          className="flex flex-col gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-5 py-4 min-h-[80px]"
        >
          <span className="text-sm font-semibold">Lançar Venda</span>
          <span className="text-xs text-emerald-200">Registrar negociação</span>
        </Link>
        <Link
          href="/agenda/nova"
          className="flex flex-col gap-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-5 py-4 min-h-[80px]"
        >
          <span className="text-sm font-semibold">Lançar Visita</span>
          <span className="text-xs text-amber-100">Agendar visita a cliente</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Vendido no mês" value={formatBRL(stats.totalVendido)} />
        <KpiCard
          label="Meta atingida"
          value={`${stats.pct}%`}
          sub={stats.metaValue > 0 ? `Meta: ${formatBRLCompact(stats.metaValue)}` : 'Sem meta'}
          colorClass={stats.pct >= 100 ? 'text-green-600' : 'text-indigo-600'}
        />
        <KpiCard label="Deals abertos" value={String(stats.openDeals)} />
        <KpiCard label="Atividades hoje" value={String(stats.todayActivities.length)} />
      </div>

      {stats.metaValue > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-gray-700">
              Progresso da meta — {month}/{year}
            </span>
            <span className="text-sm font-semibold text-indigo-600">{stats.pct}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stats.pct >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${stats.pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-gray-900">Atividades de hoje</h2>
          <Link href="/agenda" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            Ver tudo →
          </Link>
        </div>
        {stats.todayActivities.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">Dia livre de atividades!</p>
        ) : (
          <ul className="space-y-3">
            {stats.todayActivities.map((a) => {
              const client = a.client as { name?: string } | null
              return (
                <li key={String(a.id)} className="flex items-start gap-3">
                  <ActivityIcon
                    type={String(a.type)}
                    size={14}
                    className={`mt-0.5 shrink-0 ${a.doneAt ? 'text-green-500' : 'text-indigo-400'}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {activityLabels[String(a.type) as keyof typeof activityLabels] || a.type}
                      {client?.name ? ` — ${client.name}` : ''}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatTime(String(a.scheduledAt))}
                      {a.doneAt ? ' · Concluída' : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string
  value: string
  sub?: string
  colorClass?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p
        className={`text-2xl xl:text-3xl font-bold leading-none tabular-nums whitespace-nowrap ${colorClass ?? 'text-gray-900'}`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
    </div>
  )
}
