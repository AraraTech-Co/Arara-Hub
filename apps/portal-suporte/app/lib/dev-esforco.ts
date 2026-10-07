// =============================================================================
// Esforço / prazo ao entrar em "Aguardando Início" (status `backlog`).
//
// Cada opção vira `esforco_entrega` + eventual `previsao_entrega` (sexta 12:00).
// ASAP e indeterminado não têm data; ASAP é urgência sem prazo marcado.
// =============================================================================

export type EsforcoEntrega =
  | 'asap'
  | 'meio_sprint'
  | 'um_sprint'
  | 'dois_sprints'
  | 'indeterminado'

export const ESFORCO_OPCOES: {
  value: EsforcoEntrega
  label: string
  ajuda: string
}[] = [
  { value: 'asap', label: 'ASAP', ajuda: 'O mais cedo possível — sem data; tratado como urgente.' },
  { value: 'meio_sprint', label: '1/2 Sprint', ajuda: 'Sexta desta semana, até o meio-dia.' },
  { value: 'um_sprint', label: '1 Sprint', ajuda: 'Sexta da próxima semana, até o meio-dia.' },
  { value: 'dois_sprints', label: '2 Sprints', ajuda: 'Sexta daqui a 4 semanas, até o meio-dia.' },
  { value: 'indeterminado', label: '4+ Sprints', ajuda: 'Entrega indeterminada — sem data.' },
]

/** Opções ao reestimar atraso — só as que geram data (sem ASAP / 4+). */
export const ESFORCO_REESTIMAR_OPCOES = ESFORCO_OPCOES.filter(
  (o) => o.value === 'meio_sprint' || o.value === 'um_sprint' || o.value === 'dois_sprints',
)

export type EsforcoReestimar = (typeof ESFORCO_REESTIMAR_OPCOES)[number]['value']

const ESFORCO_VALIDO = new Set<string>(ESFORCO_OPCOES.map((o) => o.value))

export function esforcoValido(v: unknown): v is EsforcoEntrega {
  return typeof v === 'string' && ESFORCO_VALIDO.has(v)
}

/** Sexta-feira da semana de `ref`, deslocada `semanasAFrente` semanas, às 12:00 local. */
export function sextaMeioDia(ref: Date = new Date(), semanasAFrente = 0): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  // getDay: 0=dom … 5=sex … 6=sáb. Distância até a sexta desta semana.
  const dia = d.getDay()
  const ateSexta = (5 - dia + 7) % 7
  // Se hoje é sábado (6), "desta semana" já passou: ainda usamos a sexta que
  // acabou (ateSexta=6 → volta 1 dia? (5-6+7)%7 = 6 → avança 6 = sexta QUE VEM).
  // Regra pedida: "sexta desta semana". Dom–sex: sexta corrente; sáb: sexta
  // que passou = ontem. Ajuste: se dia === 6, -1.
  const delta = dia === 6 ? -1 : ateSexta
  d.setDate(d.getDate() + delta + semanasAFrente * 7)
  d.setHours(12, 0, 0, 0)
  return d
}

/** ISO local `YYYY-MM-DDTHH:mm:ss` (sem Z) — o selo de prazo lê a hora. */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * Resolve esforço → previsão. ASAP / indeterminado → null.
 * `meio_sprint` = sexta desta semana; `um_sprint` = +1 semana; `dois_sprints` = +4.
 */
export function previsaoDeEsforco(esforco: EsforcoEntrega, agora: Date = new Date()): string | null {
  if (esforco === 'asap' || esforco === 'indeterminado') return null
  const semanas =
    esforco === 'meio_sprint' ? 0
      : esforco === 'um_sprint' ? 1
        : 4
  return isoLocal(sextaMeioDia(agora, semanas))
}

export function labelEsforco(esforco: EsforcoEntrega | null | undefined): string {
  if (!esforco) return ''
  return ESFORCO_OPCOES.find((o) => o.value === esforco)?.label || esforco
}
