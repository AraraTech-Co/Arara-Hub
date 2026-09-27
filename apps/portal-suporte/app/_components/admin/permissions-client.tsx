'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { adminPermissionsApi } from '@/lib/api/admin'

interface Permission {
  id: string
  module: string
  action: string
  description: string
}

interface RbacRole {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: Array<{ permission: Permission }>
}

const ROLE_LABELS: Record<string, string> = {
  master: 'Master',
  admin: 'Administrador',
  developer: 'Desenvolvedor',
  // `support` faltava aqui também: o operador aparecia como "Usuário", o mesmo
  // rótulo do cliente, numa tela de permissões.
  support: 'Suporte',
  user: 'Cliente',
}

const MODULE_LABELS: Record<string, string> = {
  companies: 'Empresas',
  tickets: 'Tickets',
  kanban: 'Kanban',
  sla: 'SLA',
  users: 'Usuários',
  admin: 'Administração',
}

export function PermissionsClient() {
  const [roles, setRoles] = useState<RbacRole[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [selectedRole, setSelectedRole] = useState<RbacRole | null>(null)
  const [pendingPerms, setPendingPerms] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminPermissionsApi.list()
      .then(d => {
        // NOTE: this endpoint returns { roles, permissions } — mapped via permissions field
        const raw = d as unknown as { roles?: RbacRole[]; permissions?: Permission[] }
        setRoles(raw.roles ?? [])
        setPermissions(raw.permissions ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const selectRole = (role: RbacRole) => {
    setSelectedRole(role)
    setPendingPerms(new Set(role.permissions.map(rp => rp.permission.id)))
  }

  const togglePerm = (permId: string) => {
    setPendingPerms(prev => {
      const next = new Set(prev)
      if (next.has(permId)) next.delete(permId)
      else next.add(permId)
      return next
    })
  }

  const save = async () => {
    if (!selectedRole) return
    setSaving(true)
    await adminPermissionsApi.updateRole(selectedRole.id, { permissions: [...pendingPerms] })
    // Refresh
    const data = await adminPermissionsApi.list() as unknown as { roles?: RbacRole[] }
    setRoles(data.roles ?? [])
    const updated = data.roles?.find((r: RbacRole) => r.id === selectedRole.id)
    if (updated) selectRole(updated)
    setSaving(false)
  }

  // Group permissions by module
  const byModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = []
    acc[p.module].push(p)
    return acc
  }, {})

  if (loading) return <div className="p-6 text-muted-foreground">Carregando permissões...</div>

  return (
    <div className="flex gap-6 p-6">
      {/* Roles list */}
      <div className="w-48 shrink-0 space-y-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perfis</p>
        {roles.map(r => (
          <button
            key={r.id}
            onClick={() => selectRole(r)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              selectedRole?.id === r.id
                ? 'bg-card text-foreground'
                : 'text-foreground/60 hover:bg-muted'
            }`}
          >
            {ROLE_LABELS[r.name] ?? r.name}
            {r.isSystem && <span className="ml-1 text-[10px] text-muted-foreground">sistema</span>}
          </button>
        ))}
      </div>

      {/* Permissions matrix */}
      {selectedRole ? (
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{ROLE_LABELS[selectedRole.name] ?? selectedRole.name}</h2>
              {selectedRole.description && <p className="text-sm text-muted-foreground">{selectedRole.description}</p>}
            </div>
            <Button onClick={save} disabled={saving || selectedRole.name === 'master'} size="sm">
              {saving ? 'Salvando...' : 'Salvar permissões'}
            </Button>
          </div>

          {selectedRole.name === 'master' && (
            <p className="rounded-lg bg-sem-warning px-4 py-2 text-sm text-sem-warning-fg">Super Admin tem acesso irrestrito a tudo — as permissões não podem ser alteradas.</p>
          )}

          {Object.entries(byModule).map(([module, perms]) => (
            <div key={module} className="rounded-xl border border-border">
              <div className="border-b border-border bg-muted/50 px-4 py-2">
                <p className="text-sm font-semibold text-foreground/80">{MODULE_LABELS[module] ?? module}</p>
              </div>
              <div className="divide-y divide-border/50">
                {perms.map(p => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={pendingPerms.has(p.id)}
                      onChange={() => togglePerm(p.id)}
                      disabled={selectedRole.name === 'master'}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground/80">{p.description || p.action}</p>
                      <p className="text-xs text-muted-foreground">{module}.{p.action}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon="🔐"
            title="Selecione um perfil"
            description="Escolha um perfil à esquerda para gerenciar suas permissões."
          />
        </div>
      )}
    </div>
  )
}
