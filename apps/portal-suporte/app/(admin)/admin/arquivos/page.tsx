'use client'

// =============================================================================
// Repositório de arquivos de apoio (Fase 5).
//
// Acervo SEPARADO dos anexos de chamado: script, manual, material de
// homologação. A busca é no cliente, sobre a página carregada — e a tela DIZ
// quando há mais, em vez de parecer completa.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Folder, Loader2, Search, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  arquivosApi, tamanhoLegivel, ARQUIVO_MAX_MB, NIVEIS_DE_ACESSO, type ArquivoDeApoio,
} from '@/lib/api/arquivos'
import { FEATURE_GRANTS } from '@/lib/auth/feature-grants'
import { whatsappApi } from '@/lib/api/whatsapp'
import { ANEXO_ACCEPT, lerDataUri, motivoRecusaAnexo } from '@/lib/anexos'
import { formatDateShort } from '@/lib/utils'

export default function ArquivosPage() {
  const { toast } = useToast()
  const [arquivos, setArquivos] = useState<ArquivoDeApoio[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [truncado, setTruncado] = useState(false)
  // Duas pastas, de propósito: a que FILTRA a lista e a de DESTINO do upload.
  // Era um campo só — digitar o destino refazia a consulta a cada tecla, e
  // escolher um chip mudava para onde o próximo arquivo ia.
  const [pasta, setPasta] = useState('')
  const [destino, setDestino] = useState('')
  // Quem pode ver o que for enviado. "" = toda a equipe, que é o padrão e o
  // comportamento de antes deste campo existir.
  const [acesso, setAcesso] = useState('')
  // Contas de WhatsApp ativas: elas também geram grant (`wa_conta_<id>`), e
  // material de um setor costuma ser exatamente o caso de "só quem atende
  // aquele número".
  const [contas, setContas] = useState<{ id: string; nome: string }[]>([])
  useEffect(() => {
    let vivo = true
    whatsappApi.listContas()
      .then((r) => { if (vivo) setContas(r.data ?? []) })
      // Sem contas cadastradas a rota devolve lista vazia; falhar aqui só
      // significa que não há grant de conta a oferecer.
      .catch(() => { if (vivo) setContas([]) })
    return () => { vivo = false }
  }, [])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async (p: string, cur: string | null, acumular: boolean) => {
    setCarregando(true)
    setErro(null)
    try {
      const r = await arquivosApi.listar(p || null, cur)
      const d = r.data
      setArquivos((antes) => (acumular ? [...antes, ...(d?.arquivos ?? [])] : (d?.arquivos ?? [])))
      setCursor(d?.cursor ?? null)
      setTruncado(!!d?.truncado)
    } catch (err) {
      // Erro aparece; lista vazia silenciosa pareceria "não há arquivos".
      setErro(err instanceof Error ? err.message : 'Não deu para listar os arquivos.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar(pasta, null, false) }, [pasta, carregar])

  const pastas = useMemo(() => {
    const vistas = new Set<string>()
    for (const a of arquivos) if (a.pasta) vistas.add(a.pasta)
    return [...vistas].sort()
  }, [arquivos])

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return arquivos
    return arquivos.filter((a) => a.nome.toLowerCase().includes(t) || a.pasta.toLowerCase().includes(t))
  }, [arquivos, busca])

  const enviar = useCallback(async (files: FileList | File[]) => {
    const lista = [...files]
    if (!lista.length) return
    setEnviando(true)
    try {
      for (const file of lista) {
        // Mesma régua dos anexos de chamado: uma fonte de limites.
        const recusa = motivoRecusaAnexo(file)
        if (recusa) {
          toast({ title: `${file.name} não foi enviado`, description: recusa, variant: 'destructive' })
          continue
        }
        const conteudo = await lerDataUri(file)
        // O prefixo diz qual dos dois campos o servidor recebe: nível e grant
        // são regras diferentes, e mandar os dois juntos seria ambíguo.
        const nivel = acesso.startsWith('nivel:') ? acesso.slice(6) : undefined
        const grant = acesso.startsWith('grant:') ? acesso.slice(6) : undefined
        await arquivosApi.enviar({
          nome: file.name, pasta: destino, conteudo,
          acl_nivel: nivel, acl_grant: grant,
        })
      }
      await carregar(pasta, null, false)
      toast({ title: lista.length === 1 ? 'Arquivo enviado' : `${lista.length} arquivos enviados` })
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
  }, [destino, acesso, pasta, carregar, toast])

  const baixar = useCallback(async (a: ArquivoDeApoio) => {
    try {
      const r = await arquivosApi.baixar(a.id)
      const link = document.createElement('a')
      link.href = r.data.conteudo
      link.download = r.data.nome || a.nome
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

  const apagar = useCallback(async (a: ArquivoDeApoio) => {
    // Confirmação explícita: apagar material de apoio de outra pessoa não pode
    // acontecer por um clique torto.
    if (!window.confirm(`Apagar "${a.nome}"? Quem enviou e quando fica registrado.`)) return
    try {
      await arquivosApi.apagar(a.id)
      setArquivos((antes) => antes.filter((x) => x.id !== a.id))
      toast({ title: 'Arquivo apagado' })
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
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Arquivos de apoio</h1>
          <p className="text-sm text-muted-foreground">
            Scripts, manuais e materiais de homologação. Separado dos anexos de chamado.
          </p>
        </div>

        {/* Enviar — com o limite À VISTA, não só na recusa. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Enviar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={destino}
                placeholder="pasta de destino (opcional) — ex.: scripts/sgc"
                aria-label="Pasta de destino do upload"
                onChange={(e) => setDestino(e.target.value)}
                className="max-w-xs"
              />
              {/* Quem pode ver — o servidor valida nível e grant, então aqui é
                  lista e não campo livre. Sem este seletor, tudo que entrava
                  pela tela ficava visível para toda a equipe, mesmo quando o
                  material não era para todos. */}
              <select
                value={acesso}
                aria-label="Quem pode ver os arquivos enviados"
                onChange={(e) => setAcesso(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Quem pode ver: toda a equipe</option>
                {NIVEIS_DE_ACESSO.map((n) => (
                  <option key={n.valor} value={`nivel:${n.valor}`}>{n.rotulo}</option>
                ))}
                {FEATURE_GRANTS.map((g) => (
                  <option key={g.key} value={`grant:${g.key}`}>
                    Só quem tem: {g.label}
                  </option>
                ))}
                {contas.map((c) => (
                  <option key={c.id} value={`grant:wa_conta_${c.id}`}>
                    Só quem atende: {c.nome}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" disabled={enviando} onClick={() => entrada.current?.click()} className="gap-1">
                {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Escolher arquivo
              </Button>
              <span className="text-xs text-muted-foreground">
                até <strong>{ARQUIVO_MAX_MB} MB</strong> por arquivo
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
              Arraste arquivos para cá
              {destino ? <> — vão para <strong>{destino}</strong></> : null}
              {acesso ? <> · visíveis só para quem tem o acesso escolhido</> : null}
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm">
                {pasta ? <span className="inline-flex items-center gap-1"><Folder className="h-3.5 w-3.5" />{pasta}</span> : 'Todos'}
              </CardTitle>
              <div className="relative ml-auto">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome…"
                  className="h-8 w-56 pl-8 text-xs"
                />
              </div>
            </div>
            {pastas.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                <button
                  type="button"
                  onClick={() => setPasta('')}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${!pasta ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                  todas
                </button>
                {pastas.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPasta(p)}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${pasta === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {erro && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                <p className="text-xs text-destructive">{erro}</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void carregar(pasta, null, false)}>
                  Tentar de novo
                </Button>
              </div>
            )}
            {carregando && arquivos.length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </p>
            ) : visiveis.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                {busca ? 'Nada bate com a busca nesta página.' : 'Nenhum arquivo aqui ainda.'}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {visiveis.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{a.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {a.pasta ? `${a.pasta} · ` : ''}{tamanhoLegivel(a.tamanho)}
                        {a.criado_em ? ` · ${formatDateShort(a.criado_em)}` : ''}
                        {a.acl_grant ? ` · restrito (${a.acl_grant})` : a.acl_nivel ? ` · ${a.acl_nivel}+` : ''}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Baixar ${a.nome}`} onClick={() => void baixar(a)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Apagar ${a.nome}`} onClick={() => void apagar(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* A tela DIZ que há mais, em vez de parecer completa. */}
            {(cursor || truncado) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="text-[11px] text-muted-foreground">
                  mostrando {arquivos.length} {truncado ? 'de muitos' : 'até agora'}
                  {busca ? ` · a busca olha só esta página` : ''}
                </span>
                {cursor && (
                  <Button type="button" variant="outline" size="sm" disabled={carregando} onClick={() => void carregar(pasta, cursor, true)}>
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
