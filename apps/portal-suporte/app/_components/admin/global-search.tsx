'use client'

// =============================================================================
// Busca do portal (⌘K) — agora também paleta de comandos.
//
// Absorveu os dois botões flutuantes do canto inferior esquerdo. O motivo não
// foi só que eles cobriam o conteúdo:
//
// • "Pergunte a I.A." e esta busca JÁ rodavam a mesma `useGlobalSearch`. Eram
//   dois campos de texto que devolviam as mesmas coisas, e o popup ainda caía
//   nesta busca quando não entendia a pergunta. O que ele tinha a mais — a
//   interpretação em português — está aqui agora, em `usePerguntaChamados`.
//   Ou seja: a busca ficou mais esperta e sumiu uma duplicata.
//
// • O rótulo "I.A." saiu de propósito: não há modelo de linguagem por trás
//   (ver o aviso em lib/consulta-chamados.ts). Prometer IA num reconhecedor de
//   nomes é promessa que a coisa não cumpre.
//
// • "Assistente de suporte" é de outra natureza — diagnóstico guiado, não
//   busca. Vira AÇÃO, que é para isso que serve uma paleta: aparece com a
//   caixa vazia e responde a "assistente", "diagnóstico", "suporte".
//
// Descoberta: a caixa fica visível na lateral com o ⌘K escrito ao lado, e a
// paleta aberta e vazia lista as ações. Ninguém precisa adivinhar o atalho.
// =============================================================================

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LifeBuoy, Search, X } from 'lucide-react'
import {
  useGlobalSearch,
  TIPO_ICONE,
  TIPO_ROTULO,
  type SearchResult,
} from '@/hooks/use-global-search'
import { usePerguntaChamados } from '@/hooks/use-pergunta-chamados'
import { getStatusLabel } from '@/lib/ticket-status'
import { SupportFlowModal } from '@/components/support-fabs/support-flow-modal'

const EXEMPLOS = [
  'chamados abertos da Casa & Lar',
  'o que o Hefler tem em aberto',
  'chamados sem responsável essa semana',
]

type Acao = { id: string; rotulo: string; termos: string[] }

const ACOES: Acao[] = [
  {
    id: 'assistente',
    rotulo: 'Abrir assistente de suporte',
    termos: ['assistente', 'suporte', 'diagnostico', 'diagnóstico', 'ajuda', 'roteiro'],
  },
]

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [fluxoAberto, setFluxoAberto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const { results, loading } = useGlobalSearch(query)
  // Os chamados só são carregados com a paleta aberta.
  const { responder, falha } = usePerguntaChamados(open)

  // A pergunta tem precedência: quando ela reconhece empresa, pessoa ou status,
  // a resposta é melhor que a lista de texto — e quando não reconhece, devolve
  // `null` e a busca normal assume. É o mesmo desvio que o popup fazia.
  const resposta = useMemo(() => (query.trim().length >= 2 ? responder(query) : null), [query, responder])

  const acoes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ACOES
    return ACOES.filter((a) => a.termos.some((t) => t.startsWith(q) || q.startsWith(t)))
  }, [query])

  function executar(id: string) {
    if (id === 'assistente') setFluxoAberto(true)
    setOpen(false)
    setQuery('')
  }

  function abrirResultado(r: SearchResult) {
    router.push(r.href)
    setOpen(false)
    setQuery('')
  }

  function abrirChamado(id: string) {
    router.push(`/admin/tickets/view?id=${encodeURIComponent(id)}`)
    setOpen(false)
    setQuery('')
  }

  // Uma lista só para o teclado: ação, depois chamado da pergunta, depois
  // resultado de texto. Sem isso as setas andariam em uma seção e o Enter
  // abriria outra.
  const navegaveis = useMemo(() => {
    const itens: Array<{ tipo: 'acao' | 'chamado' | 'resultado'; id: string }> = []
    for (const a of acoes) itens.push({ tipo: 'acao', id: a.id })
    if (resposta) for (const c of resposta.achados.slice(0, 8)) itens.push({ tipo: 'chamado', id: c.id })
    else for (const r of results) itens.push({ tipo: 'resultado', id: r.id })
    return itens
  }, [acoes, resposta, results])

  function acionar(indice: number) {
    const alvo = navegaveis[indice]
    if (!alvo) return
    if (alvo.tipo === 'acao') return executar(alvo.id)
    if (alvo.tipo === 'chamado') return abrirChamado(alvo.id)
    const r = results.find((x) => x.id === alvo.id)
    if (r) abrirResultado(r)
  }

  const posicao = (tipo: 'acao' | 'chamado' | 'resultado', id: string) =>
    navegaveis.findIndex((n) => n.tipo === tipo && n.id === id)

  if (!open) {
    return (
      <>
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="hidden items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">⌘K</kbd>
        </button>
        <SupportFlowModal aberto={fluxoAberto} onFechar={() => setFluxoAberto(false)} />
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)} />

      <div className="fixed left-1/2 top-20 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, navegaveis.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); acionar(selectedIndex) }
            }}
            placeholder="Buscar ou perguntar — chamado, empresa, CNPJ, pessoa…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button onClick={() => setOpen(false)} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {acoes.length > 0 && (
            <ul className="py-2">
              {acoes.map((a) => {
                const i = posicao('acao', a.id)
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => executar(a.id)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selectedIndex ? 'bg-background' : 'hover:bg-muted'}`}
                    >
                      <LifeBuoy aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-sm font-medium text-foreground">{a.rotulo}</span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">ação</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Resposta da pergunta: o que foi ENTENDIDO vem junto. Lista sem
              dizer o que ela é passa por resposta certa quando é a errada. */}
          {resposta && (
            <div className="border-t border-border">
              <p className="px-4 pb-1 pt-3 text-xs text-muted-foreground">{resposta.resumo}</p>
              {falha && <p className="px-4 pb-1 text-[11px] text-sem-error-fg">{falha}</p>}
              <ul className="pb-2">
                {resposta.achados.slice(0, 8).map((c) => {
                  const i = posicao('chamado', c.id)
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => abrirChamado(c.id)}
                        className={`flex w-full items-start gap-3 px-4 py-2 text-left transition-colors ${i === selectedIndex ? 'bg-background' : 'hover:bg-muted'}`}
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">{c.ticket_number ?? '—'}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.title}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{getStatusLabel(c.status)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {!resposta && loading && <div className="px-4 py-3 text-sm text-muted-foreground">Buscando...</div>}

          {!resposta && !loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Nenhum resultado para &quot;{query}&quot;</div>
          )}

          {!resposta && results.length > 0 && (
            <ul className="border-t border-border py-2">
              {results.map((r) => {
                const i = posicao('resultado', r.id)
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => abrirResultado(r)}
                      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${i === selectedIndex ? 'bg-background' : 'hover:bg-muted'}`}
                    >
                      <span className="mt-0.5 text-base">{TIPO_ICONE[r.type]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                        {r.subtitle && <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{TIPO_ROTULO[r.type]}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {!query && (
            <div className="border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Busque por chamado, empresa, CNPJ ou pessoa — ou pergunte:</p>
              <ul className="mt-1.5 space-y-1">
                {EXEMPLOS.map((ex) => (
                  <li key={ex}>
                    <button
                      onClick={() => { setQuery(ex); setSelectedIndex(0); inputRef.current?.focus() }}
                      className="text-xs text-primary hover:underline"
                    >
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <SupportFlowModal aberto={fluxoAberto} onFechar={() => setFluxoAberto(false)} />
    </>
  )
}
