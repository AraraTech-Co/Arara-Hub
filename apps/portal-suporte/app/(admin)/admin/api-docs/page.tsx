'use client'

import { useState } from 'react'
import { AdminHeader } from '@/components/admin/admin-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Code, Key, Book, Send, Copy, CheckCircle2, AlertCircle, Globe, Lock, Zap, FileJson, Terminal } from 'lucide-react'

// Os blocos de codigo abaixo usam `bg-slate-900` cravado DE PROPOSITO: bloco de
// codigo escuro e' convencao de documentacao tecnica e independe do tema da
// pagina, do mesmo jeito que o sub-tema `devops-theme`. Nao trocar por token
// generico numa varredura de paleta.

const API_BASE_URL = '/api/external'

export default function ApiDocsPage() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null)
  const [testResponse, setTestResponse] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const endpoints = [
    {
      category: 'Tickets',
      items: [
        {
          method: 'POST',
          path: '/tickets',
          title: 'Criar Ticket',
          description: 'Cria um novo chamado público no portal',
          auth: true,
          request: {
            title: 'Problema no sistema',
            description: 'Descrição detalhada do problema',
            company_name: 'Empresa LTDA',
            company_cnpj: '12345678000190',
            contact_email: 'contato@empresa.com',
            priority: 'medium',
            severity: 'P2',
          },
          response: {
            data: {
              id: 'uuid',
              status: 'novos_chamados',
              title: 'Problema no sistema',
              created_at: '2026-01-19T10:30:00Z',
            },
          },
        },
        {
          method: 'GET',
          path: '/tickets',
          title: 'Listar Tickets',
          description: 'Lista tickets com filtros. Obrigatório informar ao menos um: company_cnpj, contact_email ou status',
          auth: true,
          params: 'company_cnpj=12345678000190&status=em_atendimento&page=1&page_size=20',
          response: {
            data: [
              {
                id: 'uuid',
                title: 'Problema no sistema',
                status: 'em_atendimento',
                status_label: 'Em Atendimento',
                company_cnpj: '12345678000190',
                created_at: '2026-01-19T10:30:00Z',
              },
            ],
            meta: { page: 1, page_size: 20, total: 42, total_pages: 3 },
          },
        },
        {
          method: 'GET',
          path: '/tickets/{id}',
          title: 'Obter Ticket',
          description: 'Retorna detalhes completos de um ticket (descrição, anexos, SLA)',
          auth: true,
          response: {
            data: {
              id: 'uuid',
              title: 'Problema no sistema',
              description: 'Descrição detalhada',
              status: 'em_atendimento',
              status_label: 'Em Atendimento',
              company_cnpj: '12345678000190',
              contact_email: 'contato@empresa.com',
              attachments: [{ file_name: 'evidencia.png', file_url: '/uploads/uuid.png' }],
              messages_url: '/api/external/tickets/uuid/messages',
              created_at: '2026-01-19T10:30:00Z',
            },
          },
        },
      ],
    },
    {
      category: 'Mensagens',
      items: [
        {
          method: 'POST',
          path: '/tickets/{id}/messages',
          title: 'Adicionar Mensagem',
          description: 'Adiciona uma mensagem a um ticket',
          auth: true,
          request: {
            content: 'Resposta da equipe de suporte',
            guest_name: 'Cliente',
          },
          response: {
            data: { id: 'msg_002' },
          },
        },
        {
          method: 'GET',
          path: '/tickets/{id}/messages',
          title: 'Listar Mensagens',
          description: 'Lista todas as mensagens de um ticket',
          auth: true,
          response: {
            data: [
              {
                id: 'msg_001',
                conteudo: 'Mensagem inicial',
                remetente: 'Cliente',
                interno: false,
                criado_em: '2025-01-19T10:30:00Z',
              },
            ],
          },
        }
      ]
    },
    {
      category: 'Usuários',
      items: [
        {
          method: 'GET',
          path: '/users/me',
          title: 'Perfil Atual',
          description: 'Retorna informações do usuário autenticado',
          auth: true,
          response: {
            id: 'usr_123',
            name: 'João Silva',
            email: 'joao@empresa.com',
            role: 'admin',
            api_usage: {
              requests_today: 245,
              rate_limit: 1000
            }
          }
        }
      ]
    },
    {
      category: 'Webhooks',
      items: [
        {
          method: 'POST',
          path: '/webhooks',
          title: 'Criar Webhook',
          description: 'Registra um webhook para receber eventos',
          auth: true,
          request: {
            name: 'Webhook Produção',
            url: 'https://suaapi.com/webhook',
            events: ['ticket.created', 'ticket.updated', 'message.created'],
            secret: 'whsec_abc123'
          },
          response: {
            id: 'wh_001',
            name: 'Webhook Produção',
            status: 'active',
            created_at: '2025-01-19T10:00:00Z'
          }
        },
        {
          method: 'GET',
          path: '/webhooks',
          title: 'Listar Webhooks',
          description: 'Lista todos os webhooks configurados',
          auth: true,
          response: {
            data: [
              {
                id: 'wh_001',
                name: 'Webhook Produção',
                url: 'https://suaapi.com/webhook',
                events: ['ticket.created', 'ticket.updated'],
                active: true,
                success_count: 1250,
                failure_count: 3
              }
            ]
          }
        }
      ]
    }
  ]

  const webhookEvents = [
    { event: 'ticket.created', description: 'Disparado quando um novo ticket é criado' },
    { event: 'ticket.updated', description: 'Disparado quando um ticket é atualizado' },
    { event: 'ticket.closed', description: 'Disparado quando um ticket é fechado' },
    { event: 'message.created', description: 'Disparado quando uma nova mensagem é adicionada' },
    { event: 'sla.breached', description: 'Disparado quando um SLA é violado' }
  ]

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-8 lg:py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg">
              <Code className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Documentação da API</h1>
              <p className="text-foreground/60">Integre seu sistema com nosso portal de suporte</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card className="p-4 border-l-4 border-l-purple-500">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Zap className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Versão Atual</p>
                  <p className="text-lg font-bold text-foreground">v1.0.0</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4 border-l-4 border-l-green-500">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-sem-success p-2">
                  <Globe className="h-5 w-5 text-sem-success-fg" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Base URL</p>
                  <p className="text-sm font-semibold text-foreground">/api/external</p>
                </div>
              </div>
            </Card>

            <Card className="p-4 border-l-4 border-l-blue-500">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-sem-info p-2">
                  <FileJson className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Formato</p>
                  <p className="text-lg font-bold text-foreground">JSON</p>
                </div>
              </div>
            </Card>

            <Card className="p-4 border-l-4 border-l-orange-500">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-100 p-2">
                  <Lock className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rate Limit</p>
                  <p className="text-lg font-bold text-foreground">1000/hora</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="quickstart" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="quickstart">
              <Book className="mr-2 h-4 w-4" />
              Início Rápido
            </TabsTrigger>
            <TabsTrigger value="authentication">
              <Key className="mr-2 h-4 w-4" />
              Autenticação
            </TabsTrigger>
            <TabsTrigger value="endpoints">
              <Terminal className="mr-2 h-4 w-4" />
              Endpoints
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Zap className="mr-2 h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="playground">
              <Send className="mr-2 h-4 w-4" />
              Playground
            </TabsTrigger>
          </TabsList>

          {/* Quick Start */}
          <TabsContent value="quickstart" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-bold text-foreground mb-4">Início Rápido</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">1. Obtenha sua API Key</h3>
                  <p className="text-foreground/60 mb-4">
                    Acesse <a href="/admin/api-keys" className="text-indigo-600 underline">Admin &gt; API Keys</a> e crie uma nova chave.
                    Guarde-a em segurança — ela será exibida apenas uma vez.
                  </p>
                  <div className="rounded-lg bg-card p-4">
                    <code className="text-sm text-green-400">sk_live_abc123def456ghi789jkl</code>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">2. Faça sua primeira requisição</h3>
                  <p className="text-foreground/60 mb-4">Use curl para testar a API:</p>
                  <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                    <pre className="text-sm text-foreground">
{`curl -X GET "${API_BASE_URL}/tickets?company_cnpj=12345678000190&status=em_atendimento" \\
  -H "x-api-key: sk_live_abc123def456ghi789jkl"`}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">3. Exemplos em diferentes linguagens</h3>
                  
                  <Tabs defaultValue="javascript" className="mt-4">
                    <TabsList>
                      <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                      <TabsTrigger value="python">Python</TabsTrigger>
                      <TabsTrigger value="php">PHP</TabsTrigger>
                      <TabsTrigger value="curl">cURL</TabsTrigger>
                    </TabsList>

                    <TabsContent value="javascript">
                      <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                        <pre className="text-sm text-foreground">
{`const response = await fetch('${API_BASE_URL}/tickets?company_cnpj=12345678000190', {
  headers: { 'x-api-key': 'sk_live_abc123def456' },
});
const data = await response.json();
console.log(data);`}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="python">
                      <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                        <pre className="text-sm text-foreground">
{`import requests

url = '${API_BASE_URL}/tickets'
headers = { 'x-api-key': 'sk_live_abc123def456' }
params = { 'company_cnpj': '12345678000190', 'status': 'em_atendimento' }

response = requests.get(url, headers=headers, params=params)
print(response.json())`}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="php">
                      <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                        <pre className="text-sm text-foreground">
{`<?php
$url = '${API_BASE_URL}/tickets?company_cnpj=12345678000190';
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'x-api-key: sk_live_abc123def456',
]);
$response = curl_exec($ch);
curl_close($ch);
echo $response;
?>`}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="curl">
                      <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                        <pre className="text-sm text-foreground">
{`curl -X GET "${API_BASE_URL}/tickets?company_cnpj=12345678000190" \\
  -H "x-api-key: sk_live_abc123def456"`}
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Authentication */}
          <TabsContent value="authentication" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-bold text-foreground mb-4">Autenticação</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Header x-api-key</h3>
                  <p className="text-foreground/60 mb-4">
                    Todas as requisições devem incluir sua API Key no header <code>x-api-key</code>:
                  </p>
                  <div className="rounded-lg bg-card p-4">
                    <code className="text-sm text-green-400">x-api-key: sk_live_abc123def456ghi789jkl</code>
                  </div>
                </div>

                <div className="rounded-lg border border-sem-info-bd bg-sem-info p-4">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-sem-info-fg mb-1">Segurança</h4>
                      <p className="text-sm text-sem-info-fg">
                        Nunca compartilhe sua API Key ou a exponha em código front-end. 
                        Use sempre variáveis de ambiente em suas aplicações.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Ambientes</h3>
                  <div className="space-y-3">
                    <Card className="p-4 border-l-4 border-l-green-500">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge className="mb-2 bg-sem-success text-sem-success-fg">Produção</Badge>
                          <p className="text-sm font-mono text-foreground/80">sk_live_*</p>
                          <p className="text-sm text-foreground/60 mt-1">Use para operações reais</p>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4 border-l-4 border-l-yellow-500">
                      <div className="flex items-start justify-between">
                        <div>
                          <Badge className="mb-2 bg-sem-warning text-sem-warning-fg">Sandbox</Badge>
                          <p className="text-sm font-mono text-foreground/80">sk_test_*</p>
                          <p className="text-sm text-foreground/60 mt-1">Use para testes e desenvolvimento</p>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Rate Limiting</h3>
                  <p className="text-foreground/60 mb-4">
                    A API possui limite de taxa para garantir estabilidade:
                  </p>
                  <ul className="space-y-2 text-foreground/60">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-sem-success-fg" />
                      <span><strong>1000 requisições/hora</strong> por API Key</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-sem-success-fg" />
                      <span>Headers de resposta incluem limite atual e restante</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-sem-success-fg" />
                      <span>Status 429 retornado quando limite excedido</span>
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Endpoints */}
          <TabsContent value="endpoints" className="space-y-6">
            {endpoints.map((category) => (
              <Card key={category.category} className="p-6">
                <h2 className="text-2xl font-bold text-foreground mb-4">{category.category}</h2>
                
                <div className="space-y-4">
                  {category.items.map((endpoint, idx) => (
                    <div key={idx} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center justify-between p-4 bg-muted/50 border-b border-border">
                        <div className="flex items-center gap-3">
                          <Badge 
                            className={
                              endpoint.method === 'GET' ? 'bg-sem-info text-sem-info-fg' :
                              endpoint.method === 'POST' ? 'bg-sem-success text-sem-success-fg' :
                              endpoint.method === 'PATCH' ? 'bg-orange-100 text-orange-700' :
                              'bg-sem-error text-sem-error-fg'
                            }
                          >
                            {endpoint.method}
                          </Badge>
                          <code className="text-sm font-mono text-foreground/80">{endpoint.path}</code>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedEndpoint(selectedEndpoint === `${category.category}-${idx}` ? null : `${category.category}-${idx}`)}
                        >
                          {selectedEndpoint === `${category.category}-${idx}` ? 'Ocultar' : 'Ver Detalhes'}
                        </Button>
                      </div>
                      
                      <div className="p-4">
                        <h3 className="font-semibold text-foreground mb-1">{endpoint.title}</h3>
                        <p className="text-sm text-foreground/60">{endpoint.description}</p>
                      </div>

                      {selectedEndpoint === `${category.category}-${idx}` && (
                        <div className="border-t border-border p-4 bg-background space-y-4">
                          {endpoint.params && (
                            <div>
                              <h4 className="text-sm font-semibold text-foreground mb-2">Query Parameters</h4>
                              <div className="rounded-lg bg-muted/50 p-3">
                                <code className="text-sm text-foreground/80">{endpoint.params}</code>
                              </div>
                            </div>
                          )}

                          {endpoint.request && (
                            <div>
                              <h4 className="text-sm font-semibold text-foreground mb-2">Request Body</h4>
                              <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                                <pre className="text-sm text-foreground">
                                  {JSON.stringify(endpoint.request, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}

                          <div>
                            <h4 className="text-sm font-semibold text-foreground mb-2">Response</h4>
                            <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                              <pre className="text-sm text-foreground">
                                {JSON.stringify(endpoint.response, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* Webhooks */}
          <TabsContent value="webhooks" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-bold text-foreground mb-4">Webhooks</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">O que são Webhooks?</h3>
                  <p className="text-foreground/60 mb-4">
                    Webhooks permitem que você receba notificações em tempo real sobre eventos no sistema.
                    Quando um evento ocorre, enviamos uma requisição POST para a URL configurada.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Eventos Disponíveis</h3>
                  <div className="space-y-2">
                    {webhookEvents.map((item, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-4">
                        <div className="flex items-start gap-3">
                          <Zap className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <code className="text-sm font-mono text-foreground">{item.event}</code>
                            <p className="text-sm text-foreground/60 mt-1">{item.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Formato do Payload</h3>
                  <p className="text-foreground/60 mb-4">Exemplo de payload enviado:</p>
                  <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                    <pre className="text-sm text-foreground">
{`{
  "event": "ticket.created",
  "timestamp": "2025-01-19T10:30:00Z",
  "data": {
    "id": "tk_123456789",
    "ticket_number": "TKT-000001",
    "company": "Empresa LTDA",
    "subject": "Problema no sistema",
    "status": "aberto",
    "priority": "alta",
    "created_at": "2025-01-19T10:30:00Z"
  }
}`}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Verificação de Assinatura</h3>
                  <p className="text-foreground/60 mb-4">
                    Cada webhook inclui um header <code className="text-sm bg-muted px-1 py-0.5 rounded">X-Webhook-Signature</code> para validação:
                  </p>
                  <div className="rounded-lg bg-slate-900 p-4 overflow-x-auto">
                    <pre className="text-sm text-foreground">
{`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return hash === signature;
}`}
                    </pre>
                  </div>
                </div>

                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-orange-900 mb-1">Retentativas</h4>
                      <p className="text-sm text-orange-700">
                        Se sua URL retornar erro (status {'>'} 299), tentaremos reenviar o webhook até 3 vezes 
                        com intervalo exponencial entre as tentativas.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Playground */}
          <TabsContent value="playground" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-bold text-foreground mb-4">API Playground</h2>
              <p className="text-foreground/60 mb-6">Teste os endpoints diretamente do navegador</p>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <Label>Método</Label>
                    <select className="w-full mt-1 rounded-lg border border-border px-3 py-2">
                      <option>POST</option>
                      <option>GET</option>
                      <option>PATCH</option>
                      <option>DELETE</option>
                    </select>
                  </div>

                  <div>
                    <Label>Endpoint</Label>
                    <Input 
                      className="mt-1"
                      placeholder="/tickets"
                      defaultValue="/tickets"
                    />
                  </div>

                  <div>
                    <Label>API Key</Label>
                    <Input 
                      className="mt-1"
                      type="password"
                      placeholder="sk_test_..."
                    />
                  </div>

                  <div>
                    <Label>Request Body (JSON)</Label>
                    <Textarea 
                      className="mt-1 font-mono text-sm"
                      rows={10}
                      defaultValue={JSON.stringify({
                        company: 'Empresa LTDA',
                        cnpj: '12.345.678/0001-90',
                        contact_email: 'contato@empresa.com',
                        subject: 'Teste via Playground',
                        description: 'Testando a API',
                        category: 'Dúvida',
                        priority: 'baixa'
                      }, null, 2)}
                    />
                  </div>

                  <Button className="w-full">
                    <Send className="mr-2 h-4 w-4" />
                    Enviar Requisição
                  </Button>
                </div>

                <div>
                  <Label className="mb-2 block">Response</Label>
                  <div className="rounded-lg bg-card p-4 h-[500px] overflow-auto">
                    {testResponse ? (
                      <pre className="text-sm text-foreground">
                        {JSON.stringify(testResponse, null, 2)}
                      </pre>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Terminal className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">A resposta aparecerá aqui</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
