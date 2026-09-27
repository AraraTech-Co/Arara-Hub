'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminHeader } from '@/components/admin/admin-header'
import {
  CalendarDays, Users, Plus, AlertCircle, Pencil,
  Sun, Moon, Zap, Calendar, List,
} from 'lucide-react'
import { CreateScheduleDialog } from '@/components/schedule/create-schedule-dialog'
import { ScheduleCalendar } from '@/components/schedule/schedule-calendar'
import { DailyShiftDialog } from '@/components/schedule/daily-shift-dialog'
import { useToast } from '@/hooks/use-toast'
import { schedulesApi } from '@/lib/api/schedules'
import { formatDateShort } from '@/lib/utils'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── helpers ────────────────────────────────────────────────────────────────

function weekRange(date: Date) {
  const d = new Date(date)
  const day = d.getDay()                       // 0=Sun
  const mon = new Date(d)
  mon.setDate(d.getDate() - ((day + 6) % 7))  // Monday
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)               // Sunday
  mon.setHours(0, 0, 0, 0)
  sun.setHours(23, 59, 59, 999)
  return { start: mon, end: sun }
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function ptDate(iso: string) {
  return formatDateShort(iso + 'T12:00:00')
}

function monthDays(year: number, month: number) {
  // month is 0-based
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const days: Date[] = []
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d))
  }
  return days
}

const SHIFT_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  morning: { label: 'Diária',  icon: <Sun   className="w-4 h-4" />, color: 'bg-sem-warning  text-sem-warning-fg  border-sem-warning-bd' },
  night:   { label: 'Noturna', icon: <Moon  className="w-4 h-4" />, color: 'bg-status-migration text-status-migration-fg border-status-migration-bd' },
  warroom: { label: 'Warroom', icon: <Zap   className="w-4 h-4" />, color: 'bg-sem-error    text-sem-error-fg    border-sem-error-bd'    },
}

const LEVEL_COLORS: Record<string, string> = {
  n1:     'bg-sem-success  text-sem-success-fg',
  n2:     'bg-sem-info   text-sem-info-fg',
  n3:     'bg-status-triage text-status-triage-fg',
  backup: 'bg-status-waiting text-status-waiting-fg',
}

// ─── component ──────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { toast } = useToast()

  // Weekly schedule state
  const [schedules,        setSchedules]        = useState<any[]>([])
  const [agents,           setAgents]           = useState<any[]>([])
  const [currentSchedule,  setCurrentSchedule]  = useState<any>(null)
  const [showWeeklyDialog, setShowWeeklyDialog] = useState(false)
  const [editingSchedule,  setEditingSchedule]  = useState<any>(null)

  // Daily shift state
  const [dailyShifts,     setDailyShifts]     = useState<any[]>([])
  const [dailyWeekStart,  setDailyWeekStart]  = useState<Date>(() => weekRange(new Date()).start)
  const [showShiftDialog, setShowShiftDialog] = useState(false)
  const [editingShift,    setEditingShift]    = useState<any>(null)
  const [shiftType,       setShiftType]       = useState<'morning' | 'night' | 'warroom'>('morning')

  // Monthly state
  const [monthYear, setMonthYear] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [monthlyShifts, setMonthlyShifts] = useState<any[]>([])

  const [loading, setLoading] = useState(true)

  // ── load weekly ──────────────────────────────────────────────────────────

  const loadWeekly = useCallback(async () => {
    try {
      const [currentRes, schedulesRes, agentsRes] = await Promise.all([
        schedulesApi.getCurrent().catch(() => null),
        schedulesApi.list().catch(() => null),
        araraApiFetch('/api/profiles/agents'),
      ])

      setCurrentSchedule(currentRes?.data ?? null)
      const all = schedulesRes?.data ?? []
      setSchedules(Array.isArray(all) ? all : [])
      const agentsData = agentsRes instanceof Response && agentsRes.ok ? await agentsRes.json() : { data: [] }
      const ag = agentsData?.data ?? (Array.isArray(agentsData) ? agentsData : [])
      setAgents(Array.isArray(ag) ? ag : [])
    } catch {
      // silent
    }
  }, [])

  // ── load daily shifts for current week ──────────────────────────────────

  const loadDailyShifts = useCallback(async (weekStart: Date) => {
    const { start, end } = weekRange(weekStart)
    try {
      const res = await schedulesApi.listDaily({ start: isoDate(start), end: isoDate(end) })
      if (res.data) setDailyShifts(res.data)
    } catch { /* silent */ }
  }, [])

  // ── load shifts for a month ───────────────────────────────────────────

  const loadMonthlyShifts = useCallback(async (year: number, month: number) => {
    const start = new Date(year, month, 1)
    const end   = new Date(year, month + 1, 0)
    try {
      const res = await schedulesApi.listDaily({ start: isoDate(start), end: isoDate(end) })
      if (res.data) setMonthlyShifts(res.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    Promise.all([
      loadWeekly(),
      loadDailyShifts(dailyWeekStart),
      loadMonthlyShifts(monthYear.year, monthYear.month),
    ]).finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── daily week navigation ─────────────────────────────────────────────

  function navigateDailyWeek(delta: number) {
    const next = new Date(dailyWeekStart)
    next.setDate(next.getDate() + delta * 7)
    setDailyWeekStart(next)
    loadDailyShifts(next)
  }

  // ── monthly navigation ────────────────────────────────────────────────

  function navigateMonth(delta: number) {
    let { year, month } = monthYear
    month += delta
    if (month < 0)  { year -= 1; month = 11 }
    if (month > 11) { year += 1; month = 0  }
    setMonthYear({ year, month })
    loadMonthlyShifts(year, month)
  }

  // ── open shift dialog ─────────────────────────────────────────────────

  function openShiftDialog(date: string, type: 'morning' | 'night' | 'warroom', existing?: any) {
    setEditingShift(existing ? { ...existing, date } : { date })
    setShiftType(type)
    setShowShiftDialog(true)
  }

  // ── helpers ───────────────────────────────────────────────────────────

  function shiftsForDate(date: Date, shiftsArr: any[]) {
    const iso = isoDate(date)
    return shiftsArr.filter(s => s.date.split('T')[0] === iso)
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dailyWeekStart)
    d.setDate(dailyWeekStart.getDate() + i)
    return d
  })

  if (loading) {
    return (
      <div className="pt-14 lg:pt-0">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center text-muted-foreground">Carregando...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-8 lg:py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Escala de Suporte</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie todos os tipos de escala da equipe</p>
        </div>

        <Tabs defaultValue="semanal">
          <TabsList className="bg-background border border-border shadow-sm">
            <TabsTrigger value="semanal"  className="gap-1.5"><CalendarDays className="w-4 h-4" />Semanal</TabsTrigger>
            <TabsTrigger value="diaria"   className="gap-1.5"><List          className="w-4 h-4" />Diária</TabsTrigger>
            <TabsTrigger value="mensal"   className="gap-1.5"><Calendar      className="w-4 h-4" />Mensal</TabsTrigger>
            <TabsTrigger value="warroom"  className="gap-1.5"><Zap           className="w-4 h-4" />Warroom</TabsTrigger>
            <TabsTrigger value="noturna"  className="gap-1.5"><Moon          className="w-4 h-4" />Noturna</TabsTrigger>
          </TabsList>

          {/* ─── SEMANAL ─────────────────────────────────────────────────── */}
          <TabsContent value="semanal" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Escala de plantão N1/N2/N3/Backup por semana</p>
              <Button onClick={() => { setEditingSchedule(null); setShowWeeklyDialog(true) }}>
                <Plus className="w-4 h-4 mr-2" />Nova Escala Semanal
              </Button>
            </div>

            {currentSchedule ? (
              <Card className="border p-6 bg-linear-to-br from-blue-50 to-indigo-50 border-sem-info-bd">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-600 rounded-lg">
                      <CalendarDays className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Escala desta Semana</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatDateShort(currentSchedule.week_start, { day: '2-digit', month: 'long' })}
                        {' — '}
                        {formatDateShort(currentSchedule.week_end, { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setEditingSchedule(currentSchedule); setShowWeeklyDialog(true) }}>
                    <Pencil className="w-4 h-4 mr-1.5" />Editar
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'N1 — Suporte',      color: 'bg-green-500',  user: currentSchedule.n1 },
                    { label: 'N2 — Especialista',  color: 'bg-blue-500',   user: currentSchedule.n2 },
                    { label: 'N3 — Dev Suporte',   color: 'bg-purple-500', user: currentSchedule.n3 },
                    { label: 'Backup',             color: 'bg-orange-500', user: currentSchedule.backup },
                  ].map(({ label, color, user }) => (
                    <div key={label} className="p-4 bg-background/70 rounded-lg border border-white/60">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2 h-2 rounded-full ${color}`} />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
                      </div>
                      {user ? (
                        <>
                          <p className="font-semibold text-foreground text-sm">{user.full_name || user.email}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground/70 italic">Não atribuído</p>
                      )}
                    </div>
                  ))}
                </div>

                {currentSchedule.notes && (
                  <div className="mt-4 p-3 bg-sem-warning border border-sem-warning-bd rounded-lg flex gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-sem-warning-fg">Observações</p>
                      <p className="text-sm text-sem-warning-fg">{currentSchedule.notes}</p>
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-10 text-center border-dashed border-2 border-border">
                <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <h3 className="font-semibold text-foreground/80 mb-1">Nenhuma escala para esta semana</h3>
                <p className="text-sm text-muted-foreground/70 mb-4">Crie uma escala para gerenciar o suporte desta semana</p>
                <Button onClick={() => { setEditingSchedule(null); setShowWeeklyDialog(true) }}>
                  <Plus className="w-4 h-4 mr-2" />Criar Escala
                </Button>
              </Card>
            )}

            <ScheduleCalendar
              schedules={schedules}
              currentId={currentSchedule?.id}
              onEdit={(s) => { setEditingSchedule(s); setShowWeeklyDialog(true) }}
            />
          </TabsContent>

          {/* ─── DIÁRIA ──────────────────────────────────────────────────── */}
          <TabsContent value="diaria" className="space-y-6 mt-6">
            {/* Week navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => navigateDailyWeek(-1)}>← Semana ant.</Button>
                <span className="text-sm font-medium text-foreground/80">
                  {formatDateShort(dailyWeekStart, { day: '2-digit', month: 'long' })}
                  {' — '}
                  {(() => { const e = new Date(dailyWeekStart); e.setDate(e.getDate() + 6); return formatDateShort(e, { day: '2-digit', month: 'long', year: 'numeric' }) })()}
                </span>
                <Button variant="outline" size="sm" onClick={() => navigateDailyWeek(1)}>Próx. semana →</Button>
              </div>
              <Button size="sm" onClick={() => openShiftDialog(isoDate(new Date()), 'morning')}>
                <Plus className="w-4 h-4 mr-2" />Adicionar Plantão
              </Button>
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {weekDays.map((day) => {
                const dayShifts = shiftsForDate(day, dailyShifts).filter(s => s.type === 'morning')
                const isToday   = isoDate(day) === isoDate(new Date())
                return (
                  <Card key={day.toISOString()} className={`p-3 ${isToday ? 'ring-2 ring-blue-400' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase">
                          {formatDateShort(day, { weekday: 'short' })}
                        </p>
                        <p className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-foreground'}`}>
                          {formatDateShort(day, { day: '2-digit', month: '2-digit' })}
                        </p>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="w-6 h-6"
                        onClick={() => openShiftDialog(isoDate(day), 'morning', dayShifts[0])}
                      >
                        {dayShifts.length > 0 ? <Pencil className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      </Button>
                    </div>
                    {dayShifts.length > 0 ? (
                      <div className="space-y-1">
                        {dayShifts[0].agents?.map((a: any) => (
                          <div key={a.id} className="text-xs text-foreground/60 truncate">
                            {a.full_name || a.email}
                          </div>
                        ))}
                        {dayShifts[0].notes && (
                          <p className="text-xs text-muted-foreground/70 italic truncate">{dayShifts[0].notes}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground/50 italic">Sem escala</p>
                    )}
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          {/* ─── MENSAL ──────────────────────────────────────────────────── */}
          <TabsContent value="mensal" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => navigateMonth(-1)}>← Mês ant.</Button>
                <span className="text-sm font-medium text-foreground/80 capitalize">
                  {formatDateShort(new Date(monthYear.year, monthYear.month, 1), { month: 'long', year: 'numeric' })}
                </span>
                <Button variant="outline" size="sm" onClick={() => navigateMonth(1)}>Próx. mês →</Button>
              </div>
            </div>

            {/* Calendar grid */}
            <Card className="p-4">
              {/* Day-of-week header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground/70 py-1">{d}</div>
                ))}
              </div>
              {/* Weeks */}
              {(() => {
                const days = monthDays(monthYear.year, monthYear.month)
                // Pad to start on Monday
                const firstDay = (days[0].getDay() + 6) % 7  // 0=Mon
                const padded: (Date | null)[] = [
                  ...Array(firstDay).fill(null),
                  ...days,
                ]
                // Pad end to full weeks
                while (padded.length % 7 !== 0) padded.push(null)

                const weeks: (Date | null)[][] = []
                for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))

                return weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                    {week.map((day, di) => {
                      if (!day) return <div key={di} className="h-16 rounded bg-muted/50" />
                      const shifts = shiftsForDate(day, monthlyShifts)
                      const isToday = isoDate(day) === isoDate(new Date())
                      return (
                        <div
                          key={di}
                          className={`h-16 rounded border p-1 cursor-pointer hover:border-blue-300 transition-colors ${
                            isToday ? 'border-blue-400 bg-sem-info' : 'border-border/50'
                          }`}
                          onClick={() => openShiftDialog(isoDate(day), 'morning', shifts.find(s => s.type === 'morning'))}
                        >
                          <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-blue-600' : 'text-foreground/60'}`}>
                            {day.getDate()}
                          </p>
                          <div className="space-y-0.5">
                            {shifts.slice(0, 2).map(s => (
                              <div key={s.id} className={`text-xs px-1 rounded truncate border ${SHIFT_LABELS[s.type]?.color}`}>
                                {SHIFT_LABELS[s.type]?.label} {s.agents?.length > 0 && `(${s.agents.length})`}
                              </div>
                            ))}
                            {shifts.length > 2 && (
                              <div className="text-xs text-muted-foreground/70">+{shifts.length - 2}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))
              })()}
            </Card>
          </TabsContent>

          {/* ─── WARROOM ─────────────────────────────────────────────────── */}
          <TabsContent value="warroom" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Escalas de incidentes críticos / war room</p>
              </div>
              <Button size="sm" onClick={() => openShiftDialog(isoDate(new Date()), 'warroom')}>
                <Plus className="w-4 h-4 mr-2" />Adicionar Warroom
              </Button>
            </div>

            <ShiftList
              shifts={dailyShifts.filter(s => s.type === 'warroom')}
              type="warroom"
              onEdit={(s) => openShiftDialog(s.date.split('T')[0], 'warroom', s)}
            />
          </TabsContent>

          {/* ─── NOTURNA ─────────────────────────────────────────────────── */}
          <TabsContent value="noturna" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Escalas de plantão noturno</p>
              </div>
              <Button size="sm" onClick={() => openShiftDialog(isoDate(new Date()), 'night')}>
                <Plus className="w-4 h-4 mr-2" />Adicionar Noturna
              </Button>
            </div>

            <ShiftList
              shifts={dailyShifts.filter(s => s.type === 'night')}
              type="night"
              onEdit={(s) => openShiftDialog(s.date.split('T')[0], 'night', s)}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Weekly dialog */}
      <CreateScheduleDialog
        open={showWeeklyDialog}
        onOpenChange={setShowWeeklyDialog}
        agents={agents}
        existingSchedule={editingSchedule}
        onSuccess={() => { setShowWeeklyDialog(false); setEditingSchedule(null); loadWeekly() }}
      />

      {/* Daily/Night/Warroom shift dialog */}
      <DailyShiftDialog
        open={showShiftDialog}
        onOpenChange={setShowShiftDialog}
        agents={agents}
        type={shiftType}
        existingShift={editingShift}
        onSuccess={() => {
          setShowShiftDialog(false)
          setEditingShift(null)
          loadDailyShifts(dailyWeekStart)
          loadMonthlyShifts(monthYear.year, monthYear.month)
          toast({ title: 'Escala salva com sucesso' })
        }}
      />
    </div>
  )
}

// ─── ShiftList sub-component ─────────────────────────────────────────────────

function ShiftList({ shifts, type, onEdit }: {
  shifts: any[]
  type: 'morning' | 'night' | 'warroom'
  onEdit: (s: any) => void
}) {
  const { label, icon, color } = SHIFT_LABELS[type]

  if (shifts.length === 0) {
    return (
      <Card className="p-10 text-center border-dashed border-2 border-border">
        <div className="text-muted-foreground/50 flex justify-center mb-3">{icon}</div>
        <p className="text-sm text-muted-foreground/70">Nenhuma escala {label.toLowerCase()} cadastrada</p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {shifts
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(s => (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={`gap-1 ${color}`}>
                  {icon}{label}
                </Badge>
                <span className="text-sm font-semibold text-foreground/80">
                  {ptDate(s.date.split('T')[0])}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>
                <Pencil className="w-3.5 h-3.5 mr-1" />Editar
              </Button>
            </div>
            {s.agents?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.agents.map((a: any) => (
                  <Badge key={a.id} variant="secondary" className="text-xs">
                    {a.full_name || a.email}
                  </Badge>
                ))}
              </div>
            )}
            {s.notes && (
              <p className="mt-2 text-xs text-muted-foreground italic">{s.notes}</p>
            )}
          </Card>
        ))}
    </div>
  )
}
