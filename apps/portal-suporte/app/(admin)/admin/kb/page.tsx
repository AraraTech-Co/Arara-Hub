'use client'

// =============================================================================
// Base de Conhecimento — documentos da equipe.
//
// É uma VISÃO do acervo de arquivos de apoio (`/api/arquivos`), presa a UMA pasta fixa. Não há rota
// nem modelo próprios: enviar, listar, baixar e apagar são os do acervo, com as mesmas regras:
//   - ver e enviar: nível support (a equipe inteira); o que se envia aqui não leva restrição extra
//     (a tela nem oferece), é da equipe;
//   - apagar: quem enviou, ou admin (o servidor confere; aqui o botão só aparece para eles);
//   - até 10 MB por arquivo, medidos pelo servidor; tipos: os do acervo.
// A busca é por NOME, no navegador, sobre o que já foi carregado — documento é arquivo, não há busca
// por conteúdo —, e a tela DIZ quando há mais.
//
// Outras pastas e restrições de acesso vivem em "Arquivos de apoio".
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Download, FileText, Loader2, Search, Trash2, Upload } from 'lucide-react'
import { AdminHeader } from '@/components/admin/admin-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/lib/arara/AuthProvider'
import {
  arquivosApi, tamanhoLegivel, ARQUIVO_MAX_MB, PASTA_BASE_DE_CONHECIMENTO, type ArquivoDeApoio,
} from '@/lib/api/arquivos'
import { ANEXO_ACCEPT, lerDataUri, motivoRecusaAnexo } from '@/lib/anexos'
import { formatDateShort } from '@/lib/utils'

export default function BaseDeConhecimentoPage() {
  const { toast } = useToast()
  const { user, appRole } = useAuth()
  const [documentos, setDocumentos] = useState<ArquivoDeApoio[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [truncado, setTruncado] = useState(false)
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const ehAdmin = ['admin', 'master'].includes(String(appRole || ''))

  const carregar = useCallback(async (cur: string | null, acumular: boolean) => {
    setCarregando(true)
    setErro(null)
    try {
      const r = await arquivosApi.listar(PASTA_BASE_DE_CONHECIMENTO, cur)
      const d = r.data
      setDocumentos((antes) => (acumular ? [...antes, ...(d?.arquivos ?? [])] : (d?.arquivos ?? [])))
      setCursor(d?.cursor ?? null)
      setTruncado(!!d?.truncado)
    } catch (err) {
      // Erro aparece; lista vazia silenciosa pareceria "não há documentos".
      setErro(err instanceof Error ? err.message : 'Não deu para listar os documentos.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar(null, false) }, [carregar])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? documentos.filter((d) => d.nome.toLowerCase().includes(t)) : documentos
  }, [documentos, busca])

  const enviar = useCallback(async (files: FileList | File[]) => {
    const lista = [...files]
    if (!lista.length) return
    setEnviando(true)
    let enviados = 0
    try {
      for (const file of lista) {
        // A mesma régua dos anexos de chamado e do acervo: tipo e tamanho são conferidos ANTES de ler o
        // arquivo, e o servidor confere de novo (o que a tela diz não vale).
        const recusa = motivoRecusaAnexo(file)
        if (recusa) {
          toast({ title: `${file.name} não foi enviado`, description: recusa, variant: 'destructive' })
          continue
        }
        const conteudo = await lerDataUri(file)
        await arquivosApi.enviar({ nome: file.name, pasta: PASTA_BASE_DE_CONHECIMENTO, conteudo })
        enviados++
      }
      if (enviados) {
        await carregar(null, false)
        toast({ title: enviados === 1 ? 'Documento enviado' : `${enviados} documentos enviados` })
      }
    } catch (err) {
      toast({
        title: 'Não deu para enviar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }, [carregar, toast])

  const baixar = useCallback(async (d: ArquivoDeApoio) => {
    try {
      const r = await arquivosApi.baixar(d.id)
      const link = document.createElement('a')
      link.href = r.data.conteudo
      link.download = r.data.nome || d.nome
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      toast({
        title: 'Não deu para baixar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }, [toast])

  const apagar = useCallback(async (d: ArquivoDeApoio) => {
    if (!window.confirm(`Apagar "${d.nome}"? Quem enviou e quando fica registrado.`)) return
    try {
      await arquivosApi.apagar(d.id)
      setDocumentos((antes) => antes.filter((x) => x.id !== d.id))
      toast({ title: 'Documento apagado' })
    } catch (err) {
      toast({
        title: 'Não deu para apagar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }, [toast])

  return (
    <div className="pt-14 lg:pt-0">
      <AdminHeader />
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <BookOpen className="h-5 w-5 text-indigo-600" /> Base de Conhecimento
          </h1>
          <p className="text-sm text-muted-foreground">
            Manuais, procedimentos e materiais da equipe. Para outras pastas e para restringir quem vê um
            arquivo, use <Link href="/admin/arquivos" className="underline underline-offset-2">Arquivos de apoio</Link>.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Enviar documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={enviando} onClick={() => entrada.current?.click()} className="gap-1">
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Escolher arquivo
              </Button>
              <span className="text-xs text-muted-foreground">
                até <strong>{ARQUIVO_MAX_MB} MB</strong> por arquivo · PDF, Word, Excel, imagem, texto, ZIP e outros do acervo
              </span>
              <input
                ref={entrada}
                type="file"
                multiple
                accept={ANEXO_ACCEPT}
                className="hidden"
                onChange={(e) => { if (e.target.files) void enviar(e.target.files) }}
              />
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault()
                setArrastando(false)
                if (e.dataTransfer?.files) void enviar(e.dataTransfer.files)
              }}
              className={`rounded-lg border-2 border-dashed px-4 py-6 text-center text-xs transition-colors ${
                arrastando ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground'
              }`}
            >
              Arraste os documentos para cá
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm">Documentos</CardTitle>
              <div className="relative ml-auto">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome…"
                  aria-label="Buscar documento por nome"
                  className="h-8 w-56 pl-8 text-xs"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {erro && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                <p className="text-xs text-destructive">{erro}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void carregar(null, false)}>
                  Tentar de novo
                </Button>
              </div>
            )}
            {carregando && documentos.length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </p>
            ) : visiveis.length === 0 && !erro ? (
              <p className="py-4 text-sm text-muted-foreground">
                {busca ? 'Nenhum documento com esse nome nesta página.' : 'Nenhum documento ainda. Envie o primeiro acima.'}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {visiveis.map((d) => {
                  const posso = ehAdmin || (!!user?.id && d.dono_id === user.id)
                  return (
                    <li key={d.id} className="flex items-center gap-3 py-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{d.nome}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {tamanhoLegivel(d.tamanho)}
                          {d.criado_em ? ` · ${formatDateShort(d.criado_em)}` : ''}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Baixar ${d.nome}`} onClick={() => void baixar(d)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {posso && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Apagar ${d.nome}`} onClick={() => void apagar(d)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {(cursor || truncado) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="text-[11px] text-muted-foreground">
                  mostrando {documentos.length} {truncado ? 'de muitos' : 'até agora'}
                  {busca ? ' · a busca olha só o que já foi carregado' : ''}
                </span>
                {cursor && (
                  <Button type="button" variant="outline" size="sm" disabled={carregando} onClick={() => void carregar(cursor, true)}>
                    {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Carregar mais'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
