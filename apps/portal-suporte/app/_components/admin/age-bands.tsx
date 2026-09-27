'use client'

// =============================================================================
// Há quanto tempo os chamados em aberto estão esperando.
//
// Isto ocupa o lugar que era do SLA no painel, por um motivo factual e não de
// gosto: o SLA tem registro para 4 dos 454 chamados. Um painel construído em
// cima dele fala sobre 0,9% do trabalho e cala sobre o resto — e ainda assim
// ocupava seis lugares na tela (card, faixa de alerta, selo na linha, grupo na
// fila pessoal, selo por agente, botão no cabeçalho).
//
// A idade existe para todos, sempre. E responde a pergunta que o SLA prometia
// responder e não conseguia: o que está esperando demais.
//
// Cor por `severity-p3..p0`, a família criada para exatamente esta escala e que
// até então não era usada uma única vez no painel. Quanto mais velho, mais
// grave — e a leitura vira a mesma que o time já faz com prioridade.
// =============================================================================

import Link from 'next/link'

export type FaixaIdade = { label: string; value: number; token: string }

export function AgeBands({ faixas }: { faixas: FaixaIdade[] }) {
  const total = faixas.reduce((s, f) => s + f.value, 0)
  const velhos = faixas.find((f) => f.token === 'p0')?.value ?? 0

  if (!total) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
        Nenhum chamado em aberto.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {/* O número que importa é o dos mais velhos, então é ele que vem
              grande — não o total, que a régua da fila já mostra. */}
          <span className="text-2xl font-bold text-foreground">{velhos}</span>{' '}
          {velhos === 1 ? 'chamado parado há mais de 3 dias' : 'chamados parados há mais de 3 dias'}
        </p>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border">
        {faixas.map((f) => (
          f.value > 0 && (
            <span
              key={f.label}
              title={`${f.value} · ${f.label}`}
              style={{ width: `${(f.value / total) * 100}%`, background: `var(--severity-${f.token}-fg)` }}
            />
          )
        ))}
      </div>

      {/* Legenda com o número junto: uma barra de 3px de altura não comporta
          rótulo dentro, e sem legenda a cor sozinha não diz nada — o que
          também deixaria a informação inacessível para quem não distingue
          matiz. */}
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {faixas.map((f) => (
          <li key={f.label} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: `var(--severity-${f.token}-fg)` }}
            />
            <span className="text-muted-foreground">{f.label}</span>
            <span className="ml-auto font-semibold text-foreground">{f.value}</span>
          </li>
        ))}
      </ul>

      {velhos > 0 && (
        <Link
          href="/admin/kanban/?sort=created_at&dir=asc"
          className="mt-3 inline-flex text-xs font-medium text-sem-info-fg hover:underline"
        >
          Ver os mais antigos no Kanban
        </Link>
      )}
    </div>
  )
}
