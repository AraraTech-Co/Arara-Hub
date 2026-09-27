'use client'

import { useState } from 'react'
import { X, Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

type SshServer = {
  id: string
  nome: string
  host: string
  port?: number
  dns?: string | null
  usuario: string
  active: boolean
}

interface Props {
  server: SshServer | null
  onClose: () => void
  onSaved: () => void
}

export default function ServerForm({ server, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    nome:    server?.nome    ?? '',
    host:    server?.host    ?? '',
    port:    server?.port    ?? 22,
    dns:     server?.dns     ?? '',
    usuario: server?.usuario ?? '',
    senha:   '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string | number) =>
    setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim() || !form.host.trim() || !form.usuario.trim()) {
      setError('Nome, host e usuário são obrigatórios')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url    = server ? `/api/admin/ssh-servers/${server.id}` : '/api/admin/ssh-servers'
      const method = server ? 'PATCH' : 'POST'
      const res    = await araraApiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:    form.nome.trim(),
          host:    form.host.trim(),
          port:    Number(form.port) || 22,
          dns:     form.dns.trim() || null,
          usuario: form.usuario.trim(),
          ...(form.senha ? { senha: form.senha } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.success === false) { setError(json.error ?? 'Erro ao salvar'); return }
      onSaved()
    } catch {
      setError('Erro ao salvar servidor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="devops-theme bg-devops-overlay border border-devops-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-devops-accent" />
            <h2 className="text-base font-semibold text-white">
              {server ? 'Editar Servidor' : 'Novo Servidor SSH'}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground/70">Nome *</Label>
              <Input
                className="mt-1 bg-devops-panel border-devops-border text-white placeholder:text-muted-foreground"
                placeholder="Ex: Servidor Produção"
                value={form.nome}
                onChange={e => set('nome', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground/70">Host / IP *</Label>
              <Input
                className="mt-1 bg-devops-panel border-devops-border text-white placeholder:text-muted-foreground font-mono text-sm"
                placeholder="192.168.0.10"
                value={form.host}
                onChange={e => set('host', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground/70">Porta</Label>
              <Input
                type="number"
                className="mt-1 bg-devops-panel border-devops-border text-white font-mono text-sm"
                value={form.port}
                onChange={e => set('port', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground/70">DNS</Label>
              <Input
                className="mt-1 bg-devops-panel border-devops-border text-white placeholder:text-muted-foreground font-mono text-sm"
                placeholder="servidor.empresa.com"
                value={form.dns}
                onChange={e => set('dns', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground/70">Usuário SSH *</Label>
              <Input
                className="mt-1 bg-devops-panel border-devops-border text-white placeholder:text-muted-foreground"
                placeholder="root"
                value={form.usuario}
                onChange={e => set('usuario', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground/70">
                Senha {server ? '(deixe em branco para manter)' : ''}
              </Label>
              <Input
                type="password"
                className="mt-1 bg-devops-panel border-devops-border text-white placeholder:text-muted-foreground"
                placeholder="••••••••"
                value={form.senha}
                onChange={e => set('senha', e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-800 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm"
              className="border-devops-border text-muted-foreground/50 hover:bg-devops-panel"
              onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
              {saving ? 'Salvando…' : server ? 'Salvar' : 'Criar Servidor'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
