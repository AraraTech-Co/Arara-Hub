// =============================================================================
// Normalizar número para o WhatsApp (Fase 2, 14/10/2026)
//
// Até aqui esta regra existia SÓ no servidor, espalhada em duas funções do
// bloco do inbound: o prefixo 55 em uma, as variantes do nono dígito dentro da
// função de envio. O documento de handoff dizia que ela estava neste arquivo —
// não estava; aqui só havia formatação para exibição.
//
// Agora está nos dois lados, e por isso há um teste que compara as duas
// implementações sobre a mesma tabela de números
// (scripts/testes-handlers/nova-conversa.test.js). É a única gêmea do projeto
// que dá para comparar de verdade: o teste roda em Node, que importa `.ts`
// direto, então as duas rodam no mesmo processo.
//
// POR QUE EM ARQUIVO PRÓPRIO, e não em `wa-contato.ts`: aquele arquivo importa
// `@/lib/utils`, que importa `clsx` e `tailwind-merge`. Para o teste importar a
// função de lá, eu precisaria substituir três módulos por stubs — e um teste
// que precisa de stub para alcançar a função testa menos do que parece. Aqui
// não há import nenhum: o teste carrega o arquivo de verdade.
//
// Por que variantes, e não um número só: o WhatsApp brasileiro tem celular com
// e sem o nono dígito, e o mesmo contato pode estar gravado de um jeito e
// atender pelo outro. Quem envia tenta as duas; quem PROCURA conversa existente
// tem de procurar as duas, senão cria conversa duplicada — que é o defeito que
// a união de duplicatas existe para remendar.
// =============================================================================

export interface TelefoneNormalizado {
  /** Dígitos com o 55 na frente, na forma que o provedor espera. */
  digitos: string
  /** `<digitos>@s.whatsapp.net` — o jid que a conversa guarda. */
  jid: string
  /**
   * As formas em que este número pode estar gravado: a dele e a do nono dígito
   * ao contrário. SEMPRE procure conversa existente por todas.
   */
  variantes: string[]
}

export type RecusaDeTelefone =
  | 'vazio'
  | 'curto'
  | 'longo'
  | 'grupo'
  | 'sem-telefone'

export const MOTIVO_DA_RECUSA: Record<RecusaDeTelefone, string> = {
  vazio: 'Digite o número com DDD.',
  curto: 'Número curto demais. Use DDD + número, com 10 ou 11 dígitos.',
  longo: 'Número comprido demais para um telefone.',
  grupo: 'Este é um identificador de grupo. Grupos não podem ser iniciados pelo portal.',
  'sem-telefone': 'Este é um identificador interno do WhatsApp (LID), não um telefone.',
}

/**
 * Normaliza o que a pessoa digitou. Devolve `{ ok: false, motivo }` em vez de
 * lançar: quem chama mostra o texto na tela, e número inválido é o caso comum,
 * não exceção.
 */
export function normalizarTelefoneWhatsapp(
  bruto: string | null | undefined,
): { ok: true; valor: TelefoneNormalizado } | { ok: false; motivo: RecusaDeTelefone } {
  const cru = String(bruto ?? '').trim()
  if (!cru) return { ok: false, motivo: 'vazio' }
  if (/@g\.us$/i.test(cru)) return { ok: false, motivo: 'grupo' }
  if (/@lid$/i.test(cru)) return { ok: false, motivo: 'sem-telefone' }

  const d = cru.replace(/\D/g, '')
  if (!d) return { ok: false, motivo: 'vazio' }
  // Mesma régua do servidor: menos de 10 dígitos não é telefone brasileiro
  // com DDD, e 10/11 ganham o 55.
  if (d.length < 10) return { ok: false, motivo: 'curto' }
  const comPais = d.length === 10 || d.length === 11 ? `55${d}` : d
  // 13 é o máximo de um celular brasileiro (55 + DDD + 9 dígitos). Acima disso
  // é LID disfarçado de número — o mesmo critério de `ehSemTelefone`.
  if (comPais.length > 13) return { ok: false, motivo: 'longo' }
  if (comPais.length < 12) return { ok: false, motivo: 'curto' }

  return {
    ok: true,
    valor: {
      digitos: comPais,
      jid: `${comPais}@s.whatsapp.net`,
      variantes: variantesDoNonoDigito(comPais),
    },
  }
}

/**
 * O número e a forma dele com o nono dígito ao contrário.
 *
 * Espelha `_mandarPara` do bloco 485: 13 dígitos → tira o quinto (o nono do
 * celular); 12 → põe um 9 ali. A ordem importa: o primeiro é o que a pessoa
 * digitou, e é por ele que o envio começa.
 */
export function variantesDoNonoDigito(digitos: string): string[] {
  const d = String(digitos ?? '').replace(/\D/g, '')
  if (d.length === 13) return [d, d.slice(0, 4) + d.slice(5)]
  if (d.length === 12) return [d, `${d.slice(0, 4)}9${d.slice(4)}`]
  return d ? [d] : []
}
