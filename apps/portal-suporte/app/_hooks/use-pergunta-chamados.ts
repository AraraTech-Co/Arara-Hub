'use client'

// ─── usePerguntaChamados ─────────────────────────────────────────────────────
//
// Responde uma pergunta escrita em português com a lista de chamados que ela
// descreve ("o que a Casa & Lar tem em aberto?").
//
// Nasceu dentro do popup "Pergunte a I.A.", que era um segundo campo de busca
// flutuando por cima do conteúdo. Virou hook porque a mesma pergunta agora é
// respondida pela busca do portal (⌘K): o popup e o ⌘K já rodavam a MESMA
// `useGlobalSearch` — a única coisa que o popup tinha a mais era esta camada.
//
// ⚠️ NÃO é modelo de linguagem. Ver o aviso em lib/consulta-chamados.ts: a rota
// `/ai/chat` da plataforma é um stub 501, não há chave de LLM no cofre e a saída
// de rede só tem o provedor de WhatsApp. O que roda é reconhecimento dos nomes
// que existem nos dados. Por isso o rótulo "I.A." saiu junto com o botão.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { interpretar, type Interpretacao } from '@/lib/consulta-chamados'
import { resolver as resolverEmpresa } from '@/lib/empresas'
import { useCompanies } from './use-companies'

type Pessoa = { full_name?: string | null; email?: string | null } | null

export type ChamadoDaPergunta = {
  id: string
  ticket_number: string | null
  title: string
  status: string
  company_name: string | null
  requester: string | null
  created_at: string
  assignee: Pessoa
  co_assignees: Pessoa[]
}

export type Resposta = {
  /** Reconheceu empresa/pessoa/status/período nos dados? */
  reconheceu: boolean
  /** "3 chamados — empresa Casa & Lar · em aberto." */
  resumo: string
  achados: ChamadoDaPergunta[]
}

function nome(p: Pessoa): string {
  return (p?.full_name || p?.email || '').trim()
}

function linhas(res: unknown): ChamadoDaPergunta[] {
  // A rota do kanban devolve `{ data: {coluna: [...]}, columns, count }`.
  const d = (res as { data?: unknown })?.data
  if (Array.isArray(d)) return d as ChamadoDaPergunta[]
  if (d && typeof d === 'object') return Object.values(d as Record<string, ChamadoDaPergunta[]>).flat()
  return []
}

/**
 * @param ativo só carrega os chamados quando a busca está aberta — a paleta não
 *   pode custar uma consulta de ~440 linhas em toda navegação.
 */
export function usePerguntaChamados(ativo: boolean) {
  const { cadastradas, indice } = useCompanies()
  const [chamados, setChamados] = useState<ChamadoDaPergunta[] | null>(null)
  const [falha, setFalha] = useState<string | null>(null)

  useEffect(() => {
    if (!ativo || chamados) return
    araraFetch
      .get('/api/tickets/kanban')
      .then((r) => {
        const rows = linhas(r)
        setChamados(rows)
        // Lista vazia com requisição bem-sucedida também é falha: sem isto,
        // respondia "nenhum chamado" a tudo e parecia busca quebrada.
        if (rows.length === 0) setFalha('A consulta de chamados voltou vazia.')
      })
      .catch((e: unknown) => setFalha(e instanceof Error ? e.message : 'Falha ao consultar.'))
  }, [ativo, chamados])

  const pessoas = useMemo(() => {
    const s = new Set<string>()
    for (const t of chamados ?? []) {
      const a = nome(t.assignee)
      if (a) s.add(a)
      for (const c of t.co_assignees ?? []) {
        const n = nome(c)
        if (n) s.add(n)
      }
    }
    return Array.from(s)
  }, [chamados])

  const solicitantes = useMemo(() => {
    const s = new Set<string>()
    for (const t of chamados ?? []) if (t.requester) s.add(t.requester)
    return Array.from(s)
  }, [chamados])

  const filtrar = useCallback(
    (i: Interpretacao): ChamadoDaPergunta[] => {
      const corte = i.desdeDias ? Date.now() - i.desdeDias * 86_400_000 : null
      // Palavra a palavra, não a frase: as palavras de ligação somem na
      // interpretação, então "erro de impressora" vira "erro impressora" e
      // nunca casaria como trecho contíguo de um título real.
      const palavras = i.texto.toLowerCase().split(/\s+/).filter(Boolean)
      return (chamados ?? [])
        .filter((t) => {
          if (i.empresa) {
            const dele = resolverEmpresa(t.company_name, indice)?.name ?? t.company_name ?? ''
            if (dele !== i.empresa) return false
          }
          if (i.status.length && !i.status.includes(t.status)) return false
          if (i.semResponsavel && (nome(t.assignee) || (t.co_assignees ?? []).length)) return false
          if (i.responsavel) {
            const seu =
              nome(t.assignee) === i.responsavel ||
              (t.co_assignees ?? []).some((c) => nome(c) === i.responsavel)
            if (!seu) return false
          }
          if (i.solicitante && (t.requester ?? '') !== i.solicitante) return false
          if (corte && new Date(t.created_at).getTime() < corte) return false
          if (palavras.length) {
            const alvo = `${t.title} ${t.company_name ?? ''} ${t.ticket_number ?? ''}`.toLowerCase()
            if (!palavras.every((p) => alvo.includes(p))) return false
          }
          return true
        })
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    },
    [chamados, indice],
  )

  /** `null` = não reconheceu nada; quem chama cai na busca de texto. */
  const responder = useCallback(
    (q: string): Resposta | null => {
      const texto = q.trim()
      if (!texto) return null
      const i = interpretar(texto, cadastradas, indice, pessoas, solicitantes)
      const reconheceu =
        i.entendido.length > 0 &&
        Boolean(i.empresa || i.responsavel || i.solicitante || i.status.length || i.semResponsavel || i.desdeDias)
      if (!reconheceu) return null
      const achados = filtrar(i)
      return {
        reconheceu: true,
        resumo: achados.length
          ? `${achados.length} chamado${achados.length > 1 ? 's' : ''} — ${i.entendido.join(' · ')}`
          : `Nenhum chamado com ${i.entendido.join(' · ')}`,
        achados,
      }
    },
    [cadastradas, indice, pessoas, solicitantes, filtrar],
  )

  return { responder, falha, carregado: chamados !== null }
}
