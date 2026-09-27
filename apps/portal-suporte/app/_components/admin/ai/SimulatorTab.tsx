'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, BrainCircuit, Activity } from 'lucide-react'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

const AGENT_OPTIONS = [
  { value: 'auto',             label: 'Automático' },
  { value: 'orchestrator',     label: 'Orquestrador' },
  { value: 'knowledge-agent',  label: 'Conhecimento' },
  { value: 'ticket-agent',     label: 'Chamados' },
]

interface DebugInfo {
  agentKey: string; intent: string; executionId: string; status: string
}

export function SimulatorTab() {
  const [agent,       setAgent]       = useState('auto')
  const [message,     setMessage]     = useState('')
  const [debug,       setDebug]       = useState(true)
  const [loading,     setLoading]     = useState(false)
  const [response,    setResponse]    = useState('')
  const [debugInfo,   setDebugInfo]   = useState<DebugInfo | null>(null)
  const [convId,      setConvId]      = useState<string | undefined>()
  const abortRef = useRef<AbortController | null>(null)

  async function send() {
    if (!message.trim() || loading) return
    setLoading(true); setResponse(''); setDebugInfo(null)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (debug) headers['X-Debug'] = 'true'
    if (agent !== 'auto') headers['X-Forced-Agent'] = agent

    abortRef.current = new AbortController()

    try {
      const res = await araraApiFetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: message.trim(), conversationId: convId }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json()
        setResponse(`Erro: ${err.error}`)
        setLoading(false)
        return
      }

      setDebugInfo({
        agentKey:    res.headers.get('X-Agent-Key')      || '—',
        intent:      res.headers.get('X-Intent')         || '—',
        executionId: res.headers.get('X-Execution-Id')   || '',
        status:      res.headers.get('X-Response-Status') || '—',
      })

      const newConvId = res.headers.get('X-Conversation-Id')
      if (newConvId) setConvId(newConvId)

      const reader  = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText  = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const json = line.slice(6).trim()
            if (json === '[DONE]') continue
            try {
              const parsed = JSON.parse(json)
              const delta  = parsed.choices?.[0]?.delta?.content
              if (delta) { fullText += delta; setResponse(fullText) }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setResponse(`Erro: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  function stop() {
    abortRef.current?.abort()
    setLoading(false)
  }

  function reset() {
    setResponse(''); setDebugInfo(null); setMessage(''); setConvId(undefined)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Input Panel */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Send className="h-5 w-5" /> Entrada</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-2">
            <Label>Agente</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AGENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} placeholder="Ex: Como abrir um chamado de N0?" onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) send() }} />
            <p className="text-xs text-muted-foreground">Ctrl+Enter para enviar</p>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={debug} onCheckedChange={setDebug} id="debug" />
            <Label htmlFor="debug">Modo debug (headers)</Label>
          </div>
          {convId && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Conversa em curso · <button onClick={reset} className="underline hover:no-underline">nova conversa</button>
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={send} disabled={!message.trim() || loading} className="flex-1">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Gerando...</> : <><Send className="h-4 w-4 mr-2" /> Enviar</>}
            </Button>
            {loading && <Button variant="outline" onClick={stop}>Parar</Button>}
          </div>
        </CardContent>
      </Card>

      {/* Output Panel */}
      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BrainCircuit className="h-5 w-5" /> Resposta</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {debugInfo && (
            <div className="grid grid-cols-2 gap-2 text-xs bg-muted p-3 rounded-lg">
              <div><span className="text-muted-foreground">Agente:</span> <Badge variant="secondary" className="ml-1">{debugInfo.agentKey}</Badge></div>
              <div><span className="text-muted-foreground">Intenção:</span> <Badge variant="outline" className="ml-1">{debugInfo.intent}</Badge></div>
              <div><span className="text-muted-foreground">Status:</span> <span className="ml-1 font-medium">{debugInfo.status}</span></div>
              {debugInfo.executionId && <div><span className="text-muted-foreground">ID:</span> <span className="ml-1 font-mono">{debugInfo.executionId.slice(0, 8)}…</span></div>}
            </div>
          )}
          <div className="min-h-[200px] max-h-[400px] overflow-y-auto rounded-lg border bg-muted/30 p-4">
            {response ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{response}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">A resposta aparecerá aqui...</p>
            )}
            {loading && <span className="inline-block w-1.5 h-4 bg-muted-foreground/60 animate-pulse ml-0.5 rounded" />}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
