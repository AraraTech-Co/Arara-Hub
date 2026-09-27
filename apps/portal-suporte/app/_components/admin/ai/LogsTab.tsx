'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import useSWR from 'swr'

const STATUS_COLORS: Record<string, string> = {
  started:   'bg-sem-warning text-sem-warning-fg',
  completed: 'bg-sem-success text-sem-success-fg',
  failed:    'bg-sem-error text-sem-error-fg',
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function LogsTab() {
  const [filterAgent,  setFilterAgent]  = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)

  const params = new URLSearchParams()
  if (filterAgent  !== 'all') params.set('agent',  filterAgent)
  if (filterStatus !== 'all') params.set('status', filterStatus)

  const { data: logs = [], isLoading } = useSWR<any[]>(`/api/admin/ai/logs?${params}`, fetcher, { refreshInterval: 10000 })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Logs de Execução</CardTitle>
        <div className="flex gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Agente</Label>
            <Select value={filterAgent} onValueChange={setFilterAgent}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="orchestrator">Orquestrador</SelectItem>
                <SelectItem value="knowledge-agent">Conhecimento</SelectItem>
                <SelectItem value="ticket-agent">Chamados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Agente</TableHead>
                <TableHead>Intenção</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <Collapsible key={log.id} asChild open={expandedId === log.id} onOpenChange={o => setExpandedId(o ? log.id : null)}>
                  <>
                    <TableRow className="cursor-pointer hover:bg-muted/40">
                      <TableCell>
                        <CollapsibleTrigger asChild>
                          <button className="p-1">
                            <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === log.id ? 'rotate-180' : ''}`} />
                          </button>
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{log.selectedAgent || '—'}</Badge></TableCell>
                      <TableCell className="text-sm">{log.detectedIntent || '—'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[log.responseStatus] || ''}`}>
                          {log.responseStatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{log.durationMs ? `${log.durationMs}ms` : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(log.createdAt), 'dd/MM HH:mm')}
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30 px-6 py-3">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-semibold mb-1 text-foreground/80">Mensagem do usuário</p>
                              <p className="text-muted-foreground whitespace-pre-wrap">{log.userMessage || '—'}</p>
                            </div>
                            <div>
                              <p className="font-semibold mb-1 text-foreground/80">Preview da resposta</p>
                              <p className="text-muted-foreground whitespace-pre-wrap">{log.responsePreview || '—'}</p>
                            </div>
                            {log.routingRule && <div><p className="font-semibold text-foreground/80">Regra de roteamento</p><p>{log.routingRule}</p></div>}
                            {log.usedPlaybook  && <div><p className="font-semibold text-foreground/80">Playbook</p><p>{log.usedPlaybook}</p></div>}
                            {log.errorMessage  && <div className="col-span-2"><p className="font-semibold text-sem-error-fg">Erro</p><p className="text-red-500">{log.errorMessage}</p></div>}
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))}
              {logs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum log encontrado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
