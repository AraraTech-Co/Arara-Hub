'use client'

import { useState, useEffect } from 'react'
import { AdminHeader } from '@/components/admin/admin-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { MessageCircle, MessageSquare, Trello, Brain, Settings, Webhook, Database, Zap, Activity, Filter, Clock, CheckCircle2, XCircle, AlertCircle, TrendingUp, PlayCircle, PauseCircle } from 'lucide-react'
import { IntegrationConfig } from '@/components/integrations/integration-config'
import { useToast } from '@/hooks/use-toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDate } from '@/lib/utils'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<any[]>([])
  const [workflows, setWorkflows] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [selectedIntegration, setSelectedIntegration] = useState<any>(null)
  const [logFilter, setLogFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const integrationNames = ['whatsapp', 'discord', 'trello', 'chatgpt']
    const [integrationsRes, ...logsResponses] = await Promise.all([
      araraApiFetch('/api/integrations').then((r) => r.json()),
      ...integrationNames.map((name) =>
        araraApiFetch(`/api/integrations/${name}/logs?limit=5`).then((r) => r.json())
      ),
    ])

    const allLogs = logsResponses
      .flatMap((r: any) => r.data || [])
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)

    setIntegrations(integrationsRes.data || [])
    setLogs(allLogs)

    // Mock workflows
    setWorkflows([
      {
        id: 1,
        name: 'Atendimento WhatsApp → Criar Ticket',
        description: 'Quando cliente manda mensagem no WhatsApp, cria ticket automaticamente',
        icon: MessageCircle,
        enabled: true,
        triggers: 'whatsapp_message',
        actions: 'create_ticket'
      },
      {
        id: 2,
        name: 'Ticket Crítico → Alerta Discord',
        description: 'Envia alerta no Discord quando ticket P1 é criado',
        icon: MessageSquare,
        enabled: true,
        triggers: 'ticket_p1_created',
        actions: 'discord_alert'
      },
      {
        id: 3,
        name: 'Ticket Resolvido → Card Trello',
        description: 'Move card no Trello quando ticket é resolvido',
        icon: Trello,
        enabled: false,
        triggers: 'ticket_resolved',
        actions: 'trello_move_card'
      },
      {
        id: 4,
        name: 'Cliente Áudio → IA Transcreve',
        description: 'IA transcreve áudio do cliente e cria ticket',
        icon: Brain,
        enabled: true,
        triggers: 'whatsapp_audio',
        actions: 'ai_transcribe_create_ticket'
      },
      {
        id: 5,
        name: 'SLA Violado → Notificação Múltipla',
        description: 'Envia alertas no WhatsApp, Discord e Email',
        icon: AlertCircle,
        enabled: true,
        triggers: 'sla_violation',
        actions: 'multi_channel_alert'
      },
      {
        id: 6,
        name: 'Portal Antigo → Sincroniza Dados',
        description: 'Importa chamados do sistema legado automaticamente',
        icon: Database,
        enabled: false,
        triggers: 'schedule_hourly',
        actions: 'import_legacy_tickets'
      }
    ])

    setLoading(false)
  }

  async function toggleIntegration(id: string, enabled: boolean) {
    const integration = integrations.find((i: any) => i.id === id)
    if (!integration) return

    const endpoint = enabled
      ? `/api/integrations/${integration.name}/enable`
      : `/api/integrations/${integration.name}/disable`

    const res = await fetch(endpoint, { method: 'POST' })
    if (!res.ok) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a integração',
        variant: 'destructive',
      })
      return
    }

    toast({
      title: enabled ? 'Integração ativada' : 'Integração desativada',
      description: `A integração foi ${enabled ? 'ativada' : 'desativada'} com sucesso`,
    })

    loadData()
  }

  async function toggleWorkflow(id: number, enabled: boolean) {
    setWorkflows(workflows.map(w => w.id === id ? { ...w, enabled } : w))
    toast({
      title: enabled ? 'Fluxo ativado' : 'Fluxo desativado',
      description: `O fluxo automático foi ${enabled ? 'ativado' : 'desativado'}`
    })
  }

  const connectors = [
    {
      id: 'whatsapp',
      name: 'WhatsApp API',
      icon: MessageCircle,
      description: 'Gestão de grupos, mensagens e notificações automáticas',
      color: 'bg-green-500',
      integration: integrations.find((i: any) => i.name === 'whatsapp')
    },
    {
      id: 'discord',
      name: 'Discord Bot',
      icon: MessageSquare,
      description: 'Alertas em tempo real e comunicação com equipe',
      color: 'bg-indigo-500',
      integration: integrations.find((i: any) => i.name === 'discord')
    },
    {
      id: 'trello',
      name: 'Trello',
      icon: Trello,
      description: 'Sincronização de tickets com boards visuais',
      color: 'bg-blue-600',
      integration: integrations.find((i: any) => i.name === 'trello')
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT / IA',
      icon: Brain,
      description: 'Análise automática, transcrição e sugestões inteligentes',
      color: 'bg-emerald-500',
      integration: integrations.find((i: any) => i.name === 'chatgpt')
    },
    {
      id: 'portal-antigo',
      name: 'Portal Antigo (SGI/PDV)',
      icon: Database,
      description: 'Integração com sistema legado para importação de dados',
      color: 'bg-orange-500',
      integration: null
    },
    {
      id: 'webhooks',
      name: 'Webhooks',
      icon: Webhook,
      description: 'Configure webhooks personalizados para eventos',
      color: 'bg-purple-500',
      integration: null
    }
  ]

  const getStatusBadge = (integration: any) => {
    if (!integration) {
      return <Badge variant="secondary">Não configurado</Badge>
    }

    if (!integration.enabled) {
      return <Badge variant="secondary">Desconectado</Badge>
    }

    switch (integration.sync_status) {
      case 'active':
        return <Badge className="bg-sem-success text-sem-success-fg">Online</Badge>
      case 'error':
        return <Badge variant="destructive">Erro</Badge>
      case 'syncing':
        return <Badge className="bg-blue-600">Sincronizando</Badge>
      default:
        return <Badge variant="secondary">Inativo</Badge>
    }
  }

  const getStatusIcon = (integration: any) => {
    if (!integration || !integration.enabled) {
      return <XCircle className="w-5 h-5 text-muted-foreground/70" />
    }

    if (integration.sync_status === 'active') {
      return <CheckCircle2 className="w-5 h-5 text-sem-success-fg" />
    }

    if (integration.sync_status === 'error') {
      return <XCircle className="w-5 h-5 text-sem-error-fg" />
    }

    return <AlertCircle className="w-5 h-5 text-sem-warning-fg" />
  }

  const filteredLogs = logs.filter((log: any) => {
    if (logFilter === 'all') return true
    if (logFilter === 'errors') return log.status === 'error'
    return log.integration_name === logFilter
  })

  const getLogIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-sem-success-fg" />
      case 'error':
        return <XCircle className="w-4 h-4 text-sem-error-fg" />
      default:
        return <Activity className="w-4 h-4 text-blue-600" />
    }
  }

  if (loading) {
    return (
      <div className="pt-14 lg:pt-0">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">Carregando integrações...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="container mx-auto p-6 pt-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold">Integrações</h1>
          <p className="text-muted-foreground text-lg mt-2">
            Gerencie conexões com WhatsApp, Discord, Trello, Portal Antigo e IA
          </p>
        </div>

        {/* Conectores Disponíveis */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold">Conectores Disponíveis</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connectors.map((connector) => (
              <Card
                key={connector.id}
                className="p-6 hover:shadow-lg transition-all duration-200 hover:scale-[1.02]"
              >
                <div className="space-y-4">
                  {/* Icon and Status */}
                  <div className="flex items-start justify-between">
                    <div className={`p-4 ${connector.color} rounded-xl`}>
                      {/* branco fixo: o icone fica sobre `connector.color` (bg-green-500,
                          bg-indigo-500...), cor forte vinda de variavel */}
                      <connector.icon className="w-8 h-8 text-white" />
                    </div>
                    {getStatusIcon(connector.integration)}
                  </div>

                  {/* Name and Status Badge */}
                  <div>
                    <h3 className="font-bold text-lg mb-2">{connector.name}</h3>
                    {getStatusBadge(connector.integration)}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {connector.description}
                  </p>

                  {/* Actions */}
                  {connector.id === 'chatgpt' ? (
                    <a href="/admin/ia" className="w-full">
                      <Button className="w-full" variant="default">
                        <Settings className="w-4 h-4 mr-2" />
                        Configurar IA
                      </Button>
                    </a>
                  ) : (
                    <Button
                      className="w-full"
                      variant={connector.integration?.enabled ? 'outline' : 'default'}
                      onClick={() => connector.integration && setSelectedIntegration(connector.integration)}
                      disabled={!connector.integration}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      {connector.integration ? 'Configurar' : 'Em breve'}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Integrações Ativas */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Activity className="w-6 h-6 text-sem-success-fg" />
            </div>
            <h2 className="text-2xl font-bold">Integrações Ativas</h2>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-semibold">Sistema</th>
                    <th className="text-left p-4 font-semibold">Status</th>
                    <th className="text-left p-4 font-semibold">Última Sync</th>
                    <th className="text-left p-4 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {integrations.map((integration: any) => {
                    const connector = connectors.find(c => c.id === integration.name)
                    const Icon = connector?.icon || Settings

                    return (
                      <tr key={integration.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 ${connector?.color} rounded-lg`}>
                              {/* idem: sobre connector.color */}
                              <Icon className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-medium capitalize">{integration.name}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            {integration.enabled && integration.sync_status === 'active' && (
                              <>
                                <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                                <span className="text-sem-success-fg font-medium">Online</span>
                              </>
                            )}
                            {integration.enabled && integration.sync_status === 'error' && (
                              <>
                                <div className="w-2 h-2 bg-red-600 rounded-full" />
                                <span className="text-sem-error-fg font-medium">Offline</span>
                              </>
                            )}
                            {!integration.enabled && (
                              <>
                                <div className="w-2 h-2 bg-muted-foreground/50 rounded-full" />
                                <span className="text-muted-foreground">Desativado</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {formatDate(integration.last_sync_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={integration.enabled}
                              onCheckedChange={(checked) => toggleIntegration(integration.id, checked)}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedIntegration(integration)}
                            >
                              Configurar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Fluxos Automáticos com IA */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Zap className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">Fluxos Automáticos</h2>
              <p className="text-sm text-muted-foreground">Automações inteligentes estilo Zapier / Make</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={`p-3 ${workflow.enabled ? 'bg-primary/10' : 'bg-muted'} rounded-lg shrink-0`}>
                    <workflow.icon className={`w-6 h-6 ${workflow.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-sm leading-tight">{workflow.name}</h3>
                      {workflow.enabled ? (
                        <PlayCircle className="w-4 h-4 text-sem-success-fg shrink-0" />
                      ) : (
                        <PauseCircle className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      {workflow.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <Badge variant={workflow.enabled ? 'default' : 'secondary'} className="text-xs">
                        {workflow.enabled ? 'Ativo' : 'Desativado'}
                      </Badge>
                      <Switch
                        checked={workflow.enabled}
                        onCheckedChange={(checked) => toggleWorkflow(workflow.id, checked)}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Logs de Integração */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold">Logs de Integração</h2>
          </div>

          <Card className="p-6">
            {/* Filters */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <Button
                variant={logFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLogFilter('all')}
              >
                Todos
              </Button>
              <Button
                variant={logFilter === 'errors' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setLogFilter('errors')}
              >
                Somente erros
              </Button>
              <Button
                variant={logFilter === 'whatsapp' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLogFilter('whatsapp')}
              >
                WhatsApp
              </Button>
              <Button
                variant={logFilter === 'discord' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLogFilter('discord')}
              >
                Discord
              </Button>
              <Button
                variant={logFilter === 'chatgpt' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLogFilter('chatgpt')}
              >
                IA
              </Button>
            </div>

            {/* Logs Timeline */}
            {filteredLogs.length > 0 ? (
              <div className="space-y-4">
                {filteredLogs.map((log: any) => (
                  <div key={log.id} className="flex gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="shrink-0 mt-1">
                      {getLogIcon(log.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <Badge variant="outline" className="text-xs font-mono">
                          {log.integration_name}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(log.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm font-medium mb-1">{log.action}</p>
                      {log.error_message && (
                        <p className="text-xs text-muted-foreground">{log.error_message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <Activity className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">Nenhum log registrado</h3>
                <p className="text-sm text-muted-foreground">
                  As integrações começarão a registrar atividades aqui
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {selectedIntegration && (
        <IntegrationConfig
          integration={selectedIntegration}
          onClose={() => setSelectedIntegration(null)}
          onUpdate={loadData}
        />
      )}
    </div>
  )
}
