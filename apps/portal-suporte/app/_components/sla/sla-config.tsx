'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertTriangle } from 'lucide-react'

interface SLAConfigProps {
  config: any[]
  onUpdate: () => void
}

export function SLAConfig({ config }: SLAConfigProps) {
  const severityColors: Record<string, string> = {
    P1: 'bg-red-500',
    P2: 'bg-orange-500',
    P3: 'bg-yellow-500',
    P4: 'bg-blue-500'
  }

  function formatTime(minutes: number): string {
    if (minutes < 60) return `${minutes} min`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
    return `${Math.floor(minutes / 1440)} dias`
  }

  return (
    <div className="space-y-4">
      <Card className="border p-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/20">
        <h3 className="text-lg font-semibold mb-2">Sobre o SLA</h3>
        <p className="text-sm text-muted-foreground">
          Service Level Agreement conforme padrões internacionais (ISO 20000, ITIL 4, COBIT, ISO 27001).
          Define níveis de serviço, tempos de resposta e resolução para cada severidade de incidente.
        </p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {config.map((sla) => (
          <Card key={sla.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${severityColors[sla.severity]}`} />
                  <Badge variant="outline">{sla.severity}</Badge>
                  <h3 className="font-semibold">{sla.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{sla.description}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-accent rounded-lg">
                <Clock className="w-4 h-4 text-blue-600" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Tempo de Resposta</p>
                  <p className="font-semibold">{formatTime(sla.response_time_minutes)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-accent rounded-lg">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Tempo de Resolução</p>
                  <p className="font-semibold">{formatTime(sla.resolution_time_minutes)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm pt-2">
                <div className="flex items-center gap-2">
                  <Badge variant={sla.business_hours_only ? 'secondary' : 'default'}>
                    {sla.business_hours_only ? 'Horário Comercial' : '24x7'}
                  </Badge>
                  {sla.escalation_enabled && (
                    <Badge variant="outline">Escalável</Badge>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
