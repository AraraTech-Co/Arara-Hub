/** Funil do prospect: listas e rótulos (os valores gravados batem com o servidor). */

export const ETAPAS = [
  { value: 'mapeado', label: 'Mapeado' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'em_cadencia', label: 'Em cadência' },
  { value: 'respondeu', label: 'Respondeu' },
  { value: 'descoberta', label: 'Descoberta' },
  { value: 'demo', label: 'Demo' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'ganho', label: 'Ganho' },
  { value: 'perdido', label: 'Perdido' },
  { value: 'sem_resposta', label: 'Sem resposta' },
] as const

export const TOQUES = ['T1', 'T2', 'T3'] as const

export const MOTIVOS_PERDA = [
  { value: 'preco', label: 'Preço' },
  { value: 'timing', label: 'Timing' },
  { value: 'ja_tem_sistema', label: 'Já tem sistema' },
  { value: 'nao_e_decisor', label: 'Não é o decisor' },
  { value: 'sem_dor', label: 'Sem dor' },
  { value: 'canal_errado', label: 'Canal errado' },
  { value: 'mensagem_fraca', label: 'Mensagem fraca' },
  { value: 'dados_errados', label: 'Dados errados' },
] as const

/** Sem etapa gravada conta como Mapeado. */
export function etapaDe(c: Record<string, unknown> | null | undefined): string {
  const e = c?.etapa
  return typeof e === 'string' && ETAPAS.some((x) => x.value === e) ? e : 'mapeado'
}

export function rotuloEtapa(c: Record<string, unknown> | null | undefined): string {
  const e = etapaDe(c)
  const base = ETAPAS.find((x) => x.value === e)!.label
  if (e === 'em_cadencia' && typeof c?.toque === 'string') return `${base} (${c.toque})`
  if (e === 'perdido') {
    const m = MOTIVOS_PERDA.find((x) => x.value === c?.motivoPerda)
    if (m) return `${base}: ${m.label}`
  }
  return base
}
