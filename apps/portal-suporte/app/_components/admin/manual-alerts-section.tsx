'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, AlertTriangle, Info, CheckCircle2, Zap, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

export interface OperationalAlertItem {
  id: string;
  title: string;
  body?: string | null;
  severity: string;
  category?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
  author?: { id: string; name: string | null; email: string } | null;
}

const SEVERITY_STYLES: Record<string, { card: string; badge: string; icon: React.ReactNode }> = {
  critical: {
    card: 'border-sem-error-bd bg-sem-error',
    badge: 'bg-sem-error text-sem-error-fg border-sem-error-bd',
    icon: <AlertTriangle className="h-4 w-4 text-sem-error-fg" />,
  },
  warning: {
    card: 'border-sem-warning-bd bg-sem-warning',
    badge: 'bg-sem-warning text-sem-warning-fg border-sem-warning-bd',
    icon: <AlertTriangle className="h-4 w-4 text-sem-warning-fg" />,
  },
  info: {
    card: 'border-sem-info-bd bg-sem-info',
    badge: 'bg-sem-info text-sem-info-fg border-sem-info-bd',
    icon: <Info className="h-4 w-4 text-sem-info-fg" />,
  },
  success: {
    card: 'border-sem-success-bd bg-sem-success',
    badge: 'bg-sem-success text-sem-success-fg border-sem-success-bd',
    icon: <CheckCircle2 className="h-4 w-4 text-sem-success-fg" />,
  },
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Crítico',
  warning: 'Atenção',
  info: 'Info',
  success: 'Sucesso',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

interface NewAlertFormProps {
  onSave: (data: { title: string; body: string; severity: string; category: string; expiresAt: string }) => Promise<void>;
  onCancel: () => void;
}

function NewAlertForm({ onSave, onCancel }: NewAlertFormProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('info');
  const [category, setCategory] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Título é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ title, body, severity, category, expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card p-4 space-y-3 shadow-[var(--shadow-media)]">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Zap className="h-4 w-4 text-sem-info-fg" />
        Novo Aviso Operacional
      </h3>
      {error && <p className="text-xs text-sem-error-fg bg-sem-error rounded px-2 py-1">{error}</p>}
      <div>
        <label className="text-xs font-medium text-foreground/60 block mb-1">Título *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ex: Sistema de emissão de NF lento"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          maxLength={255}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-foreground/60 block mb-1">Severidade</label>
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="critical">Crítico</option>
            <option value="warning">Atenção</option>
            <option value="info">Info</option>
            <option value="success">Sucesso</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60 block mb-1">Categoria</label>
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="Ex: infraestrutura"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-foreground/60 block mb-1">Mensagem (opcional)</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Detalhes adicionais sobre o aviso..."
          rows={2}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-foreground/60 block mb-1">Expirar em (opcional)</label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={e => setExpiresAt(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" size="sm" disabled={saving} className="gap-1.5 bg-primary hover:bg-primary/90">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Publicar Aviso
        </Button>
      </div>
    </form>
  );
}

interface ManualAlertsSectionProps {
  initialAlerts: OperationalAlertItem[];
  isAdmin: boolean;
}

export function ManualAlertsSection({ initialAlerts, isAdmin }: ManualAlertsSectionProps) {
  const [alerts, setAlerts] = useState<OperationalAlertItem[]>(initialAlerts);
  const [showForm, setShowForm] = useState(false);

  // A seção só POSTava e DELETAva — nunca LIA. A rota GET existe na plataforma
  // desde sempre; sem chamá-la, todo aviso criado desaparecia no primeiro F5 e
  // o card ficava eternamente com "Nenhum aviso operacional ativo", ocupando a
  // faixa mais valiosa da tela.
  useEffect(() => {
    let vivo = true;
    araraApiFetch('/api/admin/operational-alerts')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const linhas = j?.data ?? j?.alerts ?? [];
        if (vivo && Array.isArray(linhas) && linhas.length) setAlerts(linhas);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const handleCreate = useCallback(async (data: { title: string; body: string; severity: string; category: string; expiresAt: string }) => {
    const res = await araraApiFetch('/api/admin/operational-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        body: data.body || null,
        severity: data.severity,
        category: data.category || null,
        expiresAt: data.expiresAt || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Erro ao criar aviso');
    }

    const { alert } = await res.json();
    setAlerts(prev => [
      {
        ...alert,
        author: alert.author ? { id: alert.author.id, name: alert.author.fullName, email: alert.author.email } : null,
      },
      ...prev,
    ]);
    setShowForm(false);
  }, []);

  const handleDismiss = useCallback(async (id: string) => {
    await araraApiFetch(`/api/admin/operational-alerts/${id}`, {
      method: 'DELETE',
    });
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  if (alerts.length === 0 && !showForm) {
    if (!isAdmin) return null;
    return (
      <div className="space-y-3">
        {isAdmin && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Aviso
            </Button>
          </div>
        )}
        <p className="py-1 text-xs text-muted-foreground">Nenhum aviso operacional ativo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(true)}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Aviso
          </Button>
        </div>
      )}

      {showForm && (
        <NewAlertForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      <div className="space-y-2">
        {alerts.map(alert => {
          const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info;
          return (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 transition-all ${style.card}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="mt-0.5 shrink-0">{style.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{alert.title}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${style.badge}`}>
                        {SEVERITY_LABELS[alert.severity] ?? alert.severity}
                      </Badge>
                      {alert.category && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted text-foreground/60 border-border">
                          {alert.category}
                        </Badge>
                      )}
                    </div>
                    {alert.body && (
                      <p className="text-xs text-foreground/60 mb-1.5">{alert.body}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                      {alert.author?.name && (
                        <span>Por {alert.author.name}</span>
                      )}
                      <span>{formatRelativeTime(alert.createdAt)}</span>
                      {alert.expiresAt && (
                        <span>Expira {formatDate(alert.expiresAt, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="shrink-0 rounded-full p-3 -m-1 text-muted-foreground hover:bg-muted hover:text-foreground/60 transition-colors"
                    title="Desativar aviso"
                    aria-label="Desativar aviso"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
