// =============================================================================
// A régua do Gantt — conversão entre data de calendário e pixel.
//
// TODA conversão de data de planejamento passa por aqui. `new Date(texto)`
// espalhado pela tela é onde o prazo de 27/08 vira 26/08: o navegador lê
// "2026-08-27" como meia-noite UTC e mostra no fuso local. Por isso o miolo
// deste módulo é um NÚMERO DE DIA inteiro (dias desde 1970 em UTC), e não um
// instante — dia não tem hora, e somar 24h não é somar um dia quando existe
// horário de verão.
//
// Formatação para leitura (dataBR, duracaoBR) fica em `@/lib/projetos`.
// =============================================================================

const MS_DIA = 86400000

/** "2026-08-27" → número de dia inteiro. Retorna null para entrada inválida. */
export function diaDe(data: unknown): number | null {
  const s = String(data || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [a, m, d] = s.split('-').map(Number)
  return Math.round(Date.UTC(a, m - 1, d) / MS_DIA)
}

/** O caminho de volta. */
export function dataDoDia(dia: number): string {
  return new Date(dia * MS_DIA).toISOString().slice(0, 10)
}

export function hojeDia(): number {
  const d = new Date()
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_DIA)
}

/** 0 = domingo. */
export function diaDaSemana(dia: number): number {
  return new Date(dia * MS_DIA).getUTCDay()
}

export function fimDeSemana(dia: number): boolean {
  const s = diaDaSemana(dia)
  return s === 0 || s === 6
}

export type Escala = 'dia' | 'semana' | 'mes'

/**
 * Largura de um dia em cada escala. Na escala de mês um dia tem 4px: a barra
 * fica pequena de propósito, porque ali a pergunta é "cabe no trimestre?", não
 * "começa na terça?".
 */
export const PX_POR_DIA: Record<Escala, number> = { dia: 36, semana: 14, mes: 4 }

export const ESCALA_LABELS: Record<Escala, string> = {
  dia: 'Dia',
  semana: 'Semana',
  mes: 'Mês',
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export type Marca = { dia: number; label: string; forte?: boolean }

/**
 * As marcas da régua. Na escala de dia sai um traço por dia; na de semana, um
 * por segunda-feira; na de mês, um por primeiro dia do mês — desenhar 400
 * traços numa régua de 4px por dia seria papel de parede, não informação.
 */
export function marcasDaRegua(inicio: number, fim: number, escala: Escala): Marca[] {
  const out: Marca[] = []
  for (let d = inicio; d <= fim; d++) {
    const data = new Date(d * MS_DIA)
    if (escala === 'dia') {
      out.push({ dia: d, label: String(data.getUTCDate()), forte: data.getUTCDate() === 1 })
    } else if (escala === 'semana') {
      if (data.getUTCDay() !== 1) continue
      out.push({ dia: d, label: `${data.getUTCDate()}/${MESES[data.getUTCMonth()]}` })
    } else {
      if (data.getUTCDate() !== 1) continue
      out.push({ dia: d, label: `${MESES[data.getUTCMonth()]}/${String(data.getUTCFullYear()).slice(2)}`, forte: true })
    }
  }
  return out
}

/** Faixa de meses no alto da régua. */
export function faixasDeMes(inicio: number, fim: number): { dia: number; dias: number; label: string }[] {
  const out: { dia: number; dias: number; label: string }[] = []
  let atual: { dia: number; dias: number; label: string } | null = null
  for (let d = inicio; d <= fim; d++) {
    const data = new Date(d * MS_DIA)
    const label = `${MESES[data.getUTCMonth()]} de ${data.getUTCFullYear()}`
    if (!atual || atual.label !== label) {
      atual = { dia: d, dias: 0, label }
      out.push(atual)
    }
    atual.dias++
  }
  return out
}

export function letraDaSemana(dia: number): string {
  return SEMANA[diaDaSemana(dia)]
}

/**
 * A janela que a régua precisa cobrir. Sempre inclui HOJE: um cronograma que
 * não mostra o dia de hoje não responde à única pergunta que todo mundo faz ao
 * abrir a tela.
 */
export function janela(datas: unknown[], folgaDias = 3): { inicio: number; fim: number } {
  const dias = datas.map(diaDe).filter((d): d is number => d !== null)
  const hoje = hojeDia()
  if (!dias.length) return { inicio: hoje - 7, fim: hoje + 21 }
  const inicio = Math.min(...dias, hoje) - folgaDias
  const fim = Math.max(...dias, hoje) + folgaDias
  // Uma janela curta demais espreme tudo num canto; 14 dias é o mínimo legível.
  return fim - inicio < 14 ? { inicio, fim: inicio + 14 } : { inicio, fim }
}
