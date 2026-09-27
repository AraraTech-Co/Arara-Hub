'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertCircle } from 'lucide-react'

export function UptimeTracking() {
  const [uptimeData] = useState<any[]>([])

  const environmentColors: Record<string, string> = {
    production: 'bg-green-500',
    staging: 'bg-yellow-500',
    development: 'bg-blue-500'
  }

  return (
    <div className="space-y-4">
      <Card className="border p-6 bg-linear-to-br from-green-500/10 to-teal-500/10 border-green-500/20">
        <h3 className="text-lg font-semibold mb-2">Disponibilidade do Serviço (Uptime)</h3>
        <p className="text-sm text-muted-foreground">
          Padrão multinacional: Produção 99.9%, Homologação 99.5%, Desenvolvimento 98%
        </p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {uptimeData.map((item) => {
          const uptimePercentage = item.actual_uptime || item.target_uptime
          const meetsTarget = uptimePercentage >= item.target_uptime

          return (
            <Card key={item.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${environmentColors[item.environment]}`} />
                  <div>
                    <h3 className="font-semibold">{item.service_name}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{item.environment}</p>
                  </div>
                </div>
                {meetsTarget ? (
                  <CheckCircle className="w-5 h-5 text-sem-success-fg" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-sem-error-fg" />
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-end justify-between mb-1">
                    <span className="text-sm text-muted-foreground">Uptime</span>
                    <span className={`text-2xl font-bold ${meetsTarget ? 'text-sem-success-fg' : 'text-sem-error-fg'}`}>
                      {uptimePercentage}%
                    </span>
                  </div>
                  <div className="w-full bg-accent rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${meetsTarget ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${uptimePercentage}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Meta SLA</span>
                  <Badge variant="outline">{item.target_uptime}%</Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Downtime</span>
                  <span className="font-medium">{item.downtime_minutes || 0} min</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Incidentes</span>
                  <span className="font-medium">{item.incidents_count || 0}</span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
