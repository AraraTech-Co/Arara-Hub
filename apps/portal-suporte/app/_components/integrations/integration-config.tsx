'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { Info, Key, Shield, Webhook, Settings2, Eye, EyeOff } from 'lucide-react'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface IntegrationConfigProps {
  integration: any
  onClose: () => void
  onUpdate: () => void
}

export function IntegrationConfig({ integration, onClose, onUpdate }: IntegrationConfigProps) {
  const [config, setConfig] = useState(integration.config || {})
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [showApiSecret, setShowApiSecret] = useState(false)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({
    read_tickets: true,
    write_tickets: true,
    send_messages: true,
    read_messages: true,
    manage_users: false,
    admin_access: false
  })
  const { toast } = useToast()

  const handleSave = async () => {
    const updatedConfig = {
      ...config,
      api_key: apiKey,
      api_secret: apiSecret,
      webhook_url: webhookUrl,
      permissions,
    }

    const res = await araraApiFetch(`/api/integrations/${integration.name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: updatedConfig }),
    })

    if (!res.ok) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações',
        variant: 'destructive',
      })
      return
    }

    toast({
      title: 'Configurações salvas',
      description: 'As configurações da integração foram atualizadas com sucesso'
    })

    onUpdate()
    onClose()
  }

  const renderWhatsAppConfig = () => (
    <div className="space-y-4">
      <Card className="border p-4 bg-blue-500/5 border-blue-500/20">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-medium text-sem-info-fg dark:text-blue-100">WhatsApp Business API</p>
            <p className="text-muted-foreground">
              Configure as credenciais da API do WhatsApp Business Cloud ou de um provedor como Twilio, MessageBird ou 360dialog.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div>
          <Label htmlFor="wa-phone-id" className="flex items-center gap-2">
            Phone Number ID
            <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
          </Label>
          <Input
            id="wa-phone-id"
            placeholder="123456789012345"
            value={config.phone_number_id || ''}
            onChange={(e) => setConfig({ ...config, phone_number_id: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">ID do número de telefone no WhatsApp Business</p>
        </div>

        <div>
          <Label htmlFor="wa-business-id">WhatsApp Business Account ID</Label>
          <Input
            id="wa-business-id"
            placeholder="987654321098765"
            value={config.business_account_id || ''}
            onChange={(e) => setConfig({ ...config, business_account_id: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="wa-api-token" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            Access Token / API Key
            <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
          </Label>
          <div className="relative">
            <Input
              id="wa-api-token"
              type={showApiKey ? 'text' : 'password'}
              placeholder="EAAxxxxxxxxxxxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Token de acesso permanente da Graph API</p>
        </div>

        <div>
          <Label htmlFor="wa-verify-token" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Verify Token (Webhook)
          </Label>
          <Input
            id="wa-verify-token"
            type="password"
            placeholder="seu_token_secreto_123"
            value={config.verify_token || ''}
            onChange={(e) => setConfig({ ...config, verify_token: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">Token para validação de webhook (mínimo 20 caracteres)</p>
        </div>

        <div>
          <Label htmlFor="wa-webhook" className="flex items-center gap-2">
            <Webhook className="w-4 h-4" />
            Webhook URL
          </Label>
          <Input
            id="wa-webhook"
            placeholder="https://seu-dominio.com/api/webhooks/whatsapp"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">URL para receber notificações do WhatsApp</p>
        </div>

        <div>
          <Label htmlFor="wa-api-version">API Version</Label>
          <Input
            id="wa-api-version"
            placeholder="v18.0"
            value={config.api_version || 'v18.0'}
            onChange={(e) => setConfig({ ...config, api_version: e.target.value })}
          />
        </div>
      </div>
    </div>
  )

  const renderDiscordConfig = () => (
    <div className="space-y-4">
      <Card className="border p-4 bg-indigo-500/5 border-indigo-500/20">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-medium text-indigo-900 dark:text-indigo-100">Discord Bot</p>
            <p className="text-muted-foreground">
              Configure um bot do Discord para enviar notificações e alertas em canais específicos da sua equipe.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div>
          <Label htmlFor="dc-bot-token" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            Bot Token
            <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
          </Label>
          <div className="relative">
            <Input
              id="dc-bot-token"
              type={showApiKey ? 'text' : 'password'}
              placeholder="MTxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Token do bot obtido no Discord Developer Portal</p>
        </div>

        <div>
          <Label htmlFor="dc-client-id">Client ID (Application ID)</Label>
          <Input
            id="dc-client-id"
            placeholder="123456789012345678"
            value={config.client_id || ''}
            onChange={(e) => setConfig({ ...config, client_id: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="dc-client-secret">Client Secret</Label>
          <div className="relative">
            <Input
              id="dc-client-secret"
              type={showApiSecret ? 'text' : 'password'}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowApiSecret(!showApiSecret)}
            >
              {showApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="dc-guild-id">Server ID (Guild ID)</Label>
          <Input
            id="dc-guild-id"
            placeholder="987654321098765432"
            value={config.guild_id || ''}
            onChange={(e) => setConfig({ ...config, guild_id: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">ID do servidor Discord onde o bot enviará mensagens</p>
        </div>

        <div>
          <Label htmlFor="dc-channel-alerts">Canal de Alertas</Label>
          <Input
            id="dc-channel-alerts"
            placeholder="1234567890123456789"
            value={config.channel_alerts || ''}
            onChange={(e) => setConfig({ ...config, channel_alerts: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="dc-channel-tickets">Canal de Tickets</Label>
          <Input
            id="dc-channel-tickets"
            placeholder="9876543210987654321"
            value={config.channel_tickets || ''}
            onChange={(e) => setConfig({ ...config, channel_tickets: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="dc-channel-sla">Canal de Alertas SLA</Label>
          <Input
            id="dc-channel-sla"
            placeholder="5555555555555555555"
            value={config.channel_sla || ''}
            onChange={(e) => setConfig({ ...config, channel_sla: e.target.value })}
          />
        </div>
      </div>
    </div>
  )

  const renderTrelloConfig = () => (
    <div className="space-y-4">
      <Card className="border p-4 bg-blue-600/5 border-blue-600/20">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-sem-info-fg shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-medium text-sem-info-fg dark:text-blue-100">Trello API</p>
            <p className="text-muted-foreground">
              Sincronize tickets com cards do Trello para gestão visual. Configure a API Key e Token em trello.com/power-ups/admin
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div>
          <Label htmlFor="tr-api-key" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Key
            <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
          </Label>
          <div className="relative">
            <Input
              id="tr-api-key"
              type={showApiKey ? 'text' : 'password'}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="tr-token" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            API Token
            <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
          </Label>
          <div className="relative">
            <Input
              id="tr-token"
              type={showApiSecret ? 'text' : 'password'}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowApiSecret(!showApiSecret)}
            >
              {showApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="tr-board-id">Board ID</Label>
          <Input
            id="tr-board-id"
            placeholder="5f6a8b9c0d1e2f3a4b5c6d7e"
            value={config.board_id || ''}
            onChange={(e) => setConfig({ ...config, board_id: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">ID do board onde os cards serão criados</p>
        </div>

        <div>
          <Label htmlFor="tr-list-new">List ID - Novos Tickets</Label>
          <Input
            id="tr-list-new"
            placeholder="5f6a8b9c0d1e2f3a4b5c6d7f"
            value={config.list_id_new || ''}
            onChange={(e) => setConfig({ ...config, list_id_new: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="tr-list-progress">List ID - Em Progresso</Label>
          <Input
            id="tr-list-progress"
            placeholder="5f6a8b9c0d1e2f3a4b5c6d80"
            value={config.list_id_progress || ''}
            onChange={(e) => setConfig({ ...config, list_id_progress: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="tr-list-done">List ID - Concluídos</Label>
          <Input
            id="tr-list-done"
            placeholder="5f6a8b9c0d1e2f3a4b5c6d81"
            value={config.list_id_done || ''}
            onChange={(e) => setConfig({ ...config, list_id_done: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Switch
            id="tr-auto-sync"
            checked={config.auto_sync || false}
            onCheckedChange={(checked) => setConfig({ ...config, auto_sync: checked })}
          />
          <Label htmlFor="tr-auto-sync" className="cursor-pointer">
            Sincronização automática (tempo real)
          </Label>
        </div>
      </div>
    </div>
  )

  const renderChatGPTConfig = () => (
    <div className="space-y-4">
      <Card className="border p-4 bg-green-500/5 border-green-500/20">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-sem-success-fg shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-medium text-sem-success-fg dark:text-green-100">OpenAI API</p>
            <p className="text-muted-foreground">
              Use a IA do ChatGPT para análise automática de tickets, sugestões de resolução e automação inteligente.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div>
          <Label htmlFor="ai-api-key" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            OpenAI API Key
            <Badge variant="secondary" className="text-xs">Obrigatório</Badge>
          </Label>
          <div className="relative">
            <Input
              id="ai-api-key"
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Obtenha sua chave em platform.openai.com/api-keys</p>
        </div>

        <div>
          <Label htmlFor="ai-model">Modelo</Label>
          <Input
            id="ai-model"
            placeholder="gpt-4o"
            value={config.model || 'gpt-4o'}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">Modelos disponíveis: gpt-4o, gpt-4, gpt-3.5-turbo</p>
        </div>

        <div>
          <Label htmlFor="ai-org-id">Organization ID (opcional)</Label>
          <Input
            id="ai-org-id"
            placeholder="org-xxxxxxxxxxxxxxxxxxxxxxxx"
            value={config.organization_id || ''}
            onChange={(e) => setConfig({ ...config, organization_id: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="ai-max-tokens">Max Tokens</Label>
          <Input
            id="ai-max-tokens"
            type="number"
            placeholder="1000"
            value={config.max_tokens || 1000}
            onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) || 1000 })}
          />
        </div>

        <div>
          <Label htmlFor="ai-temperature">Temperature (0-2)</Label>
          <Input
            id="ai-temperature"
            type="number"
            step="0.1"
            min="0"
            max="2"
            placeholder="0.7"
            value={config.temperature || 0.7}
            onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
          />
          <p className="text-xs text-muted-foreground mt-1">Controla a criatividade das respostas (0 = determinístico, 2 = criativo)</p>
        </div>

        <div className="space-y-2 pt-2">
          <Label>Funcionalidades Habilitadas</Label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-auto-analysis"
                checked={config.auto_analysis || false}
                onCheckedChange={(checked) => setConfig({ ...config, auto_analysis: checked })}
              />
              <Label htmlFor="ai-auto-analysis" className="cursor-pointer font-normal">
                Análise automática de novos tickets
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-suggest-solutions"
                checked={config.suggest_solutions || false}
                onCheckedChange={(checked) => setConfig({ ...config, suggest_solutions: checked })}
              />
              <Label htmlFor="ai-suggest-solutions" className="cursor-pointer font-normal">
                Sugerir soluções para agentes
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-categorize"
                checked={config.auto_categorize || false}
                onCheckedChange={(checked) => setConfig({ ...config, auto_categorize: checked })}
              />
              <Label htmlFor="ai-categorize" className="cursor-pointer font-normal">
                Categorização automática de tickets
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ai-sentiment"
                checked={config.sentiment_analysis || false}
                onCheckedChange={(checked) => setConfig({ ...config, sentiment_analysis: checked })}
              />
              <Label htmlFor="ai-sentiment" className="cursor-pointer font-normal">
                Análise de sentimento do cliente
              </Label>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderPermissions = () => (
    <div className="space-y-4">
      <Card className="border p-4 bg-amber-500/5 border-amber-500/20">
        <div className="flex gap-3">
          <Shield className="w-5 h-5 text-sem-warning-fg shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-medium text-sem-warning-fg dark:text-amber-100">Controle de Permissões</p>
            <p className="text-muted-foreground">
              Defina quais operações esta integração pode realizar no sistema de suporte.
            </p>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-lg border">
          <Checkbox
            id="perm-read-tickets"
            checked={permissions.read_tickets}
            onCheckedChange={(checked) => setPermissions({ ...permissions, read_tickets: !!checked })}
          />
          <div className="flex-1">
            <Label htmlFor="perm-read-tickets" className="cursor-pointer font-medium">
              Ler Tickets
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Permite visualizar tickets e suas informações
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border">
          <Checkbox
            id="perm-write-tickets"
            checked={permissions.write_tickets}
            onCheckedChange={(checked) => setPermissions({ ...permissions, write_tickets: !!checked })}
          />
          <div className="flex-1">
            <Label htmlFor="perm-write-tickets" className="cursor-pointer font-medium">
              Criar e Editar Tickets
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Permite criar novos tickets e editar existentes
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border">
          <Checkbox
            id="perm-send-messages"
            checked={permissions.send_messages}
            onCheckedChange={(checked) => setPermissions({ ...permissions, send_messages: !!checked })}
          />
          <div className="flex-1">
            <Label htmlFor="perm-send-messages" className="cursor-pointer font-medium">
              Enviar Mensagens
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Permite enviar mensagens e notificações
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border">
          <Checkbox
            id="perm-read-messages"
            checked={permissions.read_messages}
            onCheckedChange={(checked) => setPermissions({ ...permissions, read_messages: !!checked })}
          />
          <div className="flex-1">
            <Label htmlFor="perm-read-messages" className="cursor-pointer font-medium">
              Ler Mensagens
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Permite acessar histórico de mensagens
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
          <Checkbox
            id="perm-manage-users"
            checked={permissions.manage_users}
            onCheckedChange={(checked) => setPermissions({ ...permissions, manage_users: !!checked })}
          />
          <div className="flex-1">
            <Label htmlFor="perm-manage-users" className="cursor-pointer font-medium">
              Gerenciar Usuários
              <Badge variant="outline" className="ml-2 text-xs">Avançado</Badge>
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Permite criar, editar e remover usuários
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-lg border border-red-500/20 bg-red-500/5">
          <Checkbox
            id="perm-admin"
            checked={permissions.admin_access}
            onCheckedChange={(checked) => setPermissions({ ...permissions, admin_access: !!checked })}
          />
          <div className="flex-1">
            <Label htmlFor="perm-admin" className="cursor-pointer font-medium text-sem-error-fg dark:text-red-100">
              Acesso Administrativo
              <Badge variant="destructive" className="ml-2 text-xs">Crítico</Badge>
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Acesso total ao sistema incluindo configurações e dados sensíveis
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            Configurar {integration.name}
          </DialogTitle>
          <DialogDescription>
            Configure as credenciais, webhooks e permissões para a integração
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="credentials" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="credentials">
              <Key className="w-4 h-4 mr-2" />
              Credenciais
            </TabsTrigger>
            <TabsTrigger value="permissions">
              <Shield className="w-4 h-4 mr-2" />
              Permissões
            </TabsTrigger>
          </TabsList>

          <TabsContent value="credentials" className="space-y-4 mt-4">
            {integration.name === 'whatsapp' && renderWhatsAppConfig()}
            {integration.name === 'discord' && renderDiscordConfig()}
            {integration.name === 'trello' && renderTrelloConfig()}
            {integration.name === 'chatgpt' && renderChatGPTConfig()}
          </TabsContent>

          <TabsContent value="permissions" className="space-y-4 mt-4">
            {renderPermissions()}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar Configurações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
