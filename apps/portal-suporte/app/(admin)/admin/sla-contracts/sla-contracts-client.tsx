'use client'

import { useState } from 'react'
import Link from 'next/link'
import { adminSlaContractsApi } from '@/lib/api/admin'
import { Plus, Building2, Clock, CheckCircle2, Edit2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type SlaContract = {
  id: string
  name: string
  tier: string
  p0ResponseMin: number
  p1ResponseMin: number
  p2ResponseMin: number
  p3ResponseMin: number
  p0ResolutionMin: number
  p1ResolutionMin: number
  p2ResolutionMin: number
  p3ResolutionMin: number
  active: boolean
  createdAt: string
  updatedAt: string
  _count?: { companies?: number }
}

type ContractFormData = {
  name: string
  tier: string
  p0_response_min: number
  p1_response_min: number
  p2_response_min: number
  p3_response_min: number
  p0_resolution_min: number
  p1_resolution_min: number
  p2_resolution_min: number
  p3_resolution_min: number
}

const TIER_COLORS: Record<string, string> = {
  standard:   'bg-muted text-foreground/80',
  premium:    'bg-sem-info text-sem-info-fg',
  enterprise: 'bg-status-triage text-status-triage-fg',
  custom:     'bg-sem-warning text-sem-warning-fg',
}

const TIER_LABELS: Record<string, string> = {
  standard:   'Standard',
  premium:    'Premium',
  enterprise: 'Enterprise',
  custom:     'Custom',
}

function fmtMin(min: number): string {
  if (min < 60) return `${min}min`
  if (min < 1440) return `${Math.round(min / 60)}h`
  return `${Math.round(min / 1440)}d`
}

const EMPTY_FORM: ContractFormData = {
  name: '',
  tier: 'custom',
  p0_response_min: 15,
  p1_response_min: 60,
  p2_response_min: 240,
  p3_response_min: 1440,
  p0_resolution_min: 240,
  p1_resolution_min: 480,
  p2_resolution_min: 1440,
  p3_resolution_min: 4320,
}

export function SlaContractsClient({
  contracts: initial,
  isAdmin,
}: {
  contracts: SlaContract[]
  isAdmin: boolean
}) {
  const [contracts, setContracts] = useState<SlaContract[]>(initial)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<SlaContract | null>(null)
  const [form, setForm] = useState<ContractFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setEditingContract(null)
    setForm(EMPTY_FORM)
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(c: SlaContract) {
    setEditingContract(c)
    setForm({
      name: c.name,
      tier: c.tier,
      p0_response_min: c.p0ResponseMin,
      p1_response_min: c.p1ResponseMin,
      p2_response_min: c.p2ResponseMin,
      p3_response_min: c.p3ResponseMin,
      p0_resolution_min: c.p0ResolutionMin,
      p1_resolution_min: c.p1ResolutionMin,
      p2_resolution_min: c.p2ResolutionMin,
      p3_resolution_min: c.p3ResolutionMin,
    })
    setError(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      if (editingContract) {
        await adminSlaContractsApi.update(editingContract.id, form)
      } else {
        await adminSlaContractsApi.create(form)
      }
      // Refresh list
      const listJson = await adminSlaContractsApi.list()
      setContracts(listJson.data)
      setDialogOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  function numField(key: keyof ContractFormData) {
    return (
      <Input
        type="number"
        min={1}
        value={form[key] as number}
        onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
        className="h-8 text-sm"
      />
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contratos SLA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Perfis de SLA por nível de contrato (Standard, Premium, Enterprise)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/companies">
              <Building2 className="w-4 h-4 mr-2" />
              Empresas
            </Link>
          </Button>
          {isAdmin && (
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Contrato
            </Button>
          )}
        </div>
      </div>

      {/* Contract Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contracts.map(c => (
          <div
            key={c.id}
            className="bg-card rounded-xl p-5 transition-shadow hover:shadow-[var(--shadow-alta)] shadow-[var(--shadow-media)]"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-semibold text-foreground text-base">{c.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIER_COLORS[c.tier] ?? TIER_COLORS.custom}`}>
                    {TIER_LABELS[c.tier] ?? c.tier}
                  </span>
                  {/* `_count` é resto do Prisma: o runtime da plataforma devolve a
                      linha crua, sem contagem de relação. Ler direto derrubava a tela
                      inteira ("undefined is not an object"). Some o selo quando o
                      número não vem — melhor não mostrar do que mostrar zero, que
                      leria como "nenhuma empresa". */}
                  {typeof c._count?.companies === 'number' && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="w-3 h-3" />
                      {c._count.companies} empresa{c._count.companies !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => openEdit(c)}
                  className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-foreground/80 hover:bg-muted transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Response / Resolution grid */}
            <div className="mt-3 space-y-1.5">
              <div className="grid grid-cols-3 gap-1 text-xs font-medium text-muted-foreground px-1">
                <span>Severidade</span>
                <span className="text-center">Resposta</span>
                <span className="text-center">Resolução</span>
              </div>
              {(
                [
                  ['P0', c.p0ResponseMin, c.p0ResolutionMin, 'text-sem-error-fg'],
                  ['P1', c.p1ResponseMin, c.p1ResolutionMin, 'text-sem-warning-fg'],
                  ['P2', c.p2ResponseMin, c.p2ResolutionMin, 'text-yellow-600'],
                  ['P3', c.p3ResponseMin, c.p3ResolutionMin, 'text-foreground/60'],
                ] as [string, number, number, string][]
              ).map(([sev, resp, resol, color]) => (
                <div key={sev} className="grid grid-cols-3 gap-1 bg-muted/50 rounded-lg px-2 py-1.5 text-xs">
                  <span className={`font-semibold ${color}`}>{sev}</span>
                  <span className="text-center text-foreground/80 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 text-muted-foreground/70" />
                    {fmtMin(resp)}
                  </span>
                  <span className="text-center text-foreground/80 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-muted-foreground/70" />
                    {fmtMin(resol)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {contracts.length === 0 && (
          <div className="col-span-3 text-center py-16 text-muted-foreground/70">
            <p className="text-sm">Nenhum contrato SLA cadastrado.</p>
            {isAdmin && (
              <Button variant="outline" className="mt-4" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Criar primeiro contrato
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingContract ? `Editar: ${editingContract.name}` : 'Novo Contrato SLA'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {error && (
              <div className="flex items-center gap-2 bg-sem-error text-sem-error-fg text-sm px-3 py-2 rounded-lg border border-sem-error-bd">
                <X className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome do Contrato</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Premium Gold"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={form.tier} onValueChange={v => setForm(f => ({ ...f, tier: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tempos de Resposta (minutos)
              </p>
              <div className="grid grid-cols-4 gap-3">
                {(['P0', 'P1', 'P2', 'P3'] as const).map((sev, i) => (
                  <div key={sev} className="space-y-1">
                    <Label className="text-xs">{sev}</Label>
                    {numField(`p${i}_response_min` as keyof ContractFormData)}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tempos de Resolução (minutos)
              </p>
              <div className="grid grid-cols-4 gap-3">
                {(['P0', 'P1', 'P2', 'P3'] as const).map((sev, i) => (
                  <div key={sev} className="space-y-1">
                    <Label className="text-xs">{sev}</Label>
                    {numField(`p${i}_resolution_min` as keyof ContractFormData)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingContract ? 'Salvar Alterações' : 'Criar Contrato'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
