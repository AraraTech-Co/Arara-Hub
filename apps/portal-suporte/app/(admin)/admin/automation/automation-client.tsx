'use client'

import { useState, useEffect } from 'react'
import { PRIORITY_OPTIONS } from '@/lib/ticket-priority'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  TicketIcon,
  RefreshCw,
  UserCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { formatDate as formatDateUtil } from '@/lib/utils'
import {
  adminAutomationApi,
  type AutomationRule,
  type Condition,
  type Action,
  type RunLog,
} from '@/lib/api/admin'

interface Props {
  initialRules: AutomationRule[]
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: 'ticket_created',  label: 'Ticket Criado',    icon: TicketIcon,     color: 'bg-blue-500/20 border-blue-500/40 text-blue-400' },
  { value: 'status_changed',  label: 'Status Alterado',  icon: RefreshCw,      color: 'bg-purple-500/20 border-purple-500/40 text-purple-400' },
  { value: 'ticket_assigned', label: 'Ticket Atribuído', icon: UserCheck,      color: 'bg-green-500/20 border-green-500/40 text-green-400' },
  { value: 'sla_breached',    label: 'SLA Violado',      icon: AlertTriangle,  color: 'bg-red-500/20 border-red-500/40 text-red-400' },
  { value: 'time_elapsed',    label: 'Tempo Decorrido',  icon: Clock,          color: 'bg-orange-500/20 border-orange-500/40 text-orange-400' },
]

const TRIGGER_LABELS: Record<string, string> = Object.fromEntries(
  TRIGGER_OPTIONS.map(t => [t.value, t.label])
)

const FIELD_OPTIONS = [
  { value: 'status',       label: 'Status' },
  { value: 'priority',     label: 'Prioridade' },
  { value: 'company_name', label: 'Empresa' },
  { value: 'category',     label: 'Categoria' },
  { value: 'severity',     label: 'Severidade' },
  { value: 'ticket_type',  label: 'Tipo' },
]

const OPERATOR_OPTIONS = [
  { value: 'eq',       label: 'é igual a' },
  { value: 'neq',      label: 'não é' },
  { value: 'contains', label: 'contém' },
  { value: 'in',       label: 'está em' },
  { value: 'not_in',   label: 'não está em' },
]

const ACTION_OPTIONS = [
  { value: 'change_status',    label: 'Alterar Status' },
  { value: 'assign_to',        label: 'Atribuir a Agente' },
  { value: 'assign_team',      label: 'Atribuir a Time' },
  { value: 'set_priority',     label: 'Definir Prioridade' },
  { value: 'add_tag',          label: 'Adicionar Tag' },
  { value: 'add_internal_note',label: 'Adicionar Nota Interna' },
  { value: 'send_notification', label: 'Enviar Notificação' },
]

const STATUS_OPTIONS = [
  'novos_chamados','triagem','em_atendimento','em_teste','aguardando_cliente',
  'resolvido_com_manual','resolvido_sem_manual','post_mortem','pendencia_suporte',
  'pendencia_dev','acompanhamento_deploy','migracao_sat_nfce','migracao_concluida',
  'resolvido','cancelado',
]


// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  return iso ? formatDateUtil(iso, { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca'
}

function triggerColor(t: string) {
  return TRIGGER_OPTIONS.find(o => o.value === t)?.color ?? 'bg-muted text-muted-foreground'
}

// ─── Action Params Fields ───────────────────────────────────────────────────────

function ActionParamsFields({
  action,
  onChange,
}: {
  action: Action
  onChange: (params: Record<string, string>) => void
}) {
  switch (action.type) {
    case 'change_status':
      return (
        <select
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
          value={action.params.status ?? ''}
          onChange={e => onChange({ status: e.target.value })}
        >
          <option value="">Selecione o status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      )
    case 'set_priority':
      return (
        <select
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
          value={action.params.priority ?? ''}
          onChange={e => onChange({ priority: e.target.value })}
        >
          <option value="">Selecione a prioridade</option>
          {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      )
    case 'assign_to':
      return (
        <Input
          className="flex-1 bg-background border-border text-sm"
          placeholder="ID do agente (profile_id)"
          value={action.params.profile_id ?? ''}
          onChange={e => onChange({ profile_id: e.target.value })}
        />
      )
    case 'assign_team':
      return (
        <Input
          className="flex-1 bg-background border-border text-sm"
          placeholder="ID do time (team_id)"
          value={action.params.team_id ?? ''}
          onChange={e => onChange({ team_id: e.target.value })}
        />
      )
    case 'add_tag':
      return (
        <Input
          className="flex-1 bg-background border-border text-sm"
          placeholder="Nome da tag"
          value={action.params.tag ?? ''}
          onChange={e => onChange({ tag: e.target.value })}
        />
      )
    case 'add_internal_note':
      return (
        <Input
          className="flex-1 bg-background border-border text-sm"
          placeholder="Texto da nota interna"
          value={action.params.message ?? ''}
          onChange={e => onChange({ message: e.target.value })}
        />
      )
    case 'send_notification':
      return (
        <Input
          className="flex-1 bg-background border-border text-sm"
          placeholder="Mensagem da notificação"
          value={action.params.message ?? ''}
          onChange={e => onChange({ message: e.target.value })}
        />
      )
    default:
      return null
  }
}

// ─── Wizard ─────────────────────────────────────────────────────────────────────

interface WizardState {
  name: string
  active: boolean
  triggerType: string
  conditions: Condition[]
  actions: Action[]
}

function emptyWizard(): WizardState {
  return { name: '', active: true, triggerType: '', conditions: [], actions: [] }
}

function RuleWizard({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  initial: WizardState | null
  onClose: () => void
  onSave: (data: WizardState) => Promise<void>
}) {
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(initial ?? emptyWizard())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setState(initial ?? emptyWizard())
      setStep(1)
      setError('')
    }
  }, [open, initial])

  const addCondition = () =>
    setState(s => ({ ...s, conditions: [...s.conditions, { field: 'status', operator: 'eq', value: '' }] }))

  const removeCondition = (i: number) =>
    setState(s => ({ ...s, conditions: s.conditions.filter((_, idx) => idx !== i) }))

  const updateCondition = (i: number, patch: Partial<Condition>) =>
    setState(s => ({ ...s, conditions: s.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) }))

  const addAction = () =>
    setState(s => ({ ...s, actions: [...s.actions, { type: 'change_status', params: {} }] }))

  const removeAction = (i: number) =>
    setState(s => ({ ...s, actions: s.actions.filter((_, idx) => idx !== i) }))

  const updateAction = (i: number, patch: Partial<Action>) =>
    setState(s => ({ ...s, actions: s.actions.map((a, idx) => idx === i ? { ...a, ...patch } : a) }))

  const handleSave = async () => {
    if (!state.name.trim()) { setError('Nome é obrigatório'); return }
    if (!state.triggerType) { setError('Selecione um gatilho'); return }
    if (state.actions.length === 0) { setError('Adicione ao menos uma ação'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(state)
    } catch (e: any) {
      setError(e.message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            {initial ? 'Editar Regra' : 'Nova Regra de Automação'}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 my-2">
          {[1, 2, 3].map(n => (
            <button
              key={n}
              onClick={() => setStep(n)}
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                step === n
                  ? 'bg-indigo-600 text-foreground'
                  : n < step
                  ? 'bg-green-600/40 text-green-300'
                  : 'bg-background text-muted-foreground'
              }`}
            >
              {n}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            {step === 1 ? 'Gatilho' : step === 2 ? 'Condições' : 'Ações'}
          </span>
        </div>

        {/* ── Step 1: Trigger ── */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Quando esta regra deve ser ativada?</p>
            <div className="grid grid-cols-2 gap-3">
              {TRIGGER_OPTIONS.map(opt => {
                const Icon = opt.icon
                const selected = state.triggerType === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setState(s => ({ ...s, triggerType: opt.value }))}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                      selected
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-border bg-background hover:border-border'
                    }`}
                  >
                    <div className={`p-1.5 rounded ${opt.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Conditions ── */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Condições (todas devem ser verdadeiras)</p>
              <Button size="sm" variant="outline" onClick={addCondition} className="h-7 text-xs border-border hover:bg-muted">
                <Plus className="w-3 h-3 mr-1" /> Adicionar
              </Button>
            </div>

            {state.conditions.length === 0 && (
              <p className="text-xs text-muted-foreground italic py-2 text-center">
                Sem condições = a regra sempre executa ao ocorrer o gatilho
              </p>
            )}

            {state.conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
                  value={cond.field}
                  onChange={e => updateCondition(i, { field: e.target.value })}
                >
                  {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <select
                  className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
                  value={cond.operator}
                  onChange={e => updateCondition(i, { operator: e.target.value })}
                >
                  {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <Input
                  className="flex-1 bg-background border-border text-sm h-8"
                  placeholder="Valor"
                  value={cond.value}
                  onChange={e => updateCondition(i, { value: e.target.value })}
                />
                <button onClick={() => removeCondition(i)} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 3: Actions + Name ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Ações a executar (em ordem)</p>
                <Button size="sm" variant="outline" onClick={addAction} className="h-7 text-xs border-border hover:bg-muted">
                  <Plus className="w-3 h-3 mr-1" /> Adicionar
                </Button>
              </div>

              {state.actions.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  Nenhuma ação adicionada
                </p>
              )}

              {state.actions.map((action, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
                    value={action.type}
                    onChange={e => updateAction(i, { type: e.target.value, params: {} })}
                  >
                    {ACTION_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  <ActionParamsFields
                    action={action}
                    onChange={params => updateAction(i, { params })}
                  />
                  <button onClick={() => removeAction(i)} className="text-muted-foreground hover:text-red-400 transition-colors">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nome da Regra *</label>
                <Input
                  className="bg-background border-border"
                  placeholder="Ex: Escalar tickets urgentes sem resposta"
                  value={state.name}
                  onChange={e => setState(s => ({ ...s, name: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border"
                  checked={state.active}
                  onChange={e => setState(s => ({ ...s, active: e.target.checked }))}
                />
                <span className="text-sm text-muted-foreground">Regra ativa</span>
              </label>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

        <DialogFooter className="flex items-center justify-between gap-2 mt-4">
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="border-border hover:bg-muted">
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
              Cancelar
            </Button>
            {step < 3 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)} className="bg-indigo-600 hover:bg-indigo-700">
                Próximo
              </Button>
            ) : (
              <Button size="sm" onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Salvar Regra
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Rule Card ───────────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  rule: AutomationRule
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [logs, setLogs] = useState<RunLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadLogs = async () => {
    if (logs.length > 0) { setExpanded(v => !v); return }
    setLoadingLogs(true)
    try {
      const j = await adminAutomationApi.getById(rule.id)
      setLogs((j.data?.runLogs ?? []).slice(0, 5))
      setExpanded(true)
    } finally {
      setLoadingLogs(false)
    }
  }

  return (
    <Card className="border bg-card border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Active toggle pill */}
            <button
              onClick={onToggleActive}
              className={`mt-0.5 shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                rule.active
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'bg-muted border-border text-muted-foreground'
              }`}
            >
              {rule.active ? 'Ativo' : 'Inativo'}
            </button>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{rule.name}</p>
              {rule.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{rule.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded border ${triggerColor(rule.triggerType)}`}>
            {TRIGGER_LABELS[rule.triggerType] ?? rule.triggerType}
          </span>
          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
            {rule.conditions.length} condição{rule.conditions.length !== 1 ? 'ões' : ''}
          </Badge>
          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
            {rule.actions.length} ação{rule.actions.length !== 1 ? 'ões' : ''}
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {rule.runCount} execuções · última: {fmtDate(rule.lastRunAt)}
          </span>
        </div>

        {/* Expand logs */}
        <button
          onClick={loadLogs}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {loadingLogs
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : expanded
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
          }
          Ver últimos logs
        </button>

        {expanded && (
          <div className="space-y-1.5 pt-1 border-t border-border">
            {logs.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum log ainda</p>}
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-2 text-xs">
                {log.success
                  ? <CheckCircle2 className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                  : <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                }
                <div className="min-w-0 flex-1">
                  <span className="text-muted-foreground">{fmtDate(log.createdAt)}</span>
                  {log.success && log.actionsRun && (
                    <span className="text-muted-foreground ml-1">→ {log.actionsRun.join(', ')}</span>
                  )}
                  {!log.success && log.error && (
                    <span className="text-red-400 ml-1 truncate block">{log.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export function AutomationClient({ initialRules }: Props) {
  const [rules, setRules] = useState<AutomationRule[]>(initialRules)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRule, setEditRule] = useState<AutomationRule | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const reload = async () => {
    const j = await adminAutomationApi.list()
    setRules(j.data ?? [])
  }

  const openCreate = () => {
    setEditRule(null)
    setDialogOpen(true)
  }

  const openEdit = (rule: AutomationRule) => {
    setEditRule(rule)
    setDialogOpen(true)
  }

  const handleSave = async (data: WizardState) => {
    const payload = {
      name: data.name,
      triggerType: data.triggerType,
      conditions: data.conditions,
      actions: data.actions,
      active: data.active,
    }

    if (editRule) {
      await adminAutomationApi.update(editRule.id, payload)
    } else {
      await adminAutomationApi.create(payload)
    }

    setDialogOpen(false)
    setEditRule(null)
    await reload()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta regra? Esta ação não pode ser desfeita.')) return
    setDeleting(id)
    try {
      await adminAutomationApi.delete(id)
      await reload()
    } finally {
      setDeleting(null)
    }
  }

  const handleToggleActive = async (rule: AutomationRule) => {
    await adminAutomationApi.toggleActive(rule.id, !rule.active)
    await reload()
  }

  const activeCount = rules.filter(r => r.active).length
  const todayRuns = rules.reduce((acc, r) => {
    if (!r.lastRunAt) return acc
    const today = new Date().toDateString()
    return new Date(r.lastRunAt).toDateString() === today ? acc + r.runCount : acc
  }, 0)

  const wizardInitial: WizardState | null = editRule
    ? {
        name: editRule.name,
        active: editRule.active,
        triggerType: editRule.triggerType,
        conditions: editRule.conditions,
        actions: editRule.actions,
      }
    : null

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            Regras de Automação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure fluxos automáticos IF/THEN sem código
          </p>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4 mr-1" />
          Nova Regra
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="border bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total de Regras</p>
            <p className="text-2xl font-bold mt-1">{rules.length}</p>
          </CardContent>
        </Card>
        <Card className="border bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Regras Ativas</p>
            <p className="text-2xl font-bold mt-1 text-green-400">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Execuções Totais</p>
            <p className="text-2xl font-bold mt-1 text-indigo-400">
              {rules.reduce((a, r) => a + r.runCount, 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Logs Armazenados</p>
            <p className="text-2xl font-bold mt-1 text-yellow-400">
              {rules.reduce((a, r) => a + (r._count?.runLogs ?? 0), 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Zap className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm">Nenhuma regra configurada</p>
          <p className="text-xs mt-1">Crie sua primeira regra de automação</p>
          <Button onClick={openCreate} variant="outline" className="mt-4 border-border hover:bg-muted">
            <Plus className="w-4 h-4 mr-1" /> Nova Regra
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className="relative">
              {deleting === rule.id && (
                <div className="absolute inset-0 bg-background rounded-lg flex items-center justify-center z-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <RuleCard
                rule={rule}
                onEdit={() => openEdit(rule)}
                onDelete={() => handleDelete(rule.id)}
                onToggleActive={() => handleToggleActive(rule)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Wizard Dialog */}
      <RuleWizard
        open={dialogOpen}
        initial={wizardInitial}
        onClose={() => { setDialogOpen(false); setEditRule(null) }}
        onSave={handleSave}
      />
    </div>
  )
}
