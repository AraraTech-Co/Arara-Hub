// =============================================================================
// Kanban Dev — vocabulário do quadro (espelho de leitura das regras do servidor).
//
// A VERDADE mora no servidor (POST /dev/tickets/:id/mover, publicado por
// scripts/kanban-dev-regras.py): transição inválida ou campo faltando é 400 lá,
// com a mensagem dizendo o que falta. Este arquivo existe para a tela oferecer
// os botões certos e pedir os campos certos ANTES do erro — cortesia, não trava.
//
// Decisão 7 do plano (docs/plans/plano-kanban-dev-portal-suporte.md): 10 status
// em dado, colunas em menor número na tela — transitórios viravam marcador no
// card, dentro da coluna vizinha. `descartado` fica atrás de filtro.
//
// REVISADO em 01/09/2026, a pedido do Leonardo: `teste_aprovado` ganhou coluna
// própria. O motivo é que ele não é transitório na prática — um card aprovado
// pode esperar dias pela aplicação no cliente, e como marcador dentro de "Em
// Testes" essa fila ficava invisível: quem olhava o quadro via "em teste" onde
// já não havia teste nenhum. `desenvolvimento_finalizado` e `teste_reprovado`
// seguem como marcador, que ali a decisão continua valendo — os dois duram
// minutos e voltam para a mesma mesa.
//
// REVISADO em 14/09/2026 (documentação de melhorias do Cristiano, item 2.6):
// `teste_reprovado` também ganhou coluna própria. Como marcador dentro de "Em
// Desenvolvimento" a reprovação sumia no meio do trabalho novo, e o documento
// pede que ela seja formal e rastreável: ao reprovar, o QA registra motivo,
// comportamento encontrado e esperado. E "Em Revisão" deixou de ser
// obrigatória — Dev Finalizado pode ir direto para Pronto para Teste.
//
// REVISADO em 25/09/2026: coluna Em Revisão removida (redundante com Dev
// Finalizado). Entrar em Pronto para Teste exige escolher o servidor HML;
// o servidor fica ocupado enquanto o card estiver em Pronto p/ Teste ou Em Testes.
// =============================================================================

export type DevStatus =
  | 'no_status'
  | 'backlog'
  | 'em_desenvolvimento'
  | 'desenvolvimento_finalizado'
  | 'pronto_para_teste'
  | 'em_testes'
  | 'teste_reprovado'
  | 'teste_aprovado'
  | 'aplicado_no_cliente'
  | 'descartado'

export const DEV_LABELS: Record<DevStatus, string> = {
  // IDs estáveis; labels mudaram em 15/09/2026: 1ª coluna = Backlog (triagem),
  // 2ª = Aguardando Início (pronto para puxar, com esforço/prazo definido).
  no_status: 'Backlog',
  backlog: 'Aguardando Início',
  em_desenvolvimento: 'Em Desenvolvimento',
  desenvolvimento_finalizado: 'Dev Finalizado',
  pronto_para_teste: 'Pronto para Teste',
  em_testes: 'Em Testes',
  teste_reprovado: 'Teste Reprovado',
  teste_aprovado: 'Teste Aprovado',
  aplicado_no_cliente: 'Aplicado no Cliente',
  descartado: 'Descartado',
}

/** Colunas da tela; os transitórios restantes agrupam na coluna que os contém. */
export const DEV_COLUNAS: { id: string; titulo: string; statuses: DevStatus[] }[] = [
  { id: 'no_status', titulo: 'Backlog', statuses: ['no_status'] },
  { id: 'backlog', titulo: 'Aguardando Início', statuses: ['backlog'] },
  { id: 'em_desenvolvimento', titulo: 'Em Desenvolvimento', statuses: ['em_desenvolvimento'] },
  { id: 'dev_finalizado', titulo: 'Dev Finalizado', statuses: ['desenvolvimento_finalizado'] },
  { id: 'pronto_para_teste', titulo: 'Pronto p/ Teste', statuses: ['pronto_para_teste'] },
  { id: 'em_testes', titulo: 'Em Testes', statuses: ['em_testes'] },
  // Reprovado espera o dev ler o que falhou e puxar de volta — visível, não
  // escondido dentro da coluna de trabalho.
  { id: 'teste_reprovado', titulo: 'Teste Reprovado', statuses: ['teste_reprovado'] },
  // Fila de espera pela aplicação no cliente. Aprovado NÃO é o fim: o card
  // ainda precisa ir para o cliente, e essa espera é trabalho de alguém.
  { id: 'teste_aprovado', titulo: 'Teste Aprovado', statuses: ['teste_aprovado'] },
  { id: 'aplicado', titulo: 'Aplicado no Cliente', statuses: ['aplicado_no_cliente'] },
]

/** Marcador exibido no card quando o status é transitório dentro da coluna. */
// Vazio desde que `teste_reprovado` ganhou coluna (14/09/2026). Mantido: é o
// lugar certo se outro status transitório voltar a morar dentro de coluna.
export const DEV_MARCADOR: Partial<Record<DevStatus, { texto: string; classe: string }>> = {}

/** Espelho das transições do servidor — para a tela só oferecer o possível. */
export const DEV_TRANSICOES: Record<DevStatus, DevStatus[]> = {
  no_status: ['backlog', 'descartado'],
  backlog: ['em_desenvolvimento', 'descartado'],
  em_desenvolvimento: ['desenvolvimento_finalizado', 'descartado'],
  desenvolvimento_finalizado: ['pronto_para_teste', 'em_desenvolvimento'],
  pronto_para_teste: ['em_testes', 'em_desenvolvimento'],
  em_testes: ['teste_aprovado', 'teste_reprovado'],
  teste_reprovado: ['em_desenvolvimento'],
  teste_aprovado: ['aplicado_no_cliente'],
  aplicado_no_cliente: [],
  descartado: [],
}

/** O que cada transição pede — a tela abre o diálogo certo; o servidor confere. */
export const DEV_EXIGE: Partial<Record<DevStatus, {
  declaracao?: string
  motivo?: boolean
  versao?: boolean
  qa?: boolean
  responsavel?: boolean
  revisor?: boolean
  linkGithub?: boolean
  /** Servidor HML onde o código foi publicado para teste. */
  servidorHml?: boolean
  /** Reprovação estruturada: motivo, encontrado e esperado obrigatórios. */
  reprovacao?: boolean
  /** Ao entrar em Aguardando Início: ASAP | ½ | 1 | 2 | 4+ sprints. */
  esforco?: boolean
}>> = {
  // Triagem completa: card pronto para puxar — define esforço/prazo da sprint.
  backlog: { esforco: true },
  // Quadro é de PUXAR trabalho: quem move assume, salvo escolha explícita.
  em_desenvolvimento: { responsavel: true },
  // O link do PR entra ao finalizar o desenvolvimento — é o artefato da entrega,
  // não um campo da fila de revisão.
  desenvolvimento_finalizado: {
    declaracao: 'Declaro que o código está versionado, as alterações identificadas e os critérios de aceite atendidos.',
    linkGithub: true,
  },
  // A versão NÃO é exigida aqui (quem faz deploy controla o número). Exige-se
  // o servidor HML onde o build foi publicado — e esse servidor fica ocupado
  // enquanto o card estiver em Pronto p/ Teste ou Em Testes.
  pronto_para_teste: { servidorHml: true },
  teste_aprovado: { qa: true, declaracao: 'Declaro que os cenários e critérios de aceite foram validados.' },
  teste_reprovado: { qa: true, reprovacao: true },
  aplicado_no_cliente: { versao: true },
  descartado: { motivo: true },
}

/** Número exibido no quadro Dev — usa `dev_ticket_number` real quando existir. */
export type CardNumeroDev = {
  ticket_number?: string | null
  dev_ticket_number?: string | null
  devTicketNumber?: string | null
}

export function numeroDevDoCard(card: CardNumeroDev): string {
  return numeroDev(
    card.ticket_number,
    card.dev_ticket_number ?? card.devTicketNumber,
  )
}

export function numeroDev(
  ticketNumber: string | null | undefined,
  devTicketNumber?: string | null,
): string {
  const dev = String(devTicketNumber || '').trim()
  if (dev) return dev
  const n = String(ticketNumber || '').trim()
  if (n.startsWith('DEV-')) return n
  const m = n.match(/(\d+)\s*$/)
  return m ? `DEV-${String(parseInt(m[1], 10)).padStart(5, '0')}` : n || 'DEV-?'
}
