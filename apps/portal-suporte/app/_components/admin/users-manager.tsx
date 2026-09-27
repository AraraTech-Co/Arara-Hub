'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort, mascaraTelefone, soDigitosTelefone } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import {
  Search, UserPlus, Pencil, Trash2, Users, ShieldCheck, Headphones,
  User, Ticket, Copy, Check, Plus, Clock, X, KeyRound,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { companiesApi } from '@/lib/api/companies'
import { usersApi, type UserProfile as Profile, type UserRole, type StaffPosition } from '@/lib/api/users'
import { FEATURE_GRANTS } from '@/lib/auth/feature-grants'
import { useAuth } from '@/lib/arara/AuthProvider'
import { AdicionarMembroDialog } from './adicionar-membro-dialog'

interface Company {
  id: string
  name: string
  cnpj?: string | null
}

interface Unit {
  id: string
  name: string
  city?: string | null
}

const roleConfig: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  master:    { label: 'Master',         color: 'bg-sem-error text-sem-error-fg',     icon: ShieldCheck },
  admin:     { label: 'Administrador',  color: 'bg-status-triage text-status-triage-fg', icon: ShieldCheck },
  developer: { label: 'Desenvolvedor',  color: 'bg-sem-info text-sem-info-fg',   icon: Headphones },
  // `support` faltava neste mapa, então os 7 operadores caíam no rótulo de
  // reserva e apareciam como "Usuário" — o mesmo crachá do cliente, numa tela
  // usada para conceder acesso. Quem lê a lista não tinha como distinguir
  // atendente de cliente.
  support:   { label: 'Suporte',        color: 'bg-status-in-progress text-status-in-progress-fg', icon: Headphones },
  user:      { label: 'Cliente',        color: 'bg-sem-success text-sem-success-fg', icon: User },
}

// Função/especialidade — só rótulo de organização, não afeta o acesso ao sistema (esse é o `role`).
const positionLabels: Record<StaffPosition, string> = {
  agente_suporte: 'Agente de Suporte',
  desenvolvedor:  'Desenvolvedor',
  administrador:  'Administrador',
}

interface Props {
  audience: 'team' | 'client'
}

export function UsersManager({ audience }: Props) {
  const isTeam = audience === 'team'

  const [users, setUsers] = useState<Profile[]>([])
  const [filtered, setFiltered] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>(isTeam ? 'developer' : 'user')
  const [newPosition, setNewPosition] = useState<StaffPosition | ''>('')
  const [newCompanyId, setNewCompanyId] = useState('')
  const [newUnitId, setNewUnitId] = useState('')
  const [newExpiresAt, setNewExpiresAt] = useState('')
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('user')
  const [editPosition, setEditPosition] = useState<StaffPosition | ''>('')
  // Telefone: é por ele que a recuperação de senha vai funcionar. Preencher o
  // da equipe é o que destrava a recuperação para quem já tem conta — quem
  // ficar sem número não tem caminho de volta se esquecer a senha.
  const [editPhone, setEditPhone] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('')
  const [editCompanyId, setEditCompanyId] = useState('')
  const [editUnitId, setEditUnitId] = useState('')
  const [editExpiresAt, setEditExpiresAt] = useState('')
  const [editGrants, setEditGrants] = useState<string[]>([])
  // Conceder permissões extras é ação de master. Só a VISIBILIDADE do bloco
  // depende disto; quem grava de verdade é o servidor, que ignora o campo para
  // quem não é master.
  //
  // O nível vem da plataforma (roles do JWT) — antes vinha do cookie
  // `portal_access_level`, que não existe mais no modelo client-only: o bloco
  // simplesmente nunca aparecia.
  const { user: authUser } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [newUnits, setNewUnits] = useState<Unit[]>([])
  const [editUnits, setEditUnits] = useState<Unit[]>([])
  const { toast } = useToast()

  // Auto-provisão da credencial da recuperação de senha (20/08). O controller
  // que valida o código do WhatsApp precisa autorizar na plataforma com a
  // chave do app — e só JWT de pessoa grava segredo no cofre. Então, quando um
  // admin logado (com JWT) abre esta tela, gravamos `portal_api_key` uma vez.
  // Idempotente e silencioso: se já existe, ou se não há JWT agora, nada acontece.
  useEffect(() => {
    ;(async () => {
      try {
        const { getJwt, getAppApiKey } = await import('@/lib/arara/auth-storage')
        if (!getJwt()) return
        const key = getAppApiKey('portal-suporte')
        if (!key) return
        const { appSecretsApi } = await import('@/lib/api/app-secrets')
        const atuais = await appSecretsApi.list()
        const nomes = new Set((atuais.secrets || []).map((sec) => sec.name))
        if (!nomes.has('portal_api_key')) await appSecretsApi.set('portal_api_key', key)
        // Portão público do "esqueci a senha" (modo webhook_secret): o valor é
        // uma CONSTANTE conhecida — ele só satisfaz o modo da plataforma; a
        // segurança do fluxo é do controller. Mesmo valor no forgot-password.
        if (!nomes.has('portal_publico_token')) {
          await appSecretsApi.set('portal_publico_token', 'portal-suporte-recuperacao-publica')
        }
      } catch {
        // cortesia — a tela de Membros não depende disso
      }
    })()
  }, [])

  // Master pelas DUAS fontes: a role do JWT da plataforma OU o Profile do app.
  // Na plataforma Arara a role do token não é a role do app — o master do
  // portal pode carregar um JWT "admin", e a checagem só no token escondia o
  // bloco de permissões extras de quem mais precisa dele. A visibilidade é só
  // cortesia: quem grava de verdade é o servidor (PUT /profiles/:id descarta
  // role e feature_grants de quem não é admin+).
  const isMaster = useMemo(() => {
    if ((authUser?.roles ?? []).some((r) => String(r).toLowerCase() === 'master')) return true
    const meu = users.find((u) => String(u.id) === String(authUser?.id))
    return String(meu?.role ?? '').toLowerCase() === 'master'
  }, [authUser, users])

  // Invite codes (team only)
  const [invites, setInvites] = useState<any[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [inviteRole, setInviteRole] = useState<'developer' | 'admin'>('developer')
  const [inviteLabel, setInviteLabel] = useState('')
  const [inviteExpiry, setInviteExpiry] = useState('7')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [creatingInvite, setCreatingInvite] = useState(false)

  // Recovery codes (team only)
  const [recoveryTarget, setRecoveryTarget] = useState<Profile | null>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [generatingCode, setGeneratingCode] = useState(false)
  // Redefinição de senha — DESTRAVADA em 20/08: a plataforma entregou
  // POST /v1/users/:id/password (bcrypt, mínimo 8; app key autoriza reset).
  // Profile.id === users.id (identidade canônica), então o id do membro é o id
  // da conta. A chamada vai DIRETO à plataforma com a app key do staff logado.
  const [resetSenha, setResetSenha] = useState('')
  const [resetando, setResetando] = useState(false)

  async function redefinirSenha() {
    if (!editUser || resetSenha.length < 8) return
    setResetando(true)
    try {
      const { ARARA_URL } = await import('@/lib/arara/client')
      const { getAppApiKey } = await import('@/lib/arara/auth-storage')
      const key = getAppApiKey('portal-suporte')
      if (!key) throw new Error('Sessão sem chave do app — entre novamente.')
      const r = await fetch(`${ARARA_URL}/v1/users/${editUser.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ password: resetSenha }),
      })
      const corpo = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(corpo.error || `HTTP ${r.status}`)
      setResetSenha('')
      toast({
        title: 'Senha redefinida',
        description: `${editUser.full_name || editUser.email} já pode entrar com a nova senha — em todos os sistemas Arara.`,
      })
    } catch (e) {
      toast({ title: 'Erro ao redefinir', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setResetando(false)
    }
  }
  const [copiedRecovery, setCopiedRecovery] = useState(false)

  async function handleGenerateRecovery(user: Profile) {
    // DESATIVADO em 17/08, pela mesma razão do set-password: a rota é um stub
    // que grava um registro e nada o consome — a redefinição de senha
    // (`/auth/reset-with-code`) é 501. O código gerado aqui nunca redefiniu
    // senha nenhuma; entregá-lo ao usuário só produziria uma tentativa
    // frustrada a mais. Ver docs/plans/plano-senhas-portal.md.
    void user
    toast({
      title: 'Código de recuperação indisponível',
      description:
        'A redefinição de senha depende de uma rota que a plataforma ainda não expõe. ' +
        'Para dar acesso, gere um código de CONVITE e peça que a pessoa crie a conta.',
      variant: 'destructive',
    })
  }

  function copyRecoveryCode() {
    if (!recoveryCode) return
    navigator.clipboard.writeText(recoveryCode)
    setCopiedRecovery(true)
    setTimeout(() => setCopiedRecovery(false), 2000)
  }

  const loadInvites = useCallback(async () => {
    if (!isTeam) return
    try {
      const j = await usersApi.listInviteCodes()
      setInvites(j.data ?? [])
    } catch { /* silent */ }
  }, [isTeam])

  async function handleCreateInvite() {
    setCreatingInvite(true)
    try {
      await usersApi.createInviteCode({ role: inviteRole, label: inviteLabel, expiresInDays: Number(inviteExpiry) })
      toast({ title: 'Código gerado com sucesso' })
      setShowInvite(false)
      setInviteLabel('')
      loadInvites()
    } catch (err: unknown) {
      toast({ title: 'Erro', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' })
    } finally {
      setCreatingInvite(false)
    }
  }

  async function handleRevokeInvite(id: string) {
    await usersApi.deleteInviteCode(id)
    toast({ title: 'Código revogado' })
    loadInvites()
  }

  function copyCode(code: string, id: string) {
    navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const loadCompanies = useCallback(async () => {
    if (isTeam) return
    try {
      const j = await companiesApi.list({ limit: 200 })
      setCompanies(j.data ?? [])
    } catch { /* silent */ }
  }, [isTeam])

  const loadUnitsForCompany = useCallback(async (companyId: string, target: 'new' | 'edit') => {
    if (!companyId) {
      if (target === 'new') setNewUnits([])
      else setEditUnits([])
      return
    }
    try {
      const j = await companiesApi.listUnits(companyId)
      const units = j.data ?? []
      if (target === 'new') setNewUnits(units)
      else setEditUnits(units)
    } catch { /* silent */ }
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const json = await usersApi.list()
      const all: Profile[] = json.data ?? []
      setUsers(isTeam ? all.filter(u => u.role !== 'user') : all.filter(u => u.role === 'user'))
    } catch (err: unknown) {
      toast({ title: 'Erro ao carregar usuários', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' })
    }
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
    loadInvites()
    loadCompanies()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      users.filter(u =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? '').toLowerCase().includes(q)
      )
    )
  }, [search, users])

  async function handleCreate() {
    // Criação direta DESATIVADA em 17/08. `POST /admin/users` era um stub que
    // criava um registro no model do app — não uma identidade na plataforma,
    // que é quem valida o login — e ainda gravava a senha em TEXTO PURO.
    // Quem "nascia" aqui nunca conseguia entrar.
    //
    // O caminho que funciona: código de convite + a tela “Criar conta”, que
    // registra na plataforma e depois resgata o papel.
    // Ver docs/plans/plano-senhas-portal.md.
    toast({
      title: 'Criação direta desativada',
      description:
        'Gere um código de convite e peça que a pessoa crie a conta em “Criar conta”. ' +
        'É o único caminho que registra a identidade na plataforma.',
      variant: 'destructive',
    })
  }

  async function handleEdit() {
    if (!editUser) return
    // Mantido só para não quebrar o restante do formulário; o campo saiu.
    if (editPassword && editPassword !== editPasswordConfirm) {
      toast({ title: 'Senhas não conferem', description: 'A confirmação de senha não bate com a nova senha.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await usersApi.update(editUser.id, {
        full_name: editName,
        role: editRole,
        position: isTeam ? (editPosition || null) : null,
        company_id: isTeam ? null : (editCompanyId || null),
        unit_id: isTeam ? null : (editUnitId || null),
        expires_at: editExpiresAt || null,
        feature_grants: editGrants,
        phone: editPhone.replace(/\D/g, '') || null,
      })
      toast({ title: 'Usuário atualizado' })
      setEditUser(null)
      setEditPassword('')
      setEditPasswordConfirm('')
      setEditUnits([])
      loadUsers()
    } catch (err: unknown) {
      toast({ title: 'Erro ao atualizar', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' })
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!deleteUser) return
    setSaving(true)
    try {
      await usersApi.delete(deleteUser.id)
      toast({ title: 'Usuário excluído' })
      setDeleteUser(null)
      loadUsers()
    } catch (err: unknown) {
      toast({ title: 'Erro ao excluir', description: err instanceof Error ? err.message : 'Erro', variant: 'destructive' })
    }
    setSaving(false)
  }

  function getExpiryStatus(expiresAt?: string | null): null | 'warning' | 'expired' {
    if (!expiresAt) return null
    const exp = new Date(expiresAt)
    const now = new Date()
    if (exp < now) return 'expired'
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 15) return 'warning'
    return null
  }

  function getDaysUntilExpiry(expiresAt: string): number {
    const exp = new Date(expiresAt)
    const now = new Date()
    return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  const statsItems = isTeam
    ? [
        { label: 'Total Equipe',     value: users.length,                                                           icon: Users,      color: 'text-foreground/60'  },
        { label: 'Admins',           value: users.filter(u => u.role === 'admin' || u.role === 'master').length,    icon: ShieldCheck, color: 'text-purple-600' },
        { label: 'Suporte',          value: users.filter(u => String(u.role) === 'support').length,                         icon: Headphones,  color: 'text-sem-info-fg'   },
        { label: 'Desenvolvedores',  value: users.filter(u => u.role === 'developer').length,                       icon: Headphones,  color: 'text-sem-info-fg'   },
      ]
    : [
        { label: 'Total Clientes',   value: users.length,                                                           icon: Users,       color: 'text-foreground/60'  },
      ]

  const title       = isTeam ? 'Membros da Equipe'                           : 'Usuários (Clientes)'
  const description = isTeam ? 'Gerencie os membros da equipe e permissões'  : 'Cadastre, edite e gerencie os usuários clientes'
  const createLabel = isTeam ? 'Novo Membro'                                 : 'Novo Usuário'
  const listTitle   = isTeam ? 'Membros Cadastrados'                         : 'Usuários Cadastrados'
  const emptyDesc   = isTeam ? 'Adicione membros para conceder acesso ao painel.' : 'Adicione usuários para conceder acesso ao sistema.'

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-8 lg:py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-3xl font-bold text-foreground">{title}</h1>
            <p className="mt-1 text-foreground/60">{description}</p>
          </div>
          {/* Liberação direta pelo admin (15/09/2026): o convite não funciona para
              quem ainda não é membro do app na plataforma. */}
          {isTeam && <AdicionarMembroDialog onAdicionado={loadUsers} />}
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            {/* Para EQUIPE, "Novo Membro" abre direto o gerador de convite —
                o formulário antigo tinha campo de senha e um botão que sempre
                falhava ("criação direta desativada" é regra do servidor desde
                17/08). Manter a tela morta só gerava chamado de "está quebrado". */}
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={isTeam ? (e) => { e.preventDefault(); setShowInvite(true) } : undefined}>
                <UserPlus className="h-4 w-4" />
                {isTeam ? 'Convidar membro' : createLabel}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar {isTeam ? 'Membro da Equipe' : 'Novo Usuário'}</DialogTitle>
                <DialogDescription>
                  Preencha os dados para cadastrar {isTeam ? 'um novo membro' : 'um novo usuário'} no sistema.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label>Nome Completo</Label>
                  <Input placeholder="Nome do usuário" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" placeholder="email@exemplo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Senha</Label>
                  <Input type="password" placeholder="Mínimo 8 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  {newPassword && newPassword.length < 8 && (
                    <p className="text-xs text-destructive">A senha precisa ter pelo menos 8 caracteres.</p>
                  )}
                </div>
                {isTeam && (
                  <div className="space-y-1">
                    <Label>Perfil</Label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as UserRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="support">Suporte</SelectItem>
                        <SelectItem value="developer">Desenvolvedor</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {isTeam && (
                  <div className="space-y-1">
                    <Label>Função (opcional)</Label>
                    <Select
                      value={newPosition || 'none'}
                      onValueChange={(v) => setNewPosition(v === 'none' ? '' : (v as StaffPosition))}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecionar função..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {(Object.entries(positionLabels) as [StaffPosition, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {!isTeam && (
                  <>
                    <div className="space-y-1">
                      <Label>Empresa (opcional)</Label>
                      <Select
                        value={newCompanyId}
                        onValueChange={(v) => {
                          setNewCompanyId(v)
                          setNewUnitId('')
                          loadUnitsForCompany(v, 'new')
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecionar empresa..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Nenhuma</SelectItem>
                          {companies.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {newCompanyId && newUnits.length > 0 && (
                      <div className="space-y-1">
                        <Label>Unidade (opcional)</Label>
                        <Select value={newUnitId} onValueChange={setNewUnitId}>
                          <SelectTrigger><SelectValue placeholder="Selecionar unidade..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Nenhuma</SelectItem>
                            {newUnits.map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.name}{u.city ? ` — ${u.city}` : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
                <div className="space-y-1">
                  <Label>Expira em (opcional)</Label>
                  <Input type="date" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={saving || !newEmail || newPassword.length < 8}>
                  {saving ? 'Criando...' : isTeam ? 'Criar Membro' : 'Criar Usuário'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className={`mb-6 grid grid-cols-2 gap-4 ${isTeam ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
          {statsItems.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-8 w-8 ${color}`} />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle>{listTitle}</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon="👥"
                title="Nenhum usuário encontrado"
                description={search ? `Nenhum resultado para "${search}"` : emptyDesc}
                size="sm"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Perfil</TableHead>
                    {isTeam && <TableHead>Função</TableHead>}
                    {!isTeam && <TableHead>Empresa</TableHead>}
                    <TableHead>Validade</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => {
                    const cfg = roleConfig[u.role as UserRole] ?? roleConfig.user
                    const Icon = cfg.icon
                    const expiryStatus = getExpiryStatus(u.expires_at)
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.email}
                          {/* Quem está sem WhatsApp não tem como recuperar a
                              senha. Marcar na lista é o que permite varrer a
                              equipe e preencher o que falta, sem abrir um por
                              um para descobrir. */}
                          {!u.phone && (
                            <span className="ml-2 rounded-full border border-sem-warning-bd bg-sem-warning px-1.5 py-0.5 text-[10px] text-sem-warning-fg">
                              sem WhatsApp
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </TableCell>
                        {isTeam && (
                          <TableCell className="text-sm text-muted-foreground">
                            {u.position ? positionLabels[u.position] : '—'}
                          </TableCell>
                        )}
                        {!isTeam && (
                          <TableCell className="text-sm text-muted-foreground">
                            {u.company?.name || (u.company_id ? u.company_id.slice(0, 8) + '…' : '—')}
                          </TableCell>
                        )}
                        <TableCell>
                          {expiryStatus === 'expired' && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-sem-error text-sem-error-fg">
                              🚫 expirado
                            </span>
                          )}
                          {expiryStatus === 'warning' && u.expires_at && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-sem-warning text-sem-warning-fg">
                              ⚠️ expira em {getDaysUntilExpiry(u.expires_at)}d
                            </span>
                          )}
                          {!expiryStatus && u.expires_at && (
                            <span className="text-xs text-muted-foreground">
                              {formatDateShort(u.expires_at)}
                            </span>
                          )}
                          {!u.expires_at && <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDateShort(u.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isTeam && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Gerar código de recuperação de senha"
                                onClick={() => handleGenerateRecovery(u)}
                              >
                                <KeyRound className="h-4 w-4 text-indigo-600" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditUser(u)
                                setEditName(u.full_name ?? '')
                                setEditRole(u.role)
                                setEditPosition(u.position ?? '')
                                setEditPhone(u.phone ?? '')
                                setEditCompanyId(u.company_id ?? '')
                                setEditUnitId(u.unit_id ?? '')
                                setEditExpiresAt(u.expires_at ? u.expires_at.split('T')[0] : '')
                                setEditGrants(u.feature_grants ?? [])
                                if (u.company_id && !isTeam) loadUnitsForCompany(u.company_id, 'edit')
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteUser(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Invite Codes (team only) */}
        {isTeam && (
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="h-5 w-5 text-indigo-600" />
                  Códigos de Convite
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gere códigos para novos funcionários se cadastrarem como suporte, desenvolvedores ou administradores. A pessoa cria a própria senha em “Criar conta”.
                </p>
              </div>
              <Dialog open={showInvite} onOpenChange={setShowInvite}>
                <DialogTrigger asChild>
                  <Button className="gap-2" size="sm">
                    <Plus className="h-4 w-4" />
                    Gerar Código
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Gerar Código de Convite</DialogTitle>
                    <DialogDescription>
                      O funcionário usará este código ao criar a conta em{' '}
                      <strong>/auth/sign-up</strong> selecionando &ldquo;Sou Funcionário&rdquo;.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-1">
                      <Label>Perfil do funcionário</Label>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'developer' | 'admin')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="support">Suporte</SelectItem>
                        <SelectItem value="developer">Desenvolvedor</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Descrição (opcional)</Label>
                      <Input
                        placeholder="Ex: Para o João - N1"
                        value={inviteLabel}
                        onChange={(e) => setInviteLabel(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Expiração (dias)</Label>
                      <Select value={inviteExpiry} onValueChange={setInviteExpiry}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 dia</SelectItem>
                          <SelectItem value="3">3 dias</SelectItem>
                          <SelectItem value="7">7 dias</SelectItem>
                          <SelectItem value="30">30 dias</SelectItem>
                          <SelectItem value="0">Sem expiração</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowInvite(false)}>Cancelar</Button>
                    <Button onClick={handleCreateInvite} disabled={creatingInvite}>
                      {creatingInvite ? 'Gerando...' : 'Gerar Código'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum código gerado ainda. Clique em &ldquo;Gerar Código&rdquo; para criar um.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expira em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invites.map((inv) => {
                      const used    = !!inv.usedAt
                      const expired = inv.expiresAt && new Date(inv.expiresAt) < new Date()
                      return (
                        <TableRow key={inv.id} className={used ? 'opacity-60' : ''}>
                          <TableCell>
                            <span className="font-mono text-sm font-bold tracking-widest text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                              {inv.code}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{inv.label || '—'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${inv.role === 'admin' ? 'bg-status-triage text-status-triage-fg' : 'bg-sem-info text-sem-info-fg'}`}>
                              {inv.role === 'admin' ? <ShieldCheck className="h-3 w-3" /> : <Headphones className="h-3 w-3" />}
                              {inv.role === 'admin' ? 'Administrador' : 'Agente'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {used ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-sem-success text-sem-success-fg">
                                <Check className="h-3 w-3" /> Utilizado
                              </span>
                            ) : expired ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-sem-error text-sem-error-fg">
                                <X className="h-3 w-3" /> Expirado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-sem-success text-sem-success-fg">
                                <Clock className="h-3 w-3" /> Disponível
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateShort(inv.expiresAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!used && (
                                <Button variant="ghost" size="sm" onClick={() => copyCode(inv.code, inv.id)} title="Copiar código">
                                  {copiedId === inv.id
                                    ? <Check className="h-4 w-4 text-sem-success-fg" />
                                    : <Copy className="h-4 w-4" />}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleRevokeInvite(inv.id)}
                                title="Revogar código"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) { setEditUser(null); setEditUnits([]); setEditPassword(''); setEditPasswordConfirm('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {isTeam ? 'Membro' : 'Usuário'}</DialogTitle>
            <DialogDescription>
              Altere o nome, perfil{!isTeam ? ', empresa' : ''} ou validade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome Completo</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={editUser?.email} disabled className="bg-muted" />
            </div>
            <div className="space-y-1">
              <Label>Perfil</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isTeam ? (
                    <>
                      <SelectItem value="support">Suporte</SelectItem>
                        <SelectItem value="developer">Desenvolvedor</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="master">Master</SelectItem>
                    </>
                  ) : (
                    <SelectItem value="user">Usuário</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {isTeam && (
              <div className="space-y-1">
                <Label>Função (opcional)</Label>
                <Select
                  value={editPosition || 'none'}
                  onValueChange={(v) => setEditPosition(v === 'none' ? '' : (v as StaffPosition))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecionar função..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {(Object.entries(positionLabels) as [StaffPosition, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!isTeam && (
              <>
                <div className="space-y-1">
                  <Label>Empresa (opcional)</Label>
                  <Select
                    value={editCompanyId}
                    onValueChange={(v) => {
                      setEditCompanyId(v)
                      setEditUnitId('')
                      loadUnitsForCompany(v, 'edit')
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar empresa..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhuma</SelectItem>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editCompanyId && editUnits.length > 0 && (
                  <div className="space-y-1">
                    <Label>Unidade (opcional)</Label>
                    <Select value={editUnitId} onValueChange={setEditUnitId}>
                      <SelectTrigger><SelectValue placeholder="Selecionar unidade..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhuma</SelectItem>
                        {editUnits.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}{u.city ? ` — ${u.city}` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            <div className="space-y-1">
              <Label>Expira em (opcional)</Label>
              <Input type="date" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} />
            </div>
            {isMaster && (
            <div className="space-y-1.5">
              <Label>Permissões extras</Label>
              <p className="text-xs text-muted-foreground">
                Liberações por pessoa, além do nível. Úteis para dar acesso a uma função sem
                promover o nível do membro.
              </p>
              <div className="space-y-1.5 pt-1">
                {FEATURE_GRANTS.map((g) => {
                  const on = editGrants.includes(g.key)
                  return (
                    <label
                      key={g.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-2.5 hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setEditGrants((prev) =>
                            e.target.checked ? [...prev, g.key] : prev.filter((k) => k !== g.key),
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{g.label}</span>
                        <span className="block text-xs text-muted-foreground">{g.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
            )}
            {/* Campo de senha REMOVIDO em 17/08. A rota que ele usava era um
                stub que criava um registro com a senha em TEXTO PURO num model
                do app, sem tocar na identidade da plataforma — quem é validado
                no login. Resultado: a pessoa nunca conseguia entrar com a senha
                definida aqui, e a senha ficava guardada em claro.
                Ver docs/plans/plano-senhas-portal.md. */}
            <div className="space-y-1">
              <Label>WhatsApp (com DDD)</Label>
              <Input
                inputMode="numeric"
                placeholder="(19) 99999-9999"
                value={mascaraTelefone(editPhone)}
                onChange={(e) => setEditPhone(soDigitosTelefone(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Usado para recuperar a senha: o código vai para este número, não para o que a
                pessoa digitar na hora. Sem ele, ela fica sem caminho de volta.
              </p>
            </div>

            {/* Redefinição de senha — a plataforma expôs a rota em 20/08.
                A senha é da conta Arara (vale nos outros sistemas), por isso o
                texto avisa. Botão separado do Salvar: redefinir é ato próprio. */}
            <div className="space-y-1.5 rounded-lg border border-border p-3">
              <Label>Redefinir senha</Label>
              <p className="text-xs text-muted-foreground">
                Define uma senha nova para a conta Arara deste membro (vale em todos os
                sistemas). Mínimo 8 caracteres. Prefira uma temporária e peça que troque.
              </p>
              <div className="flex gap-2 pt-1">
                <Input
                  type="text"
                  value={resetSenha}
                  onChange={(e) => setResetSenha(e.target.value)}
                  placeholder="Nova senha (mín. 8)"
                  autoComplete="off"
                />
                <Button
                  variant="outline"
                  onClick={redefinirSenha}
                  disabled={resetando || resetSenha.length < 8}
                >
                  {resetando ? 'Definindo…' : 'Definir'}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditUser(null); setEditUnits([]); setEditPassword(''); setEditPasswordConfirm(''); setResetSenha('') }}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recovery Code Dialog (team only) */}
      {isTeam && (
        <Dialog open={!!recoveryTarget} onOpenChange={(open) => { if (!open) { setRecoveryTarget(null); setRecoveryCode(null) } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-indigo-600" />
                Código de Recuperação
              </DialogTitle>
              <DialogDescription>
                Código para <strong>{recoveryTarget?.full_name || recoveryTarget?.email}</strong> redefinir a senha. Válido por 24 horas.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {generatingCode ? (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                  <KeyRound className="h-4 w-4 animate-pulse" /> Gerando código...
                </div>
              ) : recoveryCode ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-5 py-4">
                    <span className="font-mono text-2xl font-bold tracking-widest text-indigo-700">
                      {recoveryCode}
                    </span>
                    <Button variant="ghost" size="sm" onClick={copyRecoveryCode} className="shrink-0">
                      {copiedRecovery ? <Check className="h-4 w-4 text-sem-success-fg" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Passe este código para o funcionário. Ele acessa <strong>/auth/forgot-password</strong>, informa o e-mail e usa o código para criar uma nova senha.
                  </p>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRecoveryTarget(null); setRecoveryCode(null) }}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {isTeam ? 'Membro' : 'Usuário'}</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleteUser?.full_name || deleteUser?.email}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
