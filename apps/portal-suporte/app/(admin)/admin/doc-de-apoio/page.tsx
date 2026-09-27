'use client'

// =============================================================================
// Doc de Apoio — documentação do suporte técnico, nativa no portal.
//
// Substitui o bundle HTML de 6.745 linhas que vinha de fora. Ele não podia ser
// publicado: tinha 30 endereços de servidores de clientes e credenciais em
// texto puro espalhados pelo arquivo, e tudo que o portal publica é estático e
// legível sem login. Tentar limpar por padrão falhou de um jeito instrutivo —
// removi o menu de servidores e ainda sobraram 25 hosts e 22 IPs no corpo.
//
// Então o corte foi por natureza, não por arquivo:
//  • os 98 PDFs (verificadamente sem credencial) vão para o hosting da
//    plataforma, em 4 fatias — o limite de upload da API é 50 MB e o acervo
//    tem 154 MB. `url` no catálogo já aponta para a fatia certa.
//  • as 152 seções de referência sem dado sensível vêm no catálogo.
//  • as 29 seções com IP/credencial e os 36 acessos de cliente NÃO estão aqui:
//    entram depois, servidos com autenticação.
//
// A busca cobre documento e texto de referência ao mesmo tempo, que é o que o
// menu suspenso do bundle antigo não fazia.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Library, Search, ExternalLink, Lock, Server } from 'lucide-react'
import { RequireAuth } from '@/lib/arara/RequireAuth'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import catalogo from '@/lib/doc-apoio-catalogo.json'
import { araraFetch } from '@/lib/arara/client'

type Documento = { nome: string; arquivo: string; categoria: string; url: string }
/** Vem da API com autenticação — nunca do bundle. */
type Restrito = { id: string; tipo: 'acesso' | 'secao'; titulo: string; url: string; host: string; texto: string }
type Secao = { titulo: string; texto: string; categoria: string }

const { documentos, secoes } = catalogo as { documentos: Documento[]; secoes: Secao[] }

const ROTULOS: Record<string, string> = {
  acessos: 'Acessos',
  compras: 'Compras',
  estoque: 'Estoque',
  financeiro: 'Financeiro',
  geral: 'Geral',
  integracoes: 'Integrações',
  nfe: 'NF-e',
  pdv: 'PDV',
  promocoes: 'Promoções',
  relatorios: 'Relatórios',
  sgc: 'SGC',
}

/** Sem acento e em minúsculas: "promoção" tem de achar "Promocao". */
const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function DocDeApoioBody() {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  // Acessos de clientes e seções com endereço interno: só com sessão, e a rota
  // devolve 403 para chave de API sem pessoa. Por isso não vêm no catálogo.
  const [restrito, setRestrito] = useState<Restrito[] | null>(null)
  const [erroRestrito, setErroRestrito] = useState('')

  const carregarRestrito = useCallback(async () => {
    try {
      const res = await araraFetch.get('/api/doc-acessos')
      const linhas = (res as { data?: Restrito[] })?.data
      setRestrito(Array.isArray(linhas) ? linhas : [])
    } catch (e) {
      setErroRestrito(e instanceof Error ? e.message : 'Não foi possível carregar os acessos.')
      setRestrito([])
    }
  }, [])

  useEffect(() => {
    void carregarRestrito()
  }, [carregarRestrito])

  const categorias = useMemo(
    () => [...new Set(documentos.map((d) => d.categoria))].sort(),
    [],
  )

  const { docs, refs, restritos } = useMemo(() => {
    const q = normalizar(busca.trim())
    // O mesmo arquivo aparece em mais de uma categoria no catálogo original
    // (149 entradas para 98 arquivos); sem deduplicar, a lista repete.
    const vistos = new Set<string>()
    const docs = documentos.filter((d) => {
      if (categoria && d.categoria !== categoria) return false
      if (q && !normalizar(d.nome).includes(q)) return false
      if (vistos.has(d.arquivo)) return false
      vistos.add(d.arquivo)
      return true
    })
    const refs = q
      ? secoes.filter(
          (s) => normalizar(s.titulo).includes(q) || normalizar(s.texto).includes(q),
        )
      : []
    const q2 = q
    const restritos = (restrito ?? []).filter(
      (r) => !q2 || normalizar(r.titulo).includes(q2) || normalizar(r.texto).includes(q2),
    )
    return { docs, refs, restritos }
  }, [busca, categoria, restrito])

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-sem-info p-2">
          <Library className="h-6 w-6 text-sem-info-fg" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Doc de Apoio</h1>
          <p className="text-sm text-muted-foreground">
            {new Set(documentos.map((d) => d.arquivo)).size} documentos e {secoes.length}{' '}
            tópicos de referência do suporte técnico
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar documento ou assunto…"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip ativo={categoria === null} onClick={() => setCategoria(null)}>
          Todos
        </Chip>
        {categorias.map((c) => (
          <Chip key={c} ativo={categoria === c} onClick={() => setCategoria(c)}>
            {ROTULOS[c] ?? c}
          </Chip>
        ))}
      </div>

      {refs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            Referência ({refs.length})
          </h2>
          {refs.slice(0, 8).map((s) => (
            <Card key={s.titulo}>
              <CardContent className="py-4">
                <p className="text-sm font-medium text-foreground">{s.titulo}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {s.texto}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Documentos ({docs.length})</h2>
        {docs.length === 0 ? (
          <EmptyState icon="🔍" title="Nenhum documento encontrado" size="sm" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {docs.map((d) => (
              <li key={d.arquivo}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm text-foreground">{d.nome}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {ROTULOS[d.categoria] ?? d.categoria}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RestritoSecao linhas={restritos} carregando={restrito === null} erro={erroRestrito} />
    </main>
  )
}

/**
 * Acessos de clientes e seções com endereço interno.
 *
 * Fica separado do resto da tela de propósito: este conteúdo NÃO está no
 * pacote publicado — ele chega da API só para quem tem sessão de `support`
 * para cima. Credencial não passa por aqui; o texto diz "(ver no cofre)".
 */
function RestritoSecao({
  linhas,
  carregando,
  erro,
}: {
  linhas: Restrito[]
  carregando: boolean
  erro: string
}) {
  const acessos = linhas.filter((l) => l.tipo === 'acesso')
  const secoes = linhas.filter((l) => l.tipo === 'secao')

  return (
    <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Acessos e dados internos</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          restrito à equipe
        </span>
      </div>

      {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {erro && <p className="text-sm text-sem-error-fg">{erro}</p>}

      {!carregando && !erro && linhas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nada encontrado para esta busca.</p>
      )}

      {acessos.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {acessos.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm text-foreground">{a.titulo}</span>
                <span className="shrink-0 truncate text-xs text-muted-foreground">{a.host}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {secoes.map((s) => (
        <details key={s.id} className="rounded-lg border border-border bg-card px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {s.titulo}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {s.texto}
          </p>
        </details>
      ))}
    </section>
  )
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        ativo
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export default function DocDeApoioPage() {
  return (
    <RequireAuth staffOnly>
      <div className="pt-14 lg:pt-0">
        <DocDeApoioBody />
      </div>
    </RequireAuth>
  )
}
