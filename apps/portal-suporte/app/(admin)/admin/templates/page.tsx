"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { LoadingBlock } from "@/components/ui/loading-block";
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

interface Template {
  id: string;
  name: string;
  content: string;
  category: string | null;
  isGlobal: boolean;
  createdBy: string | null;
}

const CATEGORIES = ['cliente', 'suporte', 'resolucao', 'interno', 'Geral'];

export default function TemplatesPage() {
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState({ name: '', content: '', category: '', is_global: true });
  const [error, setError]           = useState('');

  const load = async () => {
    setLoading(true);
    const r = await araraApiFetch('/api/templates');
    const j = await r.json();
    setTemplates(j.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', content: '', category: '', is_global: true });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditId(t.id);
    setForm({ name: t.name, content: t.content, category: t.category ?? '', is_global: t.isGlobal });
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.content.trim()) {
      setError('Nome e conteúdo são obrigatórios.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url    = editId ? `/api/templates/${editId}` : '/api/templates';
      const method = editId ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'Erro ao salvar');
      }
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este template?')) return;
    setDeleting(id);
    await araraApiFetch(`/api/templates/${id}`, { method: 'DELETE' });
    setDeleting(null);
    await load();
  };

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    const key = t.category ?? 'Geral';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="pt-14 lg:pt-0">
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Templates de Resposta</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Atalhos de texto para agilizar respostas no atendimento
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Template
          </Button>
        </div>

        {loading ? (
          <LoadingBlock size="lg" />
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground/70">
              Nenhum template ainda. Crie o primeiro!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </h2>
                <div className="space-y-3">
                  {items.map(t => (
                    <Card key={t.id} className="border-border">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm font-semibold text-foreground">
                            {t.name}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            {t.isGlobal && (
                              <Badge variant="secondary" className="text-xs">Global</Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground/70 hover:text-foreground/80"
                              onClick={() => openEdit(t)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground/70 hover:text-red-600"
                              onClick={() => handleDelete(t.id)}
                              disabled={deleting === t.id}
                            >
                              {deleting === t.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <p className="whitespace-pre-wrap text-sm text-foreground/60 line-clamp-3">
                          {t.content}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Template' : 'Novo Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: Aguardando informações do cliente"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input
                placeholder="Ex: cliente, suporte, resolucao…"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                list="categories"
              />
              <datalist id="categories">
                {CATEGORIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Conteúdo *</Label>
              <Textarea
                rows={6}
                placeholder="Olá! …"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_global"
                checked={form.is_global}
                onChange={e => setForm(f => ({ ...f, is_global: e.target.checked }))}
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="is_global" className="cursor-pointer text-sm text-foreground/60">
                Disponível para toda a equipe (global)
              </Label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
