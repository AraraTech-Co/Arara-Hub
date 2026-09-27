'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BookOpen, Coffee, Headphones, Timer, Play, Pause, RotateCcw,
  CheckCircle2, TrendingUp, AlertTriangle, Users, Zap, Moon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── Constants ───────────────────────────────────────────────────────────────
const POMODORO_WORK_SEC  = 25 * 60
const POMODORO_SHORT_SEC =  5 * 60
const POMODORO_LONG_SEC  = 15 * 60
const SESSIONS_GOAL      = 4
const MIN_STUDY_MIN      = 60

// ─── Types ────────────────────────────────────────────────────────────────────
type AgentStatus  = 'working' | 'studying' | 'lunch' | 'break' | 'offline'
type PomodoroPhase = 'work' | 'short_break' | 'long_break'

interface Session { profileId: string; date: string; minutes: number; pomodoroCount: number }
interface StatusRow { profileId: string; status: AgentStatus; studyStartedAt: string | null }

interface Props {
  agents: { id: string; full_name: string | null; email: string; role: string }[]
  currentUserId: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10) }

function getWeekDates() {
  const now = new Date()
  const day = now.getDay() === 0 ? 7 : now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() - (day - 1))
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function formatTime(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

function elapsedMin(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

const statusConfig: Record<AgentStatus, { label: string; color: string; dot: string; icon: React.ElementType }> = {
  working:  { label: 'Cobrindo suporte', color: 'bg-sem-success text-sem-success-fg border-sem-success-bd', dot: 'bg-emerald-500', icon: Headphones },
  studying: { label: 'Estudando',        color: 'bg-status-migration text-status-migration-fg border-status-migration-bd', dot: 'bg-indigo-500',  icon: BookOpen },
  lunch:    { label: 'Almoço',           color: 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd',       dot: 'bg-amber-400',   icon: Coffee },
  break:    { label: 'Pausa',            color: 'bg-muted text-foreground/60 border-border',       dot: 'bg-muted-foreground/60',   icon: Moon },
  offline:  { label: 'Offline',          color: 'bg-muted text-muted-foreground/70 border-border',       dot: 'bg-muted-foreground/40',   icon: Moon },
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ProductivityPanel({ agents, currentUserId }: Props) {
  // DB state
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, StatusRow>>({})
  const [loading,   setLoading]   = useState(true)

  // Pomodoro (client only)
  const [pomSec,     setPomSec]     = useState(POMODORO_WORK_SEC)
  const [pomRunning, setPomRunning] = useState(false)
  const [pomPhase,   setPomPhase]   = useState<PomodoroPhase>('work')
  const [pomCount,   setPomCount]   = useState(0)
  const intervalRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Fetch from API ────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [sRes, stRes] = await Promise.all([
      araraApiFetch('/api/productivity/sessions'),
      araraApiFetch('/api/productivity/status'),
    ])
    if (sRes.ok)  { const j = await sRes.json();  setSessions(j.data ?? []) }
    if (stRes.ok) {
      const j = await stRes.json()
      const map: Record<string, StatusRow> = {}
      for (const r of (j.data ?? [])) map[r.profileId] = r
      setStatusMap(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Poll every 20s to get other agents' status updates
  useEffect(() => {
    const iv = setInterval(fetchAll, 20_000)
    return () => clearInterval(iv)
  }, [fetchAll])

  // ─── Save session minutes to API ───────────────────────────────────────
  const saveMinutes = useCallback(async (minutes: number, pomodoroCount = 0) => {
    await araraApiFetch('/api/productivity/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes, pomodoroCount }),
    })
    // optimistic local update
    setSessions(prev => {
      const d = today()
      const existing = prev.find(s => s.profileId === currentUserId && s.date === d)
      if (existing) {
        return prev.map(s =>
          s.profileId === currentUserId && s.date === d
            ? { ...s, minutes: s.minutes + minutes, pomodoroCount: s.pomodoroCount + pomodoroCount }
            : s
        )
      }
      return [...prev, { profileId: currentUserId, date: d, minutes, pomodoroCount }]
    })
  }, [currentUserId])

  // ─── Save status to API ────────────────────────────────────────────────
  const saveStatus = useCallback(async (status: AgentStatus) => {
    const studyStartedAt = status === 'studying' ? new Date().toISOString() : null

    // if leaving studying, record elapsed minutes
    const cur = statusMap[currentUserId]
    if (cur?.status === 'studying' && cur.studyStartedAt && status !== 'studying') {
      const min = elapsedMin(cur.studyStartedAt)
      if (min > 0) await saveMinutes(min)
    }

    await araraApiFetch('/api/productivity/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, studyStartedAt }),
    })

    setStatusMap(prev => ({
      ...prev,
      [currentUserId]: { profileId: currentUserId, status, studyStartedAt },
    }))
  }, [currentUserId, statusMap, saveMinutes])

  // ─── Pomodoro tick ────────────────────────────────────────────────────
  useEffect(() => {
    if (!pomRunning) return
    intervalRef.current = setInterval(() => {
      setPomSec(prev => {
        if (prev > 1) return prev - 1
        clearInterval(intervalRef.current!)
        setPomRunning(false)
        if (pomPhase === 'work') {
          const next = pomCount + 1
          setPomCount(next)
          saveMinutes(25, 1)
          if (next % 4 === 0) { setPomPhase('long_break');  return POMODORO_LONG_SEC  }
          else                 { setPomPhase('short_break'); return POMODORO_SHORT_SEC }
        } else {
          setPomPhase('work'); return POMODORO_WORK_SEC
        }
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [pomRunning, pomPhase, pomCount, saveMinutes])

  function pomReset() {
    clearInterval(intervalRef.current!)
    setPomRunning(false); setPomPhase('work'); setPomSec(POMODORO_WORK_SEC)
  }

  function switchPhase(p: PomodoroPhase) {
    pomReset(); setPomPhase(p)
    setPomSec(p === 'work' ? POMODORO_WORK_SEC : p === 'short_break' ? POMODORO_SHORT_SEC : POMODORO_LONG_SEC)
  }

  // ─── Derived ──────────────────────────────────────────────────────────
  const getStatus = (id: string): AgentStatus => statusMap[id]?.status ?? 'working'

  const studying  = agents.filter(a => getStatus(a.id) === 'studying')
  const covering  = agents.filter(a => getStatus(a.id) === 'working')
  const onLunch   = agents.filter(a => getStatus(a.id) === 'lunch')

  const weekDates = getWeekDates()

  function agentWeek(id: string) {
    const week = new Set(weekDates)
    return sessions.filter(s => s.profileId === id && week.has(s.date))
  }

  const mySessions = agentWeek(currentUserId)
  const myWeekMin  = mySessions.reduce((s, x) => s + x.minutes, 0)
  const myGoalOk   = mySessions.filter(s => s.minutes >= MIN_STUDY_MIN).length

  const pomPhaseLabel: Record<PomodoroPhase, string> = {
    work: 'Foco', short_break: 'Pausa curta', long_break: 'Pausa longa',
  }
  const pomColors: Record<PomodoroPhase, string> = {
    work: 'text-indigo-600', short_break: 'text-sem-success-fg', long_break: 'text-sem-warning-fg',
  }
  const pomTotal = pomPhase === 'work' ? POMODORO_WORK_SEC : pomPhase === 'short_break' ? POMODORO_SHORT_SEC : POMODORO_LONG_SEC
  const pomPct   = ((pomTotal - pomSec) / pomTotal) * 100

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-muted-foreground/70">Carregando...</div>
  )

  return (
    <div className="space-y-6">
      {/* ── Team overview ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Cobrindo suporte', count: covering.length, names: covering, color: 'emerald', Icon: Headphones },
          { label: 'Estudando agora',  count: studying.length, names: studying,  color: 'indigo',  Icon: BookOpen },
          { label: 'Almoço',          count: onLunch.length,  names: onLunch,   color: 'amber',   Icon: Coffee },
        ].map(({ label, count, names, color, Icon }) => (
          <Card key={label} className={`border-${color}-200 bg-${color}-50/50`}>
            <CardHeader className="pb-2">
              <CardTitle className={`flex items-center gap-2 text-sm text-${color}-700`}>
                <Icon className="h-4 w-4" /> {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold text-${color}-700`}>{count}</div>
              <p className={`mt-1 text-xs text-${color}-600 truncate`}>
                {names.map(a => a.full_name?.split(' ')[0] ?? a.email).join(', ') || 'Ninguém'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {studying.length > 0 && covering.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-sem-error-bd bg-sem-error px-4 py-3 text-sm text-sem-error-fg">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><strong>Atenção:</strong> Alguém está estudando mas não há ninguém cobrindo o suporte!</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── Agent cards ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <Users className="h-4 w-4" /> Equipe
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {agents.map(agent => {
              const st       = getStatus(agent.id)
              const cfg      = statusConfig[st]
              const Icon     = cfg.icon
              const isMe     = agent.id === currentUserId
              const wSess    = agentWeek(agent.id)
              const wGoals   = wSess.filter(s => s.minutes >= MIN_STUDY_MIN).length
              const wMin     = wSess.reduce((s, x) => s + x.minutes, 0)
              const sRow     = statusMap[agent.id]
              const liveMin  = st === 'studying' && sRow?.studyStartedAt ? elapsedMin(sRow.studyStartedAt) : 0

              return (
                <div key={agent.id} className={`rounded-2xl border p-4 bg-background transition ${isMe ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-semibold text-foreground ${isMe ? 'bg-indigo-600' : 'bg-muted'}`}>
                        {(agent.full_name ?? agent.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">
                          {agent.full_name ?? agent.email}
                          {isMe && <span className="ml-1 text-xs text-indigo-400">(você)</span>}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                          <span className="text-xs text-muted-foreground">{cfg.label}</span>
                          {liveMin > 0 && <span className="text-xs text-indigo-500">· {liveMin}min</span>}
                        </div>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                      <Icon className="inline h-3 w-3 mr-0.5" />{cfg.label}
                    </span>
                  </div>

                  {/* Week tracker */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Sessões ≥1h esta semana</span>
                      <span className={`font-semibold ${wGoals >= SESSIONS_GOAL ? 'text-sem-success-fg' : 'text-foreground/80'}`}>
                        {wGoals}/{SESSIONS_GOAL}{wGoals >= SESSIONS_GOAL ? ' ✓' : ''}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {weekDates.map((d, i) => {
                        const s = wSess.find(x => x.date === d)
                        const min = s?.minutes ?? 0
                        const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
                        return (
                          <div key={d} className="flex flex-1 flex-col items-center gap-0.5">
                            <div className={`h-2.5 w-full rounded-full ${min >= MIN_STUDY_MIN ? 'bg-emerald-400' : min > 0 ? 'bg-amber-300' : 'bg-muted'}`} />
                            <span className="text-[10px] text-muted-foreground/70">{labels[i]}</span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground/70">
                      {Math.floor(wMin / 60)}h{wMin % 60 > 0 ? ` ${wMin % 60}min` : ''} estudados esta semana
                    </p>
                  </div>

                  {/* Controls — only for current user */}
                  {isMe && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(['working', 'studying', 'lunch', 'break'] as AgentStatus[]).map(s => (
                        <button
                          key={s}
                          onClick={() => {
                            saveStatus(s)
                            if (s === 'studying') { pomReset(); setPomRunning(false) }
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition border ${
                            st === s
                              ? `${statusConfig[s].color} border-current`
                              : 'border-border bg-muted/50 text-foreground/60 hover:bg-muted'
                          }`}
                        >
                          {statusConfig[s].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Pomodoro + Weekly goal ───────────────────────────────────── */}
        <div className="space-y-4">
          {/* Pomodoro */}
          <Card className={`border-2 ${pomPhase === 'work' ? 'border-indigo-200' : pomPhase === 'short_break' ? 'border-sem-success-bd' : 'border-sem-warning-bd'}`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Timer className="h-4 w-4" /> Pomodoro — {pomPhaseLabel[pomPhase]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex rounded-xl bg-muted p-1 gap-1">
                {(['work', 'short_break', 'long_break'] as PomodoroPhase[]).map(p => (
                  <button
                    key={p}
                    onClick={() => switchPhase(p)}
                    className={`flex-1 rounded-lg py-1 text-xs font-medium transition ${pomPhase === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground/80'}`}
                  >
                    {p === 'work' ? '25min' : p === 'short_break' ? '5min' : '15min'}
                  </button>
                ))}
              </div>

              <div className="text-center">
                <div className={`text-6xl font-bold tabular-nums ${pomColors[pomPhase]}`}>
                  {formatTime(pomSec)}
                </div>
                <Progress value={pomPct} className="mt-3 h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {pomCount} pomodoro{pomCount !== 1 ? 's' : ''} hoje · salvo no banco ✓
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant={pomRunning ? 'outline' : 'default'}
                  onClick={() => {
                    if (!pomRunning && getStatus(currentUserId) !== 'studying') {
                      saveStatus('studying')
                    }
                    setPomRunning(r => !r)
                  }}
                >
                  {pomRunning
                    ? <><Pause className="mr-2 h-4 w-4" />Pausar</>
                    : <><Play  className="mr-2 h-4 w-4" />Iniciar</>
                  }
                </Button>
                <Button variant="outline" size="icon" onClick={pomReset}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground/70">
                Ao iniciar, status muda para <strong>Estudando</strong>. Minutos são salvos no banco ao completar cada ciclo.
              </p>
            </CardContent>
          </Card>

          {/* Weekly goal */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" /> Minha meta semanal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/60">Sessões ≥1h</span>
                <span className={`text-2xl font-bold ${myGoalOk >= SESSIONS_GOAL ? 'text-sem-success-fg' : 'text-foreground'}`}>
                  {myGoalOk} <span className="text-sm font-normal text-muted-foreground/70">/ {SESSIONS_GOAL}</span>
                </span>
              </div>
              <Progress value={(myGoalOk / SESSIONS_GOAL) * 100} className="h-2" />

              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground/60">Total estudado</span>
                <span className="font-semibold text-foreground">
                  {Math.floor(myWeekMin / 60)}h{myWeekMin % 60 > 0 ? ` ${myWeekMin % 60}min` : ''}
                </span>
              </div>

              {/* Day breakdown */}
              <div className="space-y-2">
                {weekDates.map((d, i) => {
                  const s   = mySessions.find(x => x.date === d)
                  const min = s?.minutes ?? 0
                  const ok  = min >= MIN_STUDY_MIN
                  const labels = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']
                  const isToday = d === today()
                  return (
                    <div key={d} className="flex items-center gap-2">
                      <span className={`w-14 text-xs ${isToday ? 'font-semibold text-indigo-600' : 'text-muted-foreground'}`}>
                        {labels[i]}
                      </span>
                      <div className="flex-1 rounded-full bg-muted h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${ok ? 'bg-emerald-500' : min > 0 ? 'bg-amber-400' : ''}`}
                          style={{ width: `${Math.min((min / MIN_STUDY_MIN) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs text-muted-foreground">
                        {min > 0 ? `${min}min` : '—'}
                      </span>
                      {ok && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                    </div>
                  )
                })}
              </div>

              {myGoalOk >= SESSIONS_GOAL ? (
                <div className="flex items-center gap-2 rounded-xl bg-sem-success px-3 py-2 text-sm text-sem-success-fg">
                  <Zap className="h-4 w-4 shrink-0" /> Meta da semana batida! 🎉
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm text-foreground/60">
                  <BookOpen className="h-4 w-4 shrink-0" />
                  Faltam <strong className="mx-1">{SESSIONS_GOAL - myGoalOk}</strong> sessão(ões) de ≥1h esta semana
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
