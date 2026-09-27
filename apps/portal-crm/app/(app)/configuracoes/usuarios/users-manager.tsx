"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usersApi, type ManagedUser } from "@/lib/api/users"
import { ROLES, POSITIONS } from "@/lib/validation/user.schema"
import { roleLabels as roleLabel, roleBadgeClass as roleBadge, positionLabels as positionLabel } from "@/lib/labels"
import { Toast, type ToastState } from "@/components/crm/Toast"

type Team = { id: string; name: string }

type FormState = {
  name: string
  email: string
  password: string
  role: (typeof ROLES)[number]
  position: string
  teamId: string
  phone: string
  active: boolean
}

const emptyForm: FormState = {
  name: "", email: "", password: "", role: "vendedor", position: "", teamId: "", phone: "", active: true,
}

export function UsersManager({
  initialUsers, teams, currentUserId,
}: { initialUsers: ManagedUser[]; teams: Team[]; currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers)
  const [query, setQuery] = useState("")
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; user: ManagedUser }>(null)
  const [pwModal, setPwModal] = useState<null | ManagedUser>(null)
  const [confirmDelete, setConfirmDelete] = useState<ManagedUser | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [error, setError] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, query])

  async function refresh() {
    setUsers(await usersApi.list())
  }

  async function doDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await usersApi.remove(confirmDelete.id)
      await refresh()
      setToast({ message: "Usuário excluído.", type: "success" })
      setConfirmDelete(null)
    } catch (e) {
      setToast({ message: (e as Error).message, type: "error" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => { setError(""); setModal({ mode: "create" }) }}
          className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors min-h-[40px]"
        >
          + Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50/60">
              <th className="font-medium px-5 py-3">Nome</th>
              <th className="font-medium px-3 py-3">Perfil</th>
              <th className="font-medium px-3 py-3 hidden md:table-cell">Função</th>
              <th className="font-medium px-3 py-3 hidden lg:table-cell">Equipe</th>
              <th className="font-medium px-3 py-3">Status</th>
              <th className="font-medium px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50/60">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs shrink-0">
                      {u.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{u.name}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge[u.role]}`}>{roleLabel[u.role]}</span>
                </td>
                <td className="px-3 py-3 hidden md:table-cell text-gray-600 text-xs">
                  {u.profile?.position ? positionLabel[u.profile.position] ?? u.profile.position : "—"}
                </td>
                <td className="px-3 py-3 hidden lg:table-cell text-gray-600 text-xs">{u.team?.name ?? "—"}</td>
                <td className="px-3 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setError(""); setModal({ mode: "edit", user: u }) }} title="Editar"
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button onClick={() => { setError(""); setPwModal(u) }} title="Redefinir senha"
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    </button>
                    {u.id !== currentUserId && (
                      <button onClick={() => setConfirmDelete(u)} title="Excluir"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">Nenhum usuário encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserFormModal
          mode={modal.mode}
          user={modal.mode === "edit" ? modal.user : undefined}
          teams={teams}
          error={error}
          setError={setError}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await refresh() }}
        />
      )}

      {pwModal && (
        <PasswordModal
          user={pwModal}
          error={error}
          setError={setError}
          onClose={() => setPwModal(null)}
          onSaved={() => { setPwModal(null); setToast({ message: "Senha redefinida com sucesso.", type: "success" }) }}
        />
      )}

      {confirmDelete && (
        <Modal title="Excluir usuário" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-gray-600">
            Tem certeza que deseja excluir <span className="font-medium text-gray-900">{confirmDelete.name}</span>?
            Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 pt-5">
            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={doDelete} disabled={deleting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg">
              {deleting ? "Excluindo…" : "Excluir"}
            </button>
          </div>
        </Modal>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Fecha no Escape
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    // Foca o primeiro campo ao abrir
    const first = panelRef.current?.querySelector<HTMLElement>("input, select, textarea, button")
    first?.focus()
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div ref={panelRef} className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-md" aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const fieldClass = "w-full h-10 px-3 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
const labelClass = "block text-sm font-medium text-gray-700 mb-1.5"

function UserFormModal({
  mode, user, teams, error, setError, onClose, onSaved,
}: {
  mode: "create" | "edit"
  user?: ManagedUser
  teams: Team[]
  error: string
  setError: (s: string) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(
    user
      ? { name: user.name, email: user.email, password: "", role: user.role, position: user.profile?.position ?? "", teamId: user.team?.id ?? "", phone: user.profile?.phone ?? "", active: user.active }
      : emptyForm
  )
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const base = {
        name: form.name,
        email: form.email,
        role: form.role,
        position: (form.position || null) as FormState["position"] | null,
        teamId: form.teamId || null,
        phone: form.phone || null,
      }
      if (mode === "create") {
        await usersApi.create({ ...base, password: form.password } as never)
      } else if (user) {
        await usersApi.update(user.id, { ...base, active: form.active } as never)
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={mode === "create" ? "Novo Usuário" : "Editar Usuário"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
        <div>
          <label className={labelClass}>Nome</label>
          <input className={fieldClass} value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div>
          <label className={labelClass}>E-mail</label>
          <input type="email" className={fieldClass} value={form.email} onChange={(e) => set("email", e.target.value)} required />
        </div>
        {mode === "create" && (
          <div>
            <label className={labelClass}>Senha inicial</label>
            <input type="text" className={fieldClass} value={form.password} onChange={(e) => set("password", e.target.value)} minLength={8} required placeholder="mín. 8 caracteres" />
            <p className="text-xs text-gray-500 mt-1">O colaborador poderá alterá-la depois com o administrador.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Perfil de acesso</label>
            <select className={fieldClass} value={form.role} onChange={(e) => set("role", e.target.value as FormState["role"])}>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Função</label>
            <select className={fieldClass} value={form.position} onChange={(e) => set("position", e.target.value)}>
              <option value="">—</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{positionLabel[p]}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Equipe</label>
            <select className={fieldClass} value={form.teamId} onChange={(e) => set("teamId", e.target.value)}>
              <option value="">—</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Telefone</label>
            <input className={fieldClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-0000" />
          </div>
        </div>
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            Conta ativa
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PasswordModal({
  user, error, setError, onClose, onSaved,
}: {
  user: ManagedUser
  error: string
  setError: (s: string) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      await usersApi.setPassword(user.id, password)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Redefinir senha" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-500">Definindo nova senha para <span className="font-medium text-gray-900">{user.name}</span>.</p>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
        <div>
          <label className={labelClass}>Nova senha</label>
          <input type="text" className={fieldClass} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required placeholder="mín. 8 caracteres" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg">
            {saving ? "Salvando…" : "Redefinir"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
