'use client';

import type { Sinais } from '@/lib/admin/dashboard-from-arara';

/**
 * Sete sinais na altura de UM cartão do modelo antigo.
 *
 * O painel tinha quatro cartões iguais, cada um com um quadradinho colorido de
 * ícone e um número em `text-3xl`. Numa tela de 1800px isso gasta a largura
 * inteira para dizer quatro números — e é o layout mais reproduzido por
 * gerador de interface que existe, o que explica a sensação de template.
 *
 * A troca é a do mercado para ferramenta profissional: chrome baixo, densidade
 * alta. A hierarquia passa a vir de peso e alinhamento, não de tamanho de
 * fonte; o ícone sai (não informava nada que o rótulo já não dissesse); e a
 * cor fica só onde significa estado — os dois primeiros, que exigem ação.
 */

type Sinal = {
  rotulo: string;
  valor: string;
  apoio: string;
  /** Token de cor, só quando o número em si é um chamado à ação. */
  tom?: 'error' | 'warning' | 'success';
};

function horas(h: number): string {
  if (h < 1) return '<1h';
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function SignalStrip({ sinais }: { sinais: Sinais }) {
  const saldo = sinais.resolvidosHoje - sinais.abertosHoje;
  const delta = sinais.abertosHoje - sinais.abertosOntem;

  const itens: Sinal[] = [
    {
      rotulo: 'Sem responsável',
      valor: String(sinais.semDono),
      apoio: sinais.semDono > 0 ? `mais antigo ${horas(sinais.semDonoHoras)}` : 'todos atribuídos',
      tom: sinais.semDono > 0 ? 'error' : undefined,
    },
    {
      rotulo: 'Muito alta',
      valor: String(sinais.urgentes),
      apoio: sinais.urgentesParados > 0 ? `${sinais.urgentesParados} parados` : 'todos em movimento',
      tom: sinais.urgentes > 0 ? 'warning' : undefined,
    },
    {
      rotulo: 'Ativos',
      valor: String(sinais.ativos),
      apoio: delta === 0 ? 'estável' : delta > 0 ? `▲ ${delta} vs ontem` : `▼ ${Math.abs(delta)} vs ontem`,
    },
    { rotulo: 'Abertos hoje', valor: String(sinais.abertosHoje), apoio: `ontem ${sinais.abertosOntem}` },
    {
      rotulo: 'Resolvidos hoje',
      valor: String(sinais.resolvidosHoje),
      apoio: saldo === 0 ? 'saldo zerado' : saldo > 0 ? `saldo +${saldo}` : `saldo ${saldo}`,
      tom: sinais.resolvidosHoje > 0 ? 'success' : undefined,
    },
    {
      rotulo: 'Espera mediana',
      valor: horas(sinais.esperaMedianaHoras),
      apoio: `pior ${horas(sinais.esperaPiorHoras)}`,
    },
    {
      rotulo: 'Reabertos 7d',
      valor: String(sinais.reabertos7d),
      apoio:
        sinais.reabertos7d === 0
          ? 'nenhum'
          : `${sinais.reabertos7dEmpresas} empresa${sinais.reabertos7dEmpresas === 1 ? '' : 's'}`,
    },
  ];

  const corDoNumero = (tom?: Sinal['tom']) =>
    tom === 'error'
      ? 'text-sem-error-fg'
      : tom === 'warning'
        ? 'text-sem-warning-fg'
        : tom === 'success'
          ? 'text-sem-success-fg'
          : 'text-foreground';

  return (
    <section
      aria-label="Sinais da operação"
      className="grid grid-cols-2 overflow-hidden rounded-lg bg-card shadow-[var(--shadow-media)] sm:grid-cols-4 xl:grid-cols-7"
    >
      {itens.map((s, i) => (
        <div
          key={s.rotulo}
          className={`px-4 py-3 ${i > 0 ? 'border-l border-border' : ''}`}
          // Filete de 3px no topo em vez de preencher o bloco: a mesma solução
          // da barra da fila. Tinta de distintivo esticada por área grande
          // embarra; no fio ela continua legível.
          style={
            s.tom === 'error'
              ? { boxShadow: 'inset 0 3px 0 0 var(--sem-error-fg)' }
              : s.tom === 'warning'
                ? { boxShadow: 'inset 0 3px 0 0 var(--sem-warning-fg)' }
                : undefined
          }
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {s.rotulo}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className={`text-2xl font-semibold tabular-nums ${corDoNumero(s.tom)}`}>{s.valor}</span>
            <span className="truncate text-[11px] text-muted-foreground">{s.apoio}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
