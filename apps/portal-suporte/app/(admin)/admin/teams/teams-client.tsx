'use client'

import { useState } from 'react'
import { adminTeamsApi } from '@/lib/api/admin'
import { getInitials } from '@/lib/utils'
import { Users, Plus, Pencil, Trash2, UserPlus, Crown, X, ChevronDown, ChevronUp, Ticket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const COLOR_OPTIONS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Rose' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#0ea5e9', label: 'Sky' },
]

interface AgentInfo {
  id: string
  fullName: string | null
  avatarUrl: string | null
  role: string
  email: string | null
}

interface TeamMemberInfo {
  teamId: string
  profileId: string
  isLead: boolean
  profile: AgentInfo
}

interface TeamInfo {
  id: string
  name: string
  description: string | null
  color: string
  active: boolean
  members?: TeamMemberInfo[]
  _count?: { tickets?: number }
}

const EMPTY_FORM = { name: '', description: '', color: '#6366f1' }

export function TeamsClient({
  initialTeams,
  agents,
}: {
  initialTeams: TeamInfo[]
  agents: AgentInfo[]
}) {
  const [teams, setTeams] = useState<TeamInfo[]>(initialTeams)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'create' | 'edit' | 'add-member' | 'deactivate' | null>(null)
  const [selected, setSelected] = useState<TeamInfo | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [memberForm, setMemberForm] = useState({ profileId: '', isLead: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function refreshTeams() {
    const json = await adminTeamsApi.list()
    if (json.success) setTeams(json.data)
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setError(null)
    setDialog('create')
  }

  function openEdit(team: TeamInfo) {
    setSelected(team)
    setForm({ name: team.name, description: team.description ?? '', color: team.color })
    setError(null)
    setDialog('edit')
  }

  function openDeactivate(team: TeamInfo) {
    setSelected(team)
    setDialog('deactivate')
  }

  function openAddMember(team: TeamInfo) {
    setSelected(team)
    setMemberForm({ profileId: '', isLead: false })
    setError(null)
    setDialog('add-member')
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id))
  }

  async function saveTeam() {
    setSaving(true)
    setError(null)
    try {
      const json = dialog === 'edit'
        ? await adminTeamsApi.update(selected!.id, form)
        : await adminTeamsApi.create(form)
      if (!json.success) { setError('Erro ao salvar equipe'); return }
      await refreshTeams()
      setDialog(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar equipe')
    } finally {
      setSaving(false)
    }
  }

  async function deactivateTeam() {
    setSaving(true)
    try {
      await adminTeamsApi.delete(selected!.id)
      await refreshTeams()
      setDialog(null)
      if (expanded === selected!.id) setExpanded(null)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  async function addMember() {
    if (!memberForm.profileId) { setError('Selecione um membro'); return }
    setSaving(true)
    setError(null)
    try {
      const json = await adminTeamsApi.addMember(selected!.id, {
        profile_id: memberForm.profileId,
        is_lead: memberForm.isLead,
      })
      if (!json.success) { setError('Erro ao adicionar membro'); return }
      await refreshTeams()
      setDialog(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar membro')
    } finally {
      setSaving(false)
    }
  }

  async function removeMember(teamId: string, profileId: string) {
    try {
      await adminTeamsApi.removeMember(teamId, profileId)
      await refreshTeams()
    } catch {
      // ignore
    }
  }

  // Agents not already in the selected team
  const availableAgents = selected
    ? agents.filter((a) => !selected.members.some((m) => m.profileId === a.id))
    : agents

  return (
    <div className="min-h-screen bg-sidebar p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20">
            <Users className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Equipes</h1>
            <p className="text-sm text-muted-foreground/70">{teams.length} equipe{teams.length !== 1 ? 's' : ''} ativa{teams.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          <Plus className="h-4 w-4" />
          Nova Equipe
        </Button>
      </div>

      {/* Teams grid */}
      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Nenhuma equipe cadastrada</p>
          <Button variant="ghost" onClick={openCreate} className="mt-4 text-indigo-400 hover:text-indigo-300 gap-1">
            <Plus className="h-4 w-4" />
            Criar primeira equipe
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const isOpen = expanded === team.id
            // O runtime da plataforma devolve a linha do time como ela está no
            // banco: sem os membros embutidos e sem `_count`, que eram enfeites
            // do Prisma. Sem esta rede, `team.members.length` derrubava a tela.
            const membros = team.members ?? []
            return (
              <div
                key={team.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Card header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: team.color }}
                      />
                      <h2 className="text-foreground font-semibold text-base truncate">{team.name}</h2>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(team)}
                        className="p-1.5 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                        title="Editar equipe"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => openDeactivate(team)}
                        className="p-1.5 rounded-md text-muted-foreground/70 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        title="Desativar equipe"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {team.description && (
                    <p className="text-muted-foreground/70 text-sm mt-1.5 line-clamp-2">{team.description}</p>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground/70 text-xs">
                      <Users className="h-3.5 w-3.5" />
                      <span>{membros.length} membro{membros.length !== 1 ? 's' : ''}</span>
                    </div>
                    {typeof team._count?.tickets === 'number' && (
                      <div className="flex items-center gap-1.5 text-muted-foreground/70 text-xs">
                        <Ticket className="h-3.5 w-3.5" />
                        <span>{team._count.tickets} ticket{team._count.tickets !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expand toggle */}
                <button
                  onClick={() => toggleExpand(team.id)}
                  className="w-full px-4 py-2 flex items-center justify-between text-xs text-muted-foreground/70 hover:text-foreground hover:bg-muted border-t border-border transition-colors"
                >
                  <span>{isOpen ? 'Ocultar membros' : 'Ver membros'}</span>
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {/* Expanded members */}
                {isOpen && (
                  <div className="border-t border-border bg-muted/40 p-3 space-y-2">
                    {membros.length === 0 ? (
                      <p className="text-muted-foreground text-xs text-center py-2">Nenhum membro ainda</p>
                    ) : (
                      membros.map((member) => (
                        <div
                          key={member.profileId}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {member.profile.avatarUrl ? (
                              <img
                                src={member.profile.avatarUrl}
                                alt={member.profile.fullName ?? ''}
                                className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center flex-shrink-0 text-xs text-white font-medium">
                                {getInitials(member.profile.fullName)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-foreground text-xs font-medium truncate">
                                {member.profile.fullName ?? '—'}
                              </p>
                              <p className="text-muted-foreground text-[10px] capitalize">{member.profile.role}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {member.isLead && (
                              <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 text-[10px] px-1.5 py-0 gap-1">
                                <Crown className="h-2.5 w-2.5" />
                                Lead
                              </Badge>
                            )}
                            <button
                              onClick={() => removeMember(team.id, member.profileId)}
                              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-900/20 transition-colors"
                              title="Remover membro"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Add member button */}
                    <button
                      onClick={() => openAddMember(team)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 mt-1 rounded-md border border-dashed border-border text-muted-foreground/70 hover:text-foreground hover:border-indigo-500 text-xs transition-colors"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Adicionar membro
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit Team Dialog ── */}
      <Dialog open={dialog === 'create' || dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog === 'edit' ? 'Editar Equipe' : 'Nova Equipe'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {error && (
              <p className="text-sm text-sem-error-fg bg-sem-error border border-sem-error-bd rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-muted-foreground/50">Nome *</Label>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ex: Suporte Técnico"
                className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground/50">Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Descrição opcional da equipe"
                rows={3}
                className="bg-background border-border text-foreground placeholder:text-muted-foreground resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground/50">Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set('color', c.value)}
                    title={c.label}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 transition-all',
                      form.color === c.value
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-transparent hover:border-border'
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecionado: {COLOR_OPTIONS.find((c) => c.value === form.color)?.label ?? form.color}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDialog(null)}
              className="text-muted-foreground/70 hover:text-foreground"
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveTeam}
              disabled={saving || !form.name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? 'Salvando...' : dialog === 'edit' ? 'Salvar' : 'Criar Equipe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Member Dialog ── */}
      <Dialog open={dialog === 'add-member'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Membro</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {error && (
              <p className="text-sm text-sem-error-fg bg-sem-error border border-sem-error-bd rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {selected && (
              <p className="text-muted-foreground/70 text-sm">
                Equipe: <span className="text-foreground font-medium">{selected.name}</span>
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-muted-foreground/50">Agente</Label>
              {availableAgents.length === 0 ? (
                <p className="text-muted-foreground text-sm">Todos os agentes já fazem parte desta equipe.</p>
              ) : (
                <Select
                  value={memberForm.profileId}
                  onValueChange={(v) => setMemberForm((f) => ({ ...f, profileId: v }))}
                >
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    {availableAgents.map((agent) => (
                      <SelectItem
                        key={agent.id}
                        value={agent.id}
                        className="text-foreground hover:bg-muted focus:bg-muted"
                      >
                        <span className="flex items-center gap-2">
                          <span>{agent.fullName ?? agent.email ?? agent.id}</span>
                          <span className="text-muted-foreground/70 text-xs capitalize">({agent.role})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is-lead"
                type="checkbox"
                checked={memberForm.isLead}
                onChange={(e) => setMemberForm((f) => ({ ...f, isLead: e.target.checked }))}
                className="w-4 h-4 accent-indigo-500"
              />
              <Label htmlFor="is-lead" className="text-muted-foreground/50 cursor-pointer flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                Definir como Lead
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDialog(null)}
              className="text-muted-foreground/70 hover:text-foreground"
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={addMember}
              disabled={saving || !memberForm.profileId || availableAgents.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate Confirm Dialog ── */}
      <Dialog open={dialog === 'deactivate'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>Desativar Equipe</DialogTitle>
          </DialogHeader>

          <p className="text-muted-foreground/50 text-sm py-2">
            Tem certeza que deseja desativar a equipe{' '}
            <span className="text-foreground font-semibold">{selected?.name}</span>? Os tickets associados
            não serão afetados.
          </p>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDialog(null)}
              className="text-muted-foreground/70 hover:text-foreground"
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={deactivateTeam}
              disabled={saving}
              className="bg-red-700 hover:bg-red-800 text-white"
            >
              {saving ? 'Desativando...' : 'Desativar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
