'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { AcaoAgoraItem } from '@/lib/admin/dashboard-from-arara';
import { getStatusColor, getStatusLabel } from '@/lib/ticket-status';

/**
 * A tabela É o painel.
 *
 * O que faltava na aba padrão não era um número: era a LISTA da equipe. Havia
 * "Minha Operação" (só o que é meu) e um resumo em cartões — nada que
 * respondesse "o que ninguém pegou ainda". Quem chega às 8h precisa disso
 * antes de qualquer métrica.
 *
 * Medidas do padrão de mercado para tabela densa, e o motivo de cada uma:
 * linha de 36px e fonte de 13px (cabe o dobro de chamado na mesma altura);
 * número alinhado à direita com `tabular-nums` (a coluna não dança quando o
 * painel atualiza sozinho); cor só em estado — sem dono, envelhecendo, urgente.
 */

const FILTROS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'sem-dono', rotulo: 'Sem dono' },
  { id: 'parados', rotulo: 'Parados' },
  { id: 'meus', rotulo: 'Meus' },
] as const;

type FiltroId = (typeof FILTROS)[number]['id'];

/** Faixas de idade: verde até 8h, âmbar até 24h, vermelho acima de 3 dias. */
function corDaEspera(h: number): string {
  if (h >= 72) return 'text-sem-error-fg font-medium';
  if (h >= 24) return 'text-sem-warning-fg font-medium';
  return 'text-foreground';
}

function espera(h: number): string {
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r === 0 ? `${d}d` : `${d}d ${r}h`;
}

export function AcaoAgoraTable({ itens }: { itens: AcaoAgoraItem[] }) {
  const [filtro, setFiltro] = useState<FiltroId>('todos');

  const visiveis = useMemo(() => {
    switch (filtro) {
      case 'sem-dono': return itens.filter(i => !i.assigneeName);
      case 'parados':  return itens.filter(i => i.parado);
      case 'meus':     return itens.filter(i => i.meu);
      default:         return itens;
    }
  }, [itens, filtro]);

  const mostrados = visiveis.slice(0, 12);

  const contagem = (id: FiltroId) =>
    id === 'todos' ? itens.length
    : id === 'sem-dono' ? itens.filter(i => !i.assigneeName).length
    : id === 'parados' ? itens.filter(i => i.parado).length
    : itens.filter(i => i.meu).length;

  return (
    <section className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-media)]">
      <div className="flex h-11 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">Exigem ação agora</h2>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {itens.length}
          </span>
        </div>
        <div role="tablist" aria-label="Filtrar" className="flex gap-1">
          {FILTROS.map(f => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded px-2 py-1 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
                filtro === f.id
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.rotulo}
              <span className="ml-1 tabular-nums opacity-60">{contagem(f.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {mostrados.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
          {filtro === 'todos'
            ? 'Nada exigindo ação agora — fila sob controle.'
            : 'Nenhum chamado neste filtro.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          {/* min-w obriga a rolar em vez de espremer: sem ele, no celular cada
              linha vira três e a tabela perde a única vantagem que tem, que é
              uma linha = um chamado. */}
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="h-9 px-4 font-semibold">Chamado</th>
                <th className="h-9 px-3 font-semibold">Empresa</th>
                <th className="h-9 px-3 font-semibold">Status</th>
                <th className="h-9 px-3 font-semibold">Responsável</th>
                <th className="h-9 px-3 text-right font-semibold">Espera</th>
                <th className="h-9 px-4 text-right font-semibold">Msgs</th>
              </tr>
            </thead>
            <tbody>
              {mostrados.map(i => (
                <tr key={i.id} className="h-9 border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="max-w-[420px] truncate px-4">
                    <Link href={`/admin/tickets/view?id=${i.id}`} className="hover:underline">
                      {i.ticketNumber && (
                        <span className="mr-2 font-mono text-[11px] text-muted-foreground">
                          {i.ticketNumber}
                        </span>
                      )}
                      {i.title}
                    </Link>
                  </td>
                  <td className="max-w-[200px] truncate px-3 text-muted-foreground">
                    {i.companyName ?? '—'}
                  </td>
                  <td className="px-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusColor(i.status)}`}>
                      {getStatusLabel(i.status)}
                    </span>
                  </td>
                  <td className="px-3">
                    {i.assigneeName ?? (
                      <span className="text-sem-error-fg">— sem dono</span>
                    )}
                  </td>
                  <td className={`px-3 text-right tabular-nums ${corDaEspera(i.idadeHoras)}`}>
                    {espera(i.idadeHoras)}
                  </td>
                  <td className="px-4 text-right tabular-nums text-muted-foreground">{i.mensagens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visiveis.length > mostrados.length && (
        <div className="flex h-9 items-center border-t border-border px-4 text-[11px] text-muted-foreground">
          mostrando {mostrados.length} de {visiveis.length}
          <Link href="/admin/kanban" className="ml-1 font-medium text-primary hover:underline">
            · ver todos no Kanban
          </Link>
        </div>
      )}
    </section>
  );
}
