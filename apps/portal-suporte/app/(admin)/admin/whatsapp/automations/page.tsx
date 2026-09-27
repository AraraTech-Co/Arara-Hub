'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  whatsappApi,
  type WAAutomationRule,
  type WAAutomationTrigger,
  type WAAutomationAction,
} from '@/lib/api/whatsapp'

// ─── Rótulos ──────────────────────────────────────────────────────────────────

const TRIGGERS: { value: WAAutomationTrigger; label: string }[] = [
  { value: 'no_reply_24h', label: 'Sem resposta há 24h' },
  { value: 'entered_queue', label: 'Entrou na fila' },
  { value: 'sla_breached', label: 'SLA vencido' },
  { value: 'phase_changed', label: 'Fase alterada' },
]

const ACTIONS: { value: WAAutomationAction; label: string }[] = [
  { value: 'move_phase', label: 'Mover de fase' },
  { value: 'send_message', label: 'Enviar mensagem' },
  { value: 'notify_agents', label: 'Notificar agentes' },
  { value: 'assign', label: 'Atribuir' },
]

const triggerLabel = (t: WAAutomationTrigger) =>
  TRIGGERS.find((x) => x.value === t)?.label ?? t
const actionLabel = (a: WAAutomationAction) =>
  ACTIONS.find((x) => x.value === a)?.label ?? a

// ─── Página ───────────────────────────────────────────────────────────────────

export default function WhatsappAutomationsPage() {
  const { toast } = useToast()
  const [rules, setRules] = useState<WAAutomationRule[]>([])
  const [loading, setLoading] = useState(true)

  // Formulário de criação
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState<WAAutomationTrigger>('no_reply_24h')
  const [action, setAction] = useState<WAAutomationAction>('notify_agents')
  const [actionParams, setActionParams] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    whatsappApi
      .listAutomations()
      .then((res) => {
        if (!cancelled) setRules(res.data)
      })
      .catch((err) => {
        if (!cancelled)
          toast({
            title: 'Erro ao carregar automações',
            description: err instanceof Error ? err.message : 'Tente novamente.',
            variant: 'destructive',
          })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  async function handleToggle(rule: WAAutomationRule) {
    const next = !rule.active
    // otimista
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, active: next } : r)))
    try {
      await whatsappApi.updateAutomation(rule.id, { active: next })
    } catch (err) {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: rule.active } : r)),
      )
      toast({
        title: 'Erro ao atualizar regra',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    const trimmed = name.trim()
    if (!trimmed) {
      toast({ title: 'Informe um nome para a regra.', variant: 'destructive' })
      return
    }

    let parsedParams: unknown = undefined
    if (actionParams.trim()) {
      try {
        parsedParams = JSON.parse(actionParams)
      } catch {
        toast({
          title: 'JSON inválido em parâmetros da ação',
          description: 'Ex.: {"phase":"resolvido"} ou {"text":"..."}',
          variant: 'destructive',
        })
        return
      }
    }

    setCreating(true)
    try {
      const res = await whatsappApi.createAutomation({
        name: trimmed,
        trigger,
        action,
        actionParams: parsedParams,
      })
      setRules((prev) => [res.data, ...prev])
      setName('')
      setActionParams('')
      toast({ title: 'Regra criada.' })
    } catch (err) {
      toast({
        title: 'Erro ao criar regra',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Automações do WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Regras que reagem a eventos da inbox (fila, SLA, mudança de fase) e executam uma ação.
        </p>
      </div>

      {/* Formulário de criação */}
      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-lg bg-card p-4 shadow-[var(--shadow-media)]"
      >
        <p className="text-sm font-medium text-foreground">Nova regra</p>

        <div className="space-y-1.5">
          <label htmlFor="rule-name" className="text-xs font-medium text-muted-foreground">
            Nome
          </label>
          <Input
            id="rule-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Reengajar sem resposta 24h"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="rule-trigger" className="text-xs font-medium text-muted-foreground">
              Gatilho
            </label>
            <select
              id="rule-trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as WAAutomationTrigger)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="rule-action" className="text-xs font-medium text-muted-foreground">
              Ação
            </label>
            <select
              id="rule-action"
              value={action}
              onChange={(e) => setAction(e.target.value as WAAutomationAction)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="rule-params" className="text-xs font-medium text-muted-foreground">
            Parâmetros da ação (JSON, opcional)
          </label>
          <Textarea
            id="rule-params"
            value={actionParams}
            onChange={(e) => setActionParams(e.target.value)}
            placeholder='Ex.: {"phase":"resolvido"} para mover de fase, {"text":"..."} para enviar mensagem'
            rows={2}
            className="resize-none font-mono text-xs"
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={creating}>
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="ml-1.5">Criar regra</span>
          </Button>
        </div>
      </form>

      {/* Lista de regras */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Regras cadastradas</p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{rule.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {triggerLabel(rule.trigger)} → {actionLabel(rule.action)}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.active}
                  aria-label={rule.active ? 'Desativar regra' : 'Ativar regra'}
                  onClick={() => void handleToggle(rule)}
                  className={
                    rule.active
                      ? 'relative h-5 w-9 shrink-0 rounded-full bg-primary transition-colors'
                      : 'relative h-5 w-9 shrink-0 rounded-full bg-muted transition-colors'
                  }
                >
                  <span
                    className={
                      rule.active
                        ? 'absolute top-0.5 left-0.5 h-4 w-4 translate-x-4 rounded-full bg-background transition-transform'
                        : 'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background transition-transform'
                    }
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
