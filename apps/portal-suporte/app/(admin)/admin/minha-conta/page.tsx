'use client'

import { useState, useEffect, useCallback } from 'react'
import { AdminHeader } from '@/components/admin/admin-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertCircle, CheckCircle, KeyRound, User,
  Copy, Plus, Trash2, Clock, ShieldCheck,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { formatDateShort } from '@/lib/utils'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

// ─── helpers ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-4 bg-card rounded-lg shadow-[var(--shadow-media)]">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

const ROLE_LABELS: Record<string, string> = {
  admin:  'Administrador',
  agent:  'Agente',
  client: 'Cliente',
}

// ─── component ──────────────────────────────────────────────────────────────

export default function MinhaContaPage() {
  const { toast } = useToast()

  // Profile
  const [profile, setProfile] = useState<any>(null)
  const [fullName, setFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Password
  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [savingPw,   setSavingPw]   = useState(false)
  const [pwMsg,      setPwMsg]      = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Stats
  const [stats, setStats] = useState<any>(null)

  // Invites (admin only)
  const [invites,       setInvites]       = useState<any[]>([])
  const [newInviteRole, setNewInviteRole] = useState('developer')
  const [newInviteDays, setNewInviteDays] = useState('')
  const [newInviteLabel, setNewInviteLabel] = useState('')
  const [creatingInvite, setCreatingInvite] = useState(false)

  const loadProfile = useCallback(async () => {
    const res = await araraApiFetch('/api/auth/me')
    if (res.ok) {
      const data = await res.json()
      setProfile(data)
      setFullName(data.full_name ?? '')
    }
  }, [])

  const loadStats = useCallback(async () => {
    const res = await araraApiFetch('/api/tickets/my-stats')
    if (res.ok) setStats(await res.json())
  }, [])

  const loadInvites = useCallback(async () => {
    const res = await araraApiFetch('/api/invites?used=true')
    if (res.ok) setInvites(await res.json())
  }, [])

  useEffect(() => {
    loadProfile()
    loadStats()
  }, [loadProfile, loadStats])

  useEffect(() => {
    if (profile?.role === 'admin') loadInvites()
  }, [profile, loadInvites])

  // ── save profile name ────────────────────────────────────────────────────

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileMsg(null)
    setSavingProfile(true)
    try {
      const res = await araraApiFetch(`/api/profiles/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setProfileMsg({ type: 'ok', text: 'Perfil atualizado com sucesso!' })
      loadProfile()
    } catch (err: unknown) {
      setProfileMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao salvar' })
    } finally {
      setSavingProfile(false)
    }
  }

  // ── change password ───────────────────────────────────────────────────────

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (newPw !== confirmPw) { setPwMsg({ type: 'err', text: 'Senhas não coincidem' }); return }
    if (newPw.length < 6)    { setPwMsg({ type: 'err', text: 'Mínimo 6 caracteres' }); return }

    setSavingPw(true)
    try {
      const res = await araraApiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso!' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err: unknown) {
      setPwMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao alterar senha' })
    } finally {
      setSavingPw(false)
    }
  }

  // ── invites ───────────────────────────────────────────────────────────────

  async function handleCreateInvite() {
    setCreatingInvite(true)
    try {
      const body: Record<string, unknown> = { role: newInviteRole }
      if (newInviteLabel) body.label = newInviteLabel
      if (newInviteDays)  body.expires_in_days = parseInt(newInviteDays)

      const res = await araraApiFetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Convite criado!', description: `Código: ${json.code}` })
      setNewInviteLabel('')
      setNewInviteDays('')
      loadInvites()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao criar convite',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      })
    } finally {
      setCreatingInvite(false)
    }
  }

  async function handleDeleteInvite(id: string) {
    const res = await araraApiFetch(`/api/invites?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast({ title: 'Convite revogado' })
      loadInvites()
    } else {
      const json = await res.json()
      toast({ title: 'Erro', description: json.error, variant: 'destructive' })
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    toast({ title: 'Código copiado!' })
  }

  if (!profile) {
    return (
      <div className="pt-14 lg:pt-0">
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <p className="text-muted-foreground/70">Carregando...</p>
        </div>
      </div>
    )
  }

  const activeInvites  = invites.filter(i => !i.used && !i.expired)
  const usedInvites    = invites.filter(i => i.used)

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-4xl px-4 pt-6 pb-8 lg:py-8 sm:px-6 lg:px-8">
        {/* Profile header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {(profile.full_name || profile.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{profile.full_name || profile.email}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </Badge>
              <span className="text-sm text-muted-foreground">{profile.email}</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatCard label="Total de chamados" value={stats.total}         color="text-foreground" />
            <StatCard label="Em aberto"          value={stats.open}          color="text-blue-600"  />
            <StatCard label="Resolvidos"          value={stats.resolved}      color="text-sem-success-fg" />
            <StatCard label="Mensagens enviadas"  value={stats.messages_sent} color="text-purple-600"/>
          </div>
        )}

        <Tabs defaultValue="perfil">
          <TabsList className="bg-background border border-border shadow-sm mb-6">
            <TabsTrigger value="perfil"  className="gap-1.5"><User      className="w-4 h-4" />Perfil</TabsTrigger>
            <TabsTrigger value="senha"   className="gap-1.5"><KeyRound  className="w-4 h-4" />Senha</TabsTrigger>
            {profile.role === 'admin' && (
              <TabsTrigger value="convites" className="gap-1.5"><ShieldCheck className="w-4 h-4" />Convites</TabsTrigger>
            )}
          </TabsList>

          {/* ── PERFIL ──────────────────────────────────────────────────── */}
          <TabsContent value="perfil">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informações do Perfil</CardTitle>
                <CardDescription>Atualize seu nome de exibição</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
                  <div className="space-y-1.5">
                    <Label>Nome completo</Label>
                    <Input
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Seu nome"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input value={profile.email} disabled className="bg-muted/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Função</Label>
                    <Input value={ROLE_LABELS[profile.role] ?? profile.role} disabled className="bg-muted/50" />
                  </div>

                  {profileMsg && (
                    <Alert variant={profileMsg.type === 'err' ? 'destructive' : 'default'}
                      className={profileMsg.type === 'ok' ? 'border-sem-success-bd bg-sem-success text-sem-success-fg' : ''}>
                      {profileMsg.type === 'ok'
                        ? <CheckCircle className="h-4 w-4 text-sem-success-fg" />
                        : <AlertCircle className="h-4 w-4" />}
                      <AlertDescription>{profileMsg.text}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? 'Salvando...' : 'Salvar alterações'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── SENHA ───────────────────────────────────────────────────── */}
          <TabsContent value="senha">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alterar Senha</CardTitle>
                <CardDescription>Escolha uma senha forte</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div className="space-y-1.5">
                    <Label>Senha atual</Label>
                    <Input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nova senha</Label>
                    <Input type="password" placeholder="Mínimo 6 caracteres" value={newPw} onChange={e => setNewPw(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirmar nova senha</Label>
                    <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required />
                  </div>

                  {pwMsg && (
                    <Alert variant={pwMsg.type === 'err' ? 'destructive' : 'default'}
                      className={pwMsg.type === 'ok' ? 'border-sem-success-bd bg-sem-success text-sem-success-fg' : ''}>
                      {pwMsg.type === 'ok'
                        ? <CheckCircle className="h-4 w-4 text-sem-success-fg" />
                        : <AlertCircle className="h-4 w-4" />}
                      <AlertDescription>{pwMsg.text}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" disabled={savingPw}>
                    {savingPw ? 'Salvando...' : 'Alterar Senha'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── CONVITES (admin only) ────────────────────────────────────── */}
          {profile.role === 'admin' && (
            <TabsContent value="convites" className="space-y-6">
              {/* Create new invite */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Criar Convite</CardTitle>
                  <CardDescription>Gere um código de convite para novos funcionários</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                    <div className="space-y-1.5">
                      <Label>Função</Label>
                      <Select value={newInviteRole} onValueChange={setNewInviteRole}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agent">Agente</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Rótulo <span className="text-muted-foreground/70">(opcional)</span></Label>
                      <Input
                        placeholder="Ex: João Silva"
                        value={newInviteLabel}
                        onChange={e => setNewInviteLabel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Expira em (dias) <span className="text-muted-foreground/70">(opcional)</span></Label>
                      <Input
                        type="number"
                        min="1"
                        max="365"
                        placeholder="Ex: 7"
                        value={newInviteDays}
                        onChange={e => setNewInviteDays(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button className="mt-4" onClick={handleCreateInvite} disabled={creatingInvite}>
                    <Plus className="w-4 h-4 mr-2" />
                    {creatingInvite ? 'Gerando...' : 'Gerar Convite'}
                  </Button>
                </CardContent>
              </Card>

              {/* Active invites */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Convites Ativos
                    <Badge variant="secondary">{activeInvites.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {activeInvites.length === 0 ? (
                    <p className="text-sm text-muted-foreground/70 italic">Nenhum convite ativo</p>
                  ) : (
                    <div className="space-y-2">
                      {activeInvites.map(inv => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <code className="font-mono text-sm font-bold tracking-widest text-sem-info-fg bg-sem-info px-2 py-0.5 rounded">
                              {inv.code}
                            </code>
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {ROLE_LABELS[inv.role] ?? inv.role}
                                </Badge>
                                {inv.label && (
                                  <span className="text-sm text-foreground/60">{inv.label}</span>
                                )}
                              </div>
                              {inv.expires_at && (
                                <p className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Expira em {formatDateShort(inv.expires_at)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline" size="sm"
                              onClick={() => copyCode(inv.code)}
                            >
                              <Copy className="w-3.5 h-3.5 mr-1" />Copiar
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="text-sem-error-fg hover:text-sem-error-fg hover:bg-sem-error"
                              onClick={() => handleDeleteInvite(inv.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Used invites */}
              {usedInvites.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      Convites Utilizados
                      <Badge variant="secondary">{usedInvites.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {usedInvites.map(inv => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border/50 opacity-60"
                        >
                          <div className="flex items-center gap-3">
                            <code className="font-mono text-sm tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded line-through">
                              {inv.code}
                            </code>
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {ROLE_LABELS[inv.role] ?? inv.role}
                                </Badge>
                                {inv.label && <span className="text-sm text-muted-foreground">{inv.label}</span>}
                              </div>
                              {inv.used_by && (
                                <p className="text-xs text-muted-foreground/70 mt-0.5">
                                  Usado por {inv.used_by.full_name || inv.used_by.email}
                                  {inv.used_at && ` em ${formatDateShort(inv.used_at)}`}
                                </p>
                              )}
                            </div>
                          </div>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
