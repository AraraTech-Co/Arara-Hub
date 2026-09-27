'use client'

// =============================================================================
// Painel lateral — disponibilidade dos servidores HML no Kanban Dev.
//
// Um servidor está ocupado se algum card Dev estiver em Pronto p/ Teste ou Em
// Testes com aquele `environment`. A lista vem das constantes (SGC standalones);
// a ocupação vem dos cards já carregados no quadro.
// =============================================================================

import {
  SERVIDORES_HML,
  labelServidorHml,
  travaHml,
} from '@/lib/servidores-hml'
import { numeroDev } from '@/lib/kanban-dev'

export type CardHmlRef = {
  id: string
  ticket_number?: string | null
  title?: string | null
  status: string
  environment?: string | null
}

export function ServidoresHmlPanel({ cards }: { cards: CardHmlRef[] }) {
  const ocupacao = new Map<string, CardHmlRef>()
  for (const c of cards) {
    const env = String(c.environment || '').trim()
    if (!env || !travaHml(c.status)) continue
    if (!ocupacao.has(env)) ocupacao.set(env, c)
  }

  const livres = SERVIDORES_HML.filter((s) => !ocupacao.has(s)).length

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">Servidores HML</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {livres} disponível{livres === 1 ? '' : 'eis'} · {ocupacao.size} ocupado{ocupacao.size === 1 ? '' : 's'}
        </p>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {SERVIDORES_HML.map((slug) => {
          const dono = ocupacao.get(slug)
          return (
            <li
              key={slug}
              className={`rounded-md border px-2.5 py-2 text-xs ${
                dono
                  ? 'border-sem-warning-bd/60 bg-sem-warning/40'
                  : 'border-border bg-muted/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{labelServidorHml(slug)}</span>
                <span
                  className={
                    dono
                      ? 'shrink-0 font-medium text-sem-warning-fg'
                      : 'shrink-0 text-muted-foreground'
                  }
                >
                  {dono ? 'Ocupado' : 'Livre'}
                </span>
              </div>
              {dono && (
                <p className="mt-1 truncate text-muted-foreground" title={dono.title || undefined}>
                  <span className="font-mono font-semibold text-foreground">
                    {numeroDev(dono.ticket_number)}
                  </span>
                  {dono.title ? ` · ${dono.title}` : ''}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
