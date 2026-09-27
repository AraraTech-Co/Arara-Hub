'use client'

import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Clock, CheckCircle, AlertCircle, Users, AlertTriangle, ArrowUpCircle } from 'lucide-react'

interface KPIDashboardProps {
  metrics: any
}

export function KPIDashboard({ metrics }: KPIDashboardProps) {
  const compliance = metrics?.monthlyCompliance?.resolutionCompliance ?? null

  const kpiData = {
    mtta: { value: 12, target: 15, unit: 'min', trend: 'up' },
    mttr: { value: 98, target: 120, unit: 'min', trend: 'up' },
    sla_compliance: { value: compliance !== null ? Math.round(compliance * 10) / 10 : 98.5, target: 95, unit: '%', trend: 'up' },
    recurring_incidents: { value: 8, target: 10, unit: '', trend: 'down' },
    customer_satisfaction: { value: 4.7, target: 4.5, unit: '/5', trend: 'up' },
    first_contact_resolution: { value: 76, target: 70, unit: '%', trend: 'up' }
  }

  const kpiConfig = [
    { 
      key: 'mtta', 
      name: 'MTTA', 
      description: 'Mean Time to Acknowledge',
      icon: Clock,
      color: 'text-blue-600'
    },
    { 
      key: 'mttr', 
      name: 'MTTR', 
      description: 'Mean Time to Resolve',
      icon: CheckCircle,
      color: 'text-sem-success-fg'
    },
    { 
      key: 'sla_compliance', 
      name: 'SLA Compliance', 
      description: 'Taxa de cumprimento de SLA',
      icon: AlertCircle,
      color: 'text-purple-600'
    },
    { 
      key: 'recurring_incidents', 
      name: 'Incidentes Recorrentes', 
      description: 'Tickets repetidos no mês',
      icon: TrendingDown,
      color: 'text-orange-600'
    },
    { 
      key: 'customer_satisfaction', 
      name: 'Satisfação do Cliente', 
      description: 'Avaliação média dos clientes',
      icon: Users,
      color: 'text-pink-600'
    },
    { 
      key: 'first_contact_resolution', 
      name: 'FCR', 
      description: 'First Contact Resolution',
      icon: CheckCircle,
      color: 'text-sem-success-fg'
    }
  ]

  const breachedCount = metrics?.breachedCount ?? 0
  const atRiskCount = metrics?.atRiskCount ?? 0
  const escalatedCount = metrics?.escalatedCount ?? 0

  return (
    <div className="space-y-4">
      <Card className="border p-6 bg-linear-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
        <h3 className="text-lg font-semibold mb-2">KPIs - Indicadores de Performance</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Métricas essenciais para avaliar a qualidade do suporte e garantir padrão multinacional
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-sem-error-fg">{breachedCount} SLAs violados</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium text-sem-warning-fg">{atRiskCount} em risco</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium text-yellow-600">{escalatedCount} escalonados</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpiConfig.map(({ key, name, description, icon: Icon, color }) => {
          const data = kpiData[key as keyof typeof kpiData]
          const isBetter = data.trend === 'up' 
            ? data.value >= data.target 
            : data.value <= data.target
          
          return (
            <Card key={key} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-accent ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{name}</h3>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold">
                      {data.value}{data.unit}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Meta: {data.target}{data.unit}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 ${isBetter ? 'text-sem-success-fg' : 'text-sem-error-fg'}`}>
                    {isBetter ? (
                      <TrendingUp className="w-5 h-5" />
                    ) : (
                      <TrendingDown className="w-5 h-5" />
                    )}
                  </div>
                </div>

                <div className="w-full bg-accent rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${isBetter ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min((data.value / data.target) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
