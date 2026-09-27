'use client'

import { useEffect, useState, useRef } from 'react'
import { AdminHeader } from '@/components/admin/admin-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  BookOpen, Plus, Search, Eye, EyeOff, Pencil, Trash2, X, Save,
  Loader2, ChevronRight, Tag,
} from 'lucide-react'
import { kbApi } from '@/lib/api/kb'
import { LoadingBlock } from '@/components/ui/loading-block'

interface Article {
  id: string
  title: string
  slug: string
  category: string | null
  tags: string[]
  isPublished: boolean
  viewCount: number
  updatedAt: string
  author: { fullName: string | null } | null
  body?: string
}

const BLANK: Omit<Article, 'id' | 'slug' | 'viewCount' | 'updatedAt' | 'author'> = {
  title: '', category: '', tags: [], isPublished: false, body: '',
}

export default function KBPage() {
  const { toast } = useToast()
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Article | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const searchRef = useRef<ReturnType<typeof setTimeout>>()

  // Load articles
  const load = async (search = '') => {
    setLoading(true)
    setErro(null)
    try {
      const params: Record<string, string> = { published: 'false' }  // show all for admin
      if (search) params.q = search
      const data = await kbApi.list(params)
      setArticles(data.articles ?? [])
    } catch (e) {
      // Sem este catch, uma resposta recusada pelo servidor virava exceção
      // solta dentro do efeito e subia até o error boundary — a tela inteira
      // trocava por "Algo deu errado", sem dizer o que aconteceu. Falha de
      // carga é estado da tela, não colapso dela.
      setArticles([])
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os artigos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSearch = (value: string) => {
    setQ(value)
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => load(value), 300)
  }

  const openNew = () => {
    setEditing(null)
    setForm({ ...BLANK, isPublished: false })
    setTagInput('')
  }

  const openEdit = async (a: Article) => {
    // Load full body
    const data = await kbApi.getById(a.id).catch(() => null)
    const full = data?.article ?? a
    setEditing(full)
    setForm({
      title: full.title,
      category: full.category ?? '',
      tags: full.tags ?? [],
      isPublished: full.isPublished,
      body: full.body ?? '',
    })
    setTagInput('')
  }

  const closeEditor = () => { setEditing(null); setForm({ ...BLANK }) }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) {
      setForm(f => ({ ...f, tags: [...f.tags, t] }))
    }
    setTagInput('')
  }

  const removeTag = (t: string) => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))

  const save = async () => {
    if (!form.title.trim() || !form.body?.trim()) {
      toast({ title: 'Título e conteúdo são obrigatórios', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = { ...form, category: form.category || null }
      if (editing) {
        await kbApi.update(editing.id, body)
      } else {
        await kbApi.create(body as Parameters<typeof kbApi.create>[0])
      }
      toast({ title: editing ? 'Artigo atualizado!' : 'Artigo criado!' })
      closeEditor()
      load(q)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const togglePublish = async (a: Article) => {
    try {
      await kbApi.update(a.id, { isPublished: !a.isPublished })
      setArticles(prev => prev.map(x => x.id === a.id ? { ...x, isPublished: !x.isPublished } : x))
    } catch { /* silent */ }
  }

  const del = async (a: Article) => {
    if (!confirm(`Excluir "${a.title}"?`)) return
    try {
      await kbApi.delete(a.id)
      setArticles(prev => prev.filter(x => x.id !== a.id))
      toast({ title: 'Artigo excluído' })
    } catch { /* silent */ }
  }

  const isEditorOpen = form.title !== '' || editing !== null

  return (
    <div className="pt-14 lg:pt-0">
      <AdminHeader />
      <div className="container mx-auto p-6 pt-6 max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-indigo-600" />
              Base de Conhecimento
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Artigos internos em Markdown para auxiliar a equipe de suporte
            </p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Artigo
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: article list */}
          <div className="lg:col-span-1 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar artigos…"
                value={q}
                onChange={e => handleSearch(e.target.value)}
              />
            </div>

            {erro && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </div>
            )}

            {loading ? (
              <LoadingBlock label="Carregando…" />
            ) : articles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {q ? 'Nenhum resultado' : 'Nenhum artigo ainda'}
              </div>
            ) : (
              <div className="space-y-2">
                {articles.map(a => (
                  <div
                    key={a.id}
                    onClick={() => openEdit(a)}
                    className="group cursor-pointer rounded-lg border bg-background p-3 hover:border-sem-info-bd hover:bg-sem-info transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{a.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {a.category && (
                            <span className="text-xs text-muted-foreground">{a.category}</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            a.isPublished
                              ? 'bg-sem-success text-sem-success-fg'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {a.isPublished ? 'Publicado' : 'Rascunho'}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/70 group-hover:text-indigo-500 shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground/70">{a.viewCount} visitas</span>
                      {a.tags.slice(0, 2).map(t => (
                        <span key={t} className="text-xs bg-muted text-foreground/60 rounded px-1.5 py-0.5">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: editor */}
          <div className="lg:col-span-2">
            {!isEditorOpen ? (
              <Card className="border flex items-center justify-center h-80 border-dashed">
                <div className="text-center text-muted-foreground">
                  <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Selecione um artigo para editar<br />ou clique em Novo Artigo</p>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {editing ? 'Editar artigo' : 'Novo artigo'}
                    </CardTitle>
                    <div className="flex gap-2">
                      {editing && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => togglePublish(editing)}
                            className="gap-1.5 h-8 text-xs"
                          >
                            {editing.isPublished ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {editing.isPublished ? 'Despublicar' : 'Publicar'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => del(editing)}
                            className="gap-1.5 h-8 text-xs text-sem-error-fg border-sem-error-bd hover:bg-sem-error"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" onClick={closeEditor} className="h-8 w-8">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Title */}
                  <div className="space-y-1.5">
                    <Label>Título *</Label>
                    <Input
                      placeholder="Título do artigo"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                    <Input
                      placeholder="Ex: Geral, NFC-e, SAT, Migração…"
                      value={form.category ?? ''}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    />
                  </div>

                  {/* Tags */}
                  <div className="space-y-1.5">
                    <Label>Tags</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Adicionar tag…"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={addTag} className="gap-1 shrink-0">
                        <Tag className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                    {form.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {form.tags.map(t => (
                          <Badge key={t} variant="secondary" className="gap-1">
                            {t}
                            <button type="button" onClick={() => removeTag(t)}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Body (Markdown) */}
                  <div className="space-y-1.5">
                    <Label>Conteúdo (Markdown) *</Label>
                    <Textarea
                      placeholder={`## Título da seção\n\nDescrição do problema e solução...\n\n### Passos\n\n1. Primeiro passo\n2. Segundo passo`}
                      value={form.body ?? ''}
                      onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                      className="font-mono text-sm min-h-[240px] resize-y"
                    />
                    <p className="text-xs text-muted-foreground">
                      Suporta Markdown: **negrito**, `código`, ## títulos, - listas
                    </p>
                  </div>

                  {/* Publish toggle */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="published"
                      checked={form.isPublished}
                      onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))}
                      className="rounded"
                    />
                    <Label htmlFor="published" className="cursor-pointer">
                      Publicar artigo (visível para a equipe)
                    </Label>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button onClick={save} disabled={saving} className="gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar
                    </Button>
                    <Button variant="outline" onClick={closeEditor}>Cancelar</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
