'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Key, Plus, Trash2, Loader2, Copy, CheckCircle2, AlertCircle, RefreshCw, Code,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { formatDate as formatDateUtil } from '@/lib/utils'
import { LoadingBlock } from '@/components/ui/loading-block'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface APIKeyItem {
  id: string
  name: string
  description: string | null
  key_prefix: string
  access_level: string
  route_grants: string[]
  rate_limit: number
  expires_at: string | null
  last_used_at: string | null
  usage_count: number
  environment: 'sandbox' | 'production'
  status: 'active' | 'revoked' | 'expired'
  created_at: string
}

function formatDate(iso: string | null) {
  return iso ? formatDateUtil(iso) : 'Nunca'
}

function statusBadge(status: APIKeyItem['status']) {
  if (status === 'active') return <Badge className="bg-sem-success text-sem-success-fg">Ativa</Badge>
  if (status === 'expired') return <Badge className="bg-sem-warning text-sem-warning-fg">Expirada</Badge>
  return <Badge className="bg-sem-error text-sem-error-fg">Revogada</Badge>
}

function envBadge(env: APIKeyItem['environment']) {
  if (env === 'production') return <Badge className="bg-sem-success text-sem-success-fg">Produção</Badge>
  return <Badge className="bg-sem-warning text-sem-warning-fg">Sandbox</Badge>
}

export default function ApiKeysPage() {
  const { toast } = useToast()
  const [keys, setKeys] = useState<APIKeyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [secretOpen, setSecretOpen] = useState(false)
  const [createdSecret, setCreatedSecret] = useState('')
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    description: '',
    environment: 'sandbox' as 'sandbox' | 'production',
    rate_limit: '1000',
    expires_at: '',
  })

  const loadKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await araraApiFetch('/api/api-keys')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao carregar chaves')
      setKeys(json.data ?? [])
    } catch (err) {
      toast({
        title: 'Erro',
        description: err instanceof Error ? err.message : 'Falha ao carregar chaves',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadKeys() }, [loadKeys])

  async function handleCreate() {
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await araraApiFetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          permissions: [],
          route_grants: ['/api/external/**'],
          environment: form.environment,
          rate_limit: Number(form.rate_limit) || 1000,
          expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar chave')

      setCreateOpen(false)
      setForm({ name: '', description: '', environment: 'sandbox', rate_limit: '1000', expires_at: '' })
      setCreatedSecret(json.data?.secretKey ?? '')
      setSecretOpen(true)
      loadKeys()
    } catch (err) {
      toast({
        title: 'Erro ao criar',
        description: err instanceof Error ? err.message : 'Falha',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(key: APIKeyItem) {
    if (key.status !== 'active') return
    if (!confirm(`Revogar a chave "${key.name}"? Integrações que a usam deixarão de funcionar.`)) return

    setRevokingId(key.id)
    try {
      const res = await araraApiFetch(`/api/api-keys/${key.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao revogar')
      toast({ title: 'Chave revogada' })
      loadKeys()
    } catch (err) {
      toast({
        title: 'Erro',
        description: err instanceof Error ? err.message : 'Falha ao revogar',
        variant: 'destructive',
      })
    } finally {
      setRevokingId(null)
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(createdSecret)
    toast({ title: 'Chave copiada' })
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-5xl px-4 pt-6 pb-8 lg:py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Key className="w-6 h-6 text-indigo-600" />
              Chaves de API
            </h1>
            <p className="text-foreground/60 mt-1">
              Gerencie chaves para integrações externas. Use o header{' '}
              <code className="text-sm bg-muted px-1 rounded">x-api-key</code> nas requisições.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadKeys} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Link href="/admin/api-docs">
              <Button variant="outline" size="sm">
                <Code className="w-4 h-4 mr-1" />
                Documentação
              </Button>
            </Link>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Nova chave
            </Button>
          </div>
        </div>

        <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50/50">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-sem-info-fg">
              A chave completa é exibida <strong>apenas uma vez</strong> após a criação.
              Chaves novas têm acesso restrito a <code>/api/external/**</code>.
            </div>
          </div>
        </Card>

        {loading ? (
          <LoadingBlock size="lg" />
        ) : keys.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            <Key className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p>Nenhuma chave de API cadastrada.</p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              Criar primeira chave
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <Card key={key.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{key.name}</span>
                      {statusBadge(key.status)}
                      {envBadge(key.environment)}
                    </div>
                    {key.description && (
                      <p className="text-sm text-foreground/60">{key.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span><strong>Prefixo:</strong> <code>{key.key_prefix}…</code></span>
                      <span><strong>Usos:</strong> {key.usage_count}</span>
                      <span><strong>Último uso:</strong> {formatDate(key.last_used_at)}</span>
                      <span><strong>Limite:</strong> {key.rate_limit}/h</span>
                      {key.expires_at && (
                        <span><strong>Expira:</strong> {formatDate(key.expires_at)}</span>
                      )}
                    </div>
                    {key.route_grants?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {key.route_grants.map((g) => (
                          <Badge key={g} variant="outline" className="text-xs font-mono">{g}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {key.status === 'active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-sem-error-fg hover:text-sem-error-fg hover:bg-sem-error shrink-0"
                      onClick={() => handleRevoke(key)}
                      disabled={revokingId === key.id}
                    >
                      {revokingId === key.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Integração SGC"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Uso interno / sistema externo"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ambiente</Label>
                <Select
                  value={form.environment}
                  onValueChange={(v) => setForm({ ...form, environment: v as 'sandbox' | 'production' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (sk_test_)</SelectItem>
                    <SelectItem value="production">Produção (sk_live_)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rate_limit">Rate limit / hora</Label>
                <Input
                  id="rate_limit"
                  type="number"
                  min={1}
                  value={form.rate_limit}
                  onChange={(e) => setForm({ ...form, rate_limit: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="expires_at">Expira em (opcional)</Label>
              <Input
                id="expires_at"
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Criar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={secretOpen} onOpenChange={setSecretOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-sem-success-fg" />
              Chave criada
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-foreground/60">
              Copie e guarde esta chave agora. Ela <strong>não será exibida novamente</strong>.
            </p>
            <div className="rounded-lg bg-card p-4 flex items-center gap-2">
              <code className="text-sm text-green-400 flex-1 break-all">{createdSecret}</code>
              <Button size="sm" variant="secondary" onClick={copySecret}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecretOpen(false)}>Entendi, guardei a chave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
