'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Plus, Workflow, ChevronRight, Power, PowerOff, Trash2, Pencil, Check, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { waFlowApi, type WAFlowSummary } from '@/lib/api/wa-flow'

/**
 * Ante-tela dos fluxos: escolhe qual fluxo abrir no editor.
 *
 * Só UM fluxo fica no ar por vez — o motor pega o de menor prioridade entre os
 * habilitados e publicados. O selo "No ar" mostra qual é, para não haver dúvida
 * sobre qual árvore o cliente está recebendo no WhatsApp.
 */
export function FlowList({ canEdit }: { canEdit: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [flows, setFlows] = useState<WAFlowSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')

  const carregar = useCallback(async () => {
    try {
      const res = await waFlowApi.list()
      setFlows(res.data)
      setLoadError(false)
    } catch {
      setLoadError(true)
      setFlows([])
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const erro = (err: unknown, title: string) =>
    toast({
      title,
      description: err instanceof Error ? err.message : 'Tente novamente.',
      variant: 'destructive',
    })

  async function criar() {
    const nome = novoNome.trim()
    if (!nome) return
    setCreating(true)
    try {
      const res = await waFlowApi.create(nome)
      setNovoNome('')
      router.push(`/admin/whatsapp/flow/_/?id=${encodeURIComponent(res.data.id)}`) // já abre o editor do novo
    } catch (err) {
      erro(err, 'Não foi possível criar o fluxo')
      setCreating(false)
    }
  }

  async function alternar(f: WAFlowSummary) {
    setBusyId(f.id)
    try {
      await waFlowApi.updateSettings(f.id, { enabled: !f.enabled })
      await carregar()
    } catch (err) {
      erro(err, f.enabled ? 'Não foi possível desativar' : 'Não foi possível ativar')
    } finally {
      setBusyId(null)
    }
  }

  async function apagar(f: WAFlowSummary) {
    if (!confirm(`Apagar o fluxo "${f.name}"? Esta ação não pode ser desfeita.`)) return
    setBusyId(f.id)
    try {
      await waFlowApi.remove(f.id)
      await carregar()
      toast({ title: 'Fluxo apagado' })
    } catch (err) {
      erro(err, 'Não foi possível apagar')
    } finally {
      setBusyId(null)
    }
  }

  async function salvarNome(f: WAFlowSummary) {
    const nome = nomeEdit.trim()
    if (!nome || nome === f.name) {
      setRenomeando(null)
      return
    }
    setBusyId(f.id)
    try {
      await waFlowApi.updateSettings(f.id, { name: nome })
      setRenomeando(null)
      await carregar()
    } catch (err) {
      erro(err, 'Não foi possível renomear')
    } finally {
      setBusyId(null)
    }
  }

  if (!flows) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // O que está de fato no ar: o 1º habilitado e publicado (a lista já vem por prioridade).
  const noArId = flows.find((f) => f.enabled && f.published)?.id ?? null

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void criar()}
            placeholder="Nome do novo fluxo"
            className="h-9 w-64"
            maxLength={80}
          />
          <Button size="sm" onClick={() => void criar()} disabled={!novoNome.trim() || creating}>
            {creating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Criar fluxo
          </Button>
        </div>
      )}

      {loadError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar os fluxos.{' '}
          <button className="underline" onClick={() => void carregar()}>
            Tentar novamente
          </button>
        </p>
      )}

      {!flows.length && !loadError && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum fluxo cadastrado ainda.
        </p>
      )}

      <ul className="space-y-2">
        {flows.map((f) => (
          <li
            key={f.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
          >
            <Workflow className="h-5 w-5 shrink-0 text-muted-foreground" />

            <div className="min-w-0 flex-1">
              {renomeando === f.id ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={nomeEdit}
                    onChange={(e) => setNomeEdit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void salvarNome(f)
                      if (e.key === 'Escape') setRenomeando(null)
                    }}
                    className="h-8 max-w-xs"
                    maxLength={80}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void salvarNome(f)}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRenomeando(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline"
                  onClick={() => router.push(`/admin/whatsapp/flow/_/?id=${encodeURIComponent(f.id)}`)}
                >
                  {f.name}
                </button>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{f.published ? `versão ${f.version}` : 'nunca publicado'}</span>
                <span aria-hidden>·</span>
                <span>editado em {new Date(f.updatedAt).toLocaleDateString('pt-BR')}</span>
                {f.id === noArId && (
                  <span className="rounded-full bg-sem-success px-2 py-0.5 font-medium text-sem-success-fg">
                    No ar
                  </span>
                )}
                {f.enabled && f.id !== noArId && (
                  <span className="rounded-full bg-muted px-2 py-0.5">Ativo (em espera)</span>
                )}
                {!f.enabled && <span className="rounded-full bg-muted px-2 py-0.5">Desativado</span>}
                {f.hasUnpublished && (
                  <span className="rounded-full bg-sem-warning px-2 py-0.5 font-medium text-sem-warning-fg">
                    Rascunho não publicado
                  </span>
                )}
              </p>
            </div>

            {canEdit && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title="Renomear"
                  disabled={busyId === f.id}
                  onClick={() => {
                    setNomeEdit(f.name)
                    setRenomeando(f.id)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title={f.enabled ? 'Desativar' : 'Ativar'}
                  disabled={busyId === f.id}
                  onClick={() => void alternar(f)}
                >
                  {f.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title="Apagar"
                  disabled={busyId === f.id}
                  onClick={() => void apagar(f)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            <Button
              size="sm"
              variant="secondary"
              onClick={() => router.push(`/admin/whatsapp/flow/_/?id=${encodeURIComponent(f.id)}`)}
            >
              Abrir <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
