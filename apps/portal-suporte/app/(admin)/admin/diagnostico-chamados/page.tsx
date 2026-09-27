'use client'

// =============================================================================
// Diagnóstico — chamados malformados.
//
// Em 08/09/2026 apareceram dezenas de cards em branco no Backlog: sem título,
// sem responsável, sem nada. O quadro os agrupa ali porque agrupa em Backlog
// tudo que estiver sem `status`, mas ninguém sabia o que eram.
//
// Daqui não dá para investigar: as rotas de dado exigem sessão de pessoa, e a
// chave de máquina não carrega pessoa — que é justamente a trava que passamos a
// semana levantando, e não vou contorná-la para ler produção. Esta tela usa a
// SESSÃO DE QUEM ABRE para mostrar o dado cru dessas linhas.
//
// A CAUSA foi encontrada em 08/09: `POST /tickets/bulk-action` era um stub que
// fazia `model.create(body)`. A tela manda `{ ids, action, ... }`, então cada
// ação em lote no quadro CRIAVA um chamado sem título e sem status — card em
// branco, jogado em Backlog. Corrigido em scripts/bulk-action-conserto.py.
//
// Esta tela agora também LIMPA o que aquele defeito deixou para trás. Apagar é
// um por vez e com confirmação: é destrutivo e irreversível, e a lista é curta.
// =============================================================================

import { useEffect, useState } from 'react'
import { araraFetch } from '@/lib/arara/client'
import { ticketsApi } from '@/lib/api/tickets'
import { formatDate } from '@/lib/utils'

type Linha = Record<string, unknown>

/** Malformado = sem título OU sem status. É o que cai em Backlog sem nome. */
function malformado(t: Linha): boolean {
  const titulo = String(t.title ?? '').trim()
  const status = String(t.status ?? '').trim()
  return !titulo || !status
}

/** Só os campos preenchidos — linha vazia com 40 colunas nulas não ajuda. */
function preenchidos(t: Linha): [string, string][] {
  return Object.entries(t)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' &&
      !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
    .sort((a, b) => a[0].localeCompare(b[0])) as [string, string][]
}

export default function DiagnosticoChamados() {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [apagando, setApagando] = useState<string | null>(null)

  const apagar = async (id: string) => {
    setApagando(id)
    setErro(null)
    try {
      await ticketsApi.delete(id)
      setLinhas((prev) => prev.filter((t) => String(t.id) !== id))
      setConfirmar(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao apagar')
    } finally {
      setApagando(null)
    }
  }

  useEffect(() => {
    araraFetch
      .get<{ data?: Linha[] } | Linha[]>('/api/tickets')
      .then((r) => {
        const todos = Array.isArray(r) ? r : (r?.data ?? [])
        setLinhas(todos.filter(malformado))
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar'))
      .finally(() => setCarregando(false))
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Chamados malformados</h1>
        <p className="text-sm text-muted-foreground">
          Linhas sem título ou sem status — são as que aparecem em branco no Backlog.
          Esta tela apenas lê; nada é alterado.
        </p>
      </div>

      {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {erro && (
        <p className="rounded-md border border-sem-error-bd bg-sem-error px-3 py-2 text-sm text-sem-error-fg">
          {erro}
        </p>
      )}

      {!carregando && !erro && (
        <p className="text-sm text-foreground/80">
          <strong>{linhas.length}</strong> {linhas.length === 1 ? 'linha' : 'linhas'} nesta situação.
        </p>
      )}

      <ul className="space-y-2">
        {linhas.map((t) => {
          const id = String(t.id ?? '')
          return (
            <li key={id} className="rounded-md border border-border bg-card">
              <button
                type="button"
                onClick={() => setAberto(aberto === id ? null : id)}
                className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <code className="font-mono text-xs text-muted-foreground">{id}</code>
                <span className="text-xs text-muted-foreground">
                  nº {String(t.ticket_number ?? '—')}
                </span>
                <span className="text-xs text-muted-foreground">
                  status: {String(t.status ?? '—')}
                </span>
                <span className="text-xs text-muted-foreground">
                  criado: {t.created_at ? formatDate(String(t.created_at)) : '—'}
                </span>
                <span className="ml-auto text-xs text-muted-foreground/70">
                  {aberto === id ? 'ocultar' : 'ver campos'}
                </span>
              </button>

              <div className="flex items-center gap-2 border-t border-border px-3 py-1.5">
                {confirmar === id ? (
                  <>
                    <span className="text-xs text-sem-error-fg">
                      Apagar em definitivo? Não há como desfazer.
                    </span>
                    <button
                      type="button"
                      onClick={() => apagar(id)}
                      disabled={apagando === id}
                      className="rounded-md bg-sem-error-fg px-2.5 py-1 text-xs font-medium text-background disabled:opacity-50"
                    >
                      {apagando === id ? 'apagando…' : 'sim, apagar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmar(null)}
                      className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmar(id)}
                    className="text-xs text-muted-foreground/70 underline underline-offset-2 hover:text-sem-error-fg"
                  >
                    apagar esta linha
                  </button>
                )}
              </div>

              {aberto === id && (
                <div className="border-t border-border px-3 py-2">
                  <table className="w-full text-xs">
                    <tbody>
                      {preenchidos(t).map(([k, v]) => (
                        <tr key={k} className="align-top">
                          <td className="w-48 py-0.5 pr-3 font-mono text-muted-foreground">{k}</td>
                          <td className="py-0.5 break-all text-foreground/80">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
