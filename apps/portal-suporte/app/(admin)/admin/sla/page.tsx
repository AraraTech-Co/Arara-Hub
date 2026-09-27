'use client'

// =============================================================================
// SLA & Gestão de Serviços (client-only / Arara).
//
// A conversão para client-only deixou aqui só quatro contadores agregados no
// navegador; os seis painéis viraram componentes órfãos. Esta tela os traz de
// volta, agora buscando na API central.
//
// Os painéis que já buscam sozinhos (uptime, mudanças, backups, horário) só
// precisam estar montados. Os dois que recebem por props (configuração de SLA
// e KPIs) são alimentados pelo `load()` abaixo.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Shield, TrendingUp, Server, FileEdit, Database, Clock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { araraFetch } from '@/lib/arara/client'
import { SLAConfig } from '@/components/sla/sla-config'
import { KPIDashboard } from '@/components/sla/kpi-dashboard'
import { UptimeTracking } from '@/components/sla/uptime-tracking'
import { ChangeManagement } from '@/components/sla/change-management'
import { BackupTracking } from '@/components/sla/backup-tracking'
import { BusinessHoursConfig } from '@/components/sla/business-hours-config'

type Row = Record<string, unknown>

/** A API ora devolve `{data:[…]}`, ora o array puro. */
function rows(res: unknown): Row[] {
  if (Array.isArray(res)) return res as Row[]
  const d = (res as { data?: unknown })?.data
  return Array.isArray(d) ? (d as Row[]) : []
}

export default function SLAPage() {
  const [slaConfig, setSlaConfig] = useState<Row[]>([])
  const [kpiMetrics, setKpiMetrics] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    // Um painel indisponível não pode derrubar a tela inteira — cada um cai
    // para vazio e os demais seguem.
    const [cfg, kpi] = await Promise.all([
      araraFetch.get('/api/sla/configs').catch(() => []),
      araraFetch.get('/api/sla/dashboard').catch(() => ({})),
    ])
    setSlaConfig(rows(cfg))
    const k = (kpi as { data?: unknown })?.data ?? kpi
    setKpiMetrics((k as Record<string, unknown>) ?? {})
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="pt-14 lg:pt-0">
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-sm text-muted-foreground">
          Carregando…
        </div>
      </div>
    )
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="container mx-auto space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold">SLA &amp; Gestão de Serviços</h1>
          <p className="mt-1 text-muted-foreground">
            Padrão Multinacional — ISO 20000, ITIL 4, COBIT, ISO 27001
          </p>
        </div>

        <Tabs defaultValue="sla" className="space-y-6">
          <TabsList>
            <TabsTrigger value="sla">
              <Shield className="mr-2 h-4 w-4" />
              Configuração SLA
            </TabsTrigger>
            <TabsTrigger value="kpi">
              <TrendingUp className="mr-2 h-4 w-4" />
              KPIs &amp; Métricas
            </TabsTrigger>
            <TabsTrigger value="uptime">
              <Server className="mr-2 h-4 w-4" />
              Disponibilidade
            </TabsTrigger>
            <TabsTrigger value="changes">
              <FileEdit className="mr-2 h-4 w-4" />
              Mudanças
            </TabsTrigger>
            <TabsTrigger value="backups">
              <Database className="mr-2 h-4 w-4" />
              Backups
            </TabsTrigger>
            <TabsTrigger value="business-hours">
              <Clock className="mr-2 h-4 w-4" />
              Horário Comercial
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sla">
            <SLAConfig config={slaConfig as never} onUpdate={load} />
          </TabsContent>

          <TabsContent value="kpi">
            <KPIDashboard metrics={kpiMetrics as never} />
          </TabsContent>

          <TabsContent value="uptime">
            <UptimeTracking />
          </TabsContent>

          <TabsContent value="changes">
            <ChangeManagement />
          </TabsContent>

          <TabsContent value="backups">
            <BackupTracking />
          </TabsContent>

          <TabsContent value="business-hours">
            <BusinessHoursConfig />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
