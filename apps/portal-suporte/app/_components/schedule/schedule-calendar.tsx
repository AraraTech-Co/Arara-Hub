'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Pencil } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

interface ScheduleCalendarProps {
  schedules: any[]
  currentId?: string
  onEdit?: (schedule: any) => void
}

const LEVEL_COLORS: Record<string, string> = {
  n1:     'bg-sem-success  text-sem-success-fg  border-sem-success-bd',
  n2:     'bg-sem-info   text-sem-info-fg   border-sem-info-bd',
  n3:     'bg-status-triage text-status-triage-fg border-status-triage-bd',
  backup: 'bg-status-waiting text-status-waiting-fg border-status-waiting-bd',
}

const LEVEL_LABELS: Record<string, string> = {
  n1: 'N1', n2: 'N2', n3: 'N3', backup: 'Backup',
}

export function ScheduleCalendar({ schedules, currentId, onEdit }: ScheduleCalendarProps) {
  if (schedules.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Calendar className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
        <p className="text-muted-foreground/70">Nenhuma escala cadastrada ainda.</p>
      </Card>
    )
  }

  // Sort descending so most recent is first
  const sorted = [...schedules].sort(
    (a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime()
  )

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <Calendar className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Todas as Escalas</h2>
        <span className="text-sm text-muted-foreground/70">({schedules.length})</span>
      </div>

      <div className="space-y-3">
        {sorted.map((schedule) => {
          const isCurrent = schedule.id === currentId
          return (
            <div
              key={schedule.id}
              className={`p-4 border rounded-lg transition-colors ${
                isCurrent
                  ? 'border-sem-info-bd bg-sem-info'
                  : 'border-border bg-background hover:bg-muted/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-foreground text-sm">
                      {formatDateShort(schedule.week_start, { day: '2-digit', month: 'short' })}
                      {' — '}
                      {formatDateShort(schedule.week_end, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    {isCurrent && (
                      <Badge className="bg-sem-info-fg text-white text-xs">Semana atual</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['n1', 'n2', 'n3', 'backup'] as const).map((level) => {
                      const user = schedule[level]
                      if (!user) return null
                      return (
                        <Badge
                          key={level}
                          variant="outline"
                          className={`text-xs ${LEVEL_COLORS[level]}`}
                        >
                          {LEVEL_LABELS[level]}: {user.full_name || user.email}
                        </Badge>
                      )
                    })}
                    {!schedule.n1 && !schedule.n2 && !schedule.n3 && !schedule.backup && (
                      <span className="text-xs text-muted-foreground/70 italic">Sem atribuições</span>
                    )}
                  </div>

                  {schedule.notes && (
                    <p className="mt-2 text-xs text-muted-foreground italic">{schedule.notes}</p>
                  )}
                </div>

                {onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground/70 hover:text-foreground/80"
                    onClick={() => onEdit(schedule)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
