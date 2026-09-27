'use client'

import { useState, useMemo } from 'react'
import { adminSlaCalendarApi } from '@/lib/api/admin'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronLeft, ChevronRight, Plus, Trash2, RefreshCw, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlaException {
  id: string
  date: string | Date
  name: string
  type: string
  fullDay: boolean
  startTime: string | null
  endTime: string | null
  recurrent: boolean
  active: boolean
  createdAt: string | Date
}

interface Props {
  initialExceptions: SlaException[]
  currentYear: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function toDateStr(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toISOString().slice(0, 10)
}

function typeLabel(type: string): string {
  if (type === 'holiday') return 'Feriado'
  if (type === 'maintenance') return 'Manutenção'
  return 'Personalizado'
}

function typeBadgeClass(type: string): string {
  if (type === 'holiday') return 'bg-red-900/50 text-red-300 border-red-700/50'
  if (type === 'maintenance') return 'bg-orange-900/50 text-orange-300 border-orange-700/50'
  return 'bg-blue-900/50 text-blue-300 border-blue-700/50'
}

function cellClass(type: string): string {
  if (type === 'holiday') return 'bg-red-900/60 text-red-200 ring-1 ring-red-700/60'
  if (type === 'maintenance') return 'bg-orange-900/60 text-orange-200 ring-1 ring-orange-700/60'
  return 'bg-blue-900/60 text-blue-200 ring-1 ring-blue-700/60'
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

// ─── Mini Month Grid ──────────────────────────────────────────────────────────

interface MonthGridProps {
  year: number
  month: number
  exceptions: SlaException[]
  selectedMonth: number | null
  onSelectMonth: (m: number) => void
}

function MonthGrid({ year, month, exceptions, selectedMonth, onSelectMonth }: MonthGridProps) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstWeekday(year, month)

  const exMap: Record<string, SlaException> = {}
  for (const ex of exceptions) {
    const ds = toDateStr(ex.date)
    const [, m, d] = ds.split('-')
    // Recurrent: match month+day; otherwise match full date
    if (ex.recurrent) {
      const key = `${year}-${m}-${d}`
      exMap[key] = ex
    } else {
      exMap[ds] = ex
    }
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const isSelected = selectedMonth === month

  return (
    <div
      className={cn(
        'rounded-lg border cursor-pointer transition-colors',
        isSelected
          ? 'border-indigo-500/60 bg-muted/40'
          : 'border-border bg-muted/40 hover:bg-muted'
      )}
      onClick={() => onSelectMonth(isSelected ? -1 : month)}
    >
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground/50 uppercase tracking-wide">
          {MONTHS[month]}
        </span>
      </div>
      <div className="p-2">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map((wd, i) => (
            <div key={i} className="text-center text-[9px] text-muted-foreground font-medium">
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const ex = exMap[dateStr]
            const isToday = dateStr === todayStr

            return (
              <div
                key={i}
                className={cn(
                  'w-5 h-5 flex items-center justify-center rounded text-[9px] font-medium transition-colors',
                  ex ? cellClass(ex.type) : 'text-muted-foreground/70',
                  isToday && !ex && 'ring-1 ring-indigo-500 text-indigo-300'
                )}
                title={ex ? ex.name : undefined}
              >
                {day}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SlaCalendarClient({ initialExceptions, currentYear }: Props) {
  const [year, setYear] = useState(currentYear)
  const [exceptions, setExceptions] = useState<SlaException[]>(initialExceptions)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    date: '',
    name: '',
    type: 'holiday',
    full_day: true,
    recurrent: false,
    start_time: '',
    end_time: '',
  })

  // Filter exceptions for current year (and recurrent ones)
  const visibleExceptions = useMemo(() => {
    return exceptions.filter((ex) => {
      const ds = toDateStr(ex.date)
      const exYear = parseInt(ds.slice(0, 4))
      if (ex.recurrent) return true
      return exYear === year
    })
  }, [exceptions, year])

  // Filter by selected month
  const listedExceptions = useMemo(() => {
    if (selectedMonth === null || selectedMonth === -1) return visibleExceptions
    return visibleExceptions.filter((ex) => {
      const ds = toDateStr(ex.date)
      const exMonth = parseInt(ds.slice(5, 7)) - 1
      return exMonth === selectedMonth
    })
  }, [visibleExceptions, selectedMonth])

  async function handleAdd() {
    if (!form.date || !form.name.trim()) return
    setSaving(true)
    try {
      const { data } = await adminSlaCalendarApi.create({
        date: form.date,
        description: form.name.trim(),
        type: form.type,
      })
      setExceptions((prev) => [...prev, data].sort((a, b) => toDateStr(a.date).localeCompare(toDateStr(b.date))))
      setShowDialog(false)
      setForm({ date: '', name: '', type: 'holiday', full_day: true, recurrent: false, start_time: '', end_time: '' })
    } catch {
      // ignore – mantém dialog aberto
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await adminSlaCalendarApi.delete(id)
      setExceptions((prev) => prev.filter((e) => e.id !== id))
    } catch {
      // ignore
    } finally {
      setDeletingId(null)
    }
  }

  function handleSelectMonth(m: number) {
    setSelectedMonth(m === -1 || selectedMonth === m ? null : m)
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-foreground">Calendário de Exceções SLA</h1>
        <p className="text-sm text-muted-foreground/70 mt-1">Feriados, manutenções e datas que pausam o cômputo de SLA</p>
      </div>

      <div className="container mx-auto p-6 space-y-6">
        {/* Year Nav + Add Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="border-border bg-background hover:bg-muted"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xl font-bold text-foreground w-16 text-center">{year}</span>
            <Button
              variant="outline"
              size="icon"
              className="border-border bg-background hover:bg-muted"
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <span className="w-3 h-3 rounded bg-red-900/60 ring-1 ring-red-700/60 inline-block" /> Feriado
              <span className="w-3 h-3 rounded bg-orange-900/60 ring-1 ring-orange-700/60 inline-block ml-2" /> Manutenção
              <span className="w-3 h-3 rounded bg-blue-900/60 ring-1 ring-blue-700/60 inline-block ml-2" /> Personalizado
            </div>
            <Button
              onClick={() => setShowDialog(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar exceção
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Grid — left 2/3 */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 12 }, (_, m) => (
                <MonthGrid
                  key={m}
                  year={year}
                  month={m}
                  exceptions={visibleExceptions}
                  selectedMonth={selectedMonth ?? -1}
                  onSelectMonth={handleSelectMonth}
                />
              ))}
            </div>
            {selectedMonth !== null && (
              <p className="text-xs text-muted-foreground mt-2">
                Clique no mês para filtrar a lista. Clique novamente para limpar.
              </p>
            )}
          </div>

          {/* Exception List — right 1/3 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground/50 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                {selectedMonth !== null
                  ? `${MONTHS[selectedMonth]} — ${listedExceptions.length} exceção(ões)`
                  : `Todas — ${listedExceptions.length} exceção(ões)`}
              </h3>
              {selectedMonth !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground/70 hover:text-foreground h-6 px-2"
                  onClick={() => setSelectedMonth(null)}
                >
                  Limpar filtro
                </Button>
              )}
            </div>

            {listedExceptions.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                Nenhuma exceção {selectedMonth !== null ? `em ${MONTHS[selectedMonth]}` : 'cadastrada'}
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {listedExceptions.map((ex) => {
                  const ds = toDateStr(ex.date)
                  const [, mo, dy] = ds.split('-')
                  return (
                    <div
                      key={ex.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 group"
                    >
                      {/* Date badge */}
                      <div className="flex-shrink-0 text-center">
                        <div className="text-xs text-muted-foreground/70 uppercase">
                          {MONTHS[parseInt(mo) - 1].slice(0, 3)}
                        </div>
                        <div className="text-lg font-bold text-foreground leading-none">{dy}</div>
                        {ex.recurrent && (
                          <div title="Recorrente anualmente">
                            <RefreshCw className="w-3 h-3 text-muted-foreground mx-auto mt-0.5" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{ex.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={cn('text-xs px-1.5 py-0.5 rounded border', typeBadgeClass(ex.type))}>
                            {typeLabel(ex.type)}
                          </span>
                          {!ex.fullDay && ex.startTime && (
                            <span className="text-xs text-muted-foreground">
                              {ex.startTime}–{ex.endTime}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-sem-error-fg"
                        onClick={() => handleDelete(ex.id)}
                        disabled={deletingId === ex.id}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Exception Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Nova exceção de SLA</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground/50">Data *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="bg-background border-border text-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground/50">Nome *</Label>
              <Input
                placeholder="Ex: Natal, Manutenção Programada..."
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground/50">Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border-border">
                  <SelectItem value="holiday">Feriado</SelectItem>
                  <SelectItem value="maintenance">Manutenção</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="full_day"
                  checked={form.full_day}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, full_day: !!v }))}
                  className="border-border"
                />
                <Label htmlFor="full_day" className="text-muted-foreground/50 cursor-pointer">
                  Dia inteiro
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="recurrent"
                  checked={form.recurrent}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, recurrent: !!v }))}
                  className="border-border"
                />
                <Label htmlFor="recurrent" className="text-muted-foreground/50 cursor-pointer">
                  Recorrente anualmente
                </Label>
              </div>
            </div>

            {!form.full_day && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground/50">Início</Label>
                  <Input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                    className="bg-background border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground/50">Fim</Label>
                  <Input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                    className="bg-background border-border text-foreground"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              className="border-border text-muted-foreground/50 hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || !form.date || !form.name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? 'Salvando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
