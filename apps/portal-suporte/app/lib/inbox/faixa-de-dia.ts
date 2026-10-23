const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function dataValida(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function chaveDe(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Dia no fuso do navegador; '' quando a data não lê. */
export function chaveDoDia(iso: string): string {
  const d = dataValida(iso)
  return d ? chaveDe(d) : ''
}

/** "Hoje", "Ontem", "12 de outubro" ou, de outro ano, "12 de outubro de 2025". */
export function rotuloDoDia(iso: string, agora: Date = new Date()): string {
  const d = dataValida(iso)
  if (!d) return ''
  if (chaveDe(d) === chaveDe(agora)) return 'Hoje'
  const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1)
  if (chaveDe(d) === chaveDe(ontem)) return 'Ontem'
  const base = `${d.getDate()} de ${MESES[d.getMonth()]}`
  return d.getFullYear() === agora.getFullYear() ? base : `${base} de ${d.getFullYear()}`
}

/** Data e hora por extenso, para o title do horário da bolha. */
export function dataCompleta(iso: string): string {
  const d = dataValida(iso)
  if (!d) return ''
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}, ${hora}`
}

/** Mensagem que abre um dia novo em relação à anterior (a primeira sempre abre). */
export function abreDiaNovo(iso: string, anteriorIso: string | null): boolean {
  const c = chaveDoDia(iso)
  if (!c) return false
  return anteriorIso === null || chaveDoDia(anteriorIso) !== c
}
