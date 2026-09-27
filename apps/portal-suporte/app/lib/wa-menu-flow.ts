// =============================================================================
// Fluxo de menu do WhatsApp — tipos e o desenho padrão.
//
// Estava em `app/server/services/wa-menu-flow.ts`, junto do backend em Prisma
// que foi removido na varredura de agosto/2026. O conteúdo, porém, nunca foi
// de servidor: são tipos e uma estrutura de dados pura, sem banco e sem
// import nenhum — e quem os usa é o EDITOR DE FLUXO, que roda no navegador
// (`lib/wa-flow-graph.ts` → `_components/wa-flow/*`).
//
// Movido para `lib/` por isso: o editor de fluxo é a única parte de WhatsApp
// que continua de pé, e não podia ficar dependendo de uma pasta morta.
// =============================================================================

// Árvore de menus do atendimento (Opção A — determinístico).
//
// Reproduz o fluxo que rodava no BotConversa (ver
// docs/mapa-fluxo-botconversa-atendimento-claude-testes.md), agora no portal.
// É só DADOS — o motor (wa-menu.service.ts) percorre esta árvore. Editar aqui
// não exige mexer no motor; na Fase 2 do editor visual isto vira a semente do
// grafo no banco.
//
// Tipos de nó:
//   menu     — texto + opções (o cliente escolhe uma → vai para `next`).
//   content  — resposta enlatada; segue para `next`. SEM `next` = encerra o menu
//              (sem escalar) — usado no "resolveu, obrigado".
//   handoff  — escala para um atendente humano e encerra o menu.
// =============================================================================

export interface WAMenuOption {
  /** id estável da opção (vira o RowId da lista interativa e casa a resposta). */
  id: string
  label: string
  description?: string
  /** id do próximo nó. */
  next: string
}

export interface WAMenuNode {
  id: string
  type: 'menu'
  header: string
  text: string
  options: WAMenuOption[]
}
export interface WAContentNode {
  id: string
  type: 'content'
  text: string
  /** Próximo nó. Ausente = encerra o menu sem escalar. */
  next?: string
}
export interface WAHandoffNode {
  id: string
  type: 'handoff'
  text: string
  area: 'suporte' | 'administrativo' | 'vendas'
}

/**
 * Desvia o caminho conforme uma condição avaliada na hora (Fase 4).
 * `businessHours` = dentro do horário de atendimento (usa a config do portal).
 * `hasTicket` = a conversa já tem chamado aberto.
 */
export interface WAConditionNode {
  id: string
  type: 'condition'
  /** Texto só para identificar o card no editor — não é enviado ao cliente. */
  text: string
  check: 'businessHours' | 'hasTicket'
  whenTrue?: string
  whenFalse?: string
}

/**
 * Entrega a conversa ao assistente (Claude) dentro do fluxo — o híbrido.
 * Sai do menu; quem conduz dali em diante é o motor do bot.
 */
export interface WAAssistantNode {
  id: string
  type: 'assistant'
  /** Mensagem de transição enviada antes de o assistente assumir (opcional). */
  text: string
}

/**
 * Espera antes de seguir para o próximo card — o "Atraso" do BotConversa.
 * Serve para a conversa não despejar 3 mensagens de uma vez.
 *
 * O motor agenda um timer em memória E grava `menuResumeAt` na conversa; o cron
 * varre os vencidos. Assim um restart do processo não deixa ninguém pendurado.
 */
export interface WADelayNode {
  id: string
  type: 'delay'
  /** Texto só para identificar o card no editor — não é enviado ao cliente. */
  text: string
  seconds: number
  next?: string
}

/**
 * Divide o caminho entre as saídas — o "Randomizador". Cada saída é uma porta
 * `out:<id>` com um peso; sortear é proporcional ao peso.
 */
export interface WARandomBranch {
  id: string
  label: string
  weight: number
  next: string
}
export interface WARandomNode {
  id: string
  type: 'random'
  text: string
  branches: WARandomBranch[]
}

/**
 * Chama um webhook externo (a "Integração"). POST com os dados da conversa;
 * segue por `onSuccess` ou `onError` conforme a resposta.
 *
 * A URL é configurada por um admin, então o destino é tratado como não confiável:
 * só https e host público (ver wa-webhook.ts) — sem isso o card viraria um SSRF
 * para dentro da rede do VPS.
 */
export interface WAIntegrationNode {
  id: string
  type: 'integration'
  text: string
  url: string
  onSuccess?: string
  onError?: string
}

export type WAFlowNode =
  | WAMenuNode
  | WAContentNode
  | WAHandoffNode
  | WAConditionNode
  | WAAssistantNode
  | WADelayNode
  | WARandomNode
  | WAIntegrationNode

export const WA_MENU_ROOT_ID = 'root'

export const WA_MENU_FLOW: Record<string, WAFlowNode> = {
  // ─── Entrada ───────────────────────────────────────────────────────────────
  root: {
    id: 'root',
    type: 'menu',
    header: 'Atendimento Arara Tech',
    text: 'Olá! Tudo bom com você? Como posso te ajudar hoje?',
    options: [
      { id: 'suporte', label: 'Preciso de suporte técnico', next: 'suporte' },
      { id: 'admin', label: 'Administrativo / Financeiro', next: 'hand_admin' },
      { id: 'vendas', label: 'Vendas', next: 'hand_vendas' },
    ],
  },

  // ─── Suporte: qual assunto ────────────────────────────────────────────────
  suporte: {
    id: 'suporte',
    type: 'menu',
    header: 'Suporte técnico',
    text: 'Certo! Sobre qual assunto é o suporte?',
    options: [
      { id: 'pdv', label: 'Erro no PDV', next: 'sup_pdv' },
      { id: 'buscapreco', label: 'Servidor BuscaPreço', next: 'sup_buscapreco' },
      { id: 'etiquetas', label: 'Sistema de etiquetas', next: 'sup_etiquetas' },
      { id: 'sgi', label: 'SGI / SGC', next: 'sup_sgi' },
      { id: 'instalacao', label: 'Instalação de PDV', next: 'sup_instalacao' },
      { id: 'outro', label: 'Outro assunto', next: 'hand_suporte' },
    ],
  },

  // ─── PDV: os 7 erros do fluxo original ────────────────────────────────────
  sup_pdv: {
    id: 'sup_pdv',
    type: 'menu',
    header: 'Erro no PDV',
    text: 'Para agilizar o atendimento, selecione qual o erro apresentado no PDV:',
    options: [
      { id: 'nfce', label: 'Erro ao emitir cupom fiscal (NFC-e)', next: 'hand_suporte' },
      { id: 'notas', label: 'Erro ao retransmitir notas fiscais', next: 'hand_suporte' },
      { id: 'atualizar', label: 'Erro ao atualizar o PDV', next: 'sol_atualizar' },
      { id: 'login', label: 'Erro ao fazer login do usuário', next: 'hand_suporte' },
      { id: 'caixa', label: 'Erro de abertura/fechamento de caixa', next: 'hand_suporte' },
      { id: 'tributacao', label: 'Erro de tributação', next: 'hand_suporte' },
      { id: 'ncm', label: 'Erro de NCM', next: 'hand_suporte' },
    ],
  },
  sol_atualizar: {
    id: 'sol_atualizar',
    type: 'content',
    text:
      'Nesse caso, basta fazer a atualização completa do sistema:\n\n' +
      '1. Feche o PDV;\n2. Abra novamente;\n3. Na tela inicial, faça uma *atualização completa* do PDV.',
    next: 'resolveu',
  },

  // ─── BuscaPreço ───────────────────────────────────────────────────────────
  sup_buscapreco: {
    id: 'sup_buscapreco',
    type: 'menu',
    header: 'Servidor BuscaPreço',
    text: 'Como posso te ajudar com o servidor BuscaPreço?',
    options: [
      { id: 'terminais', label: 'Está com erro nos terminais', next: 'sol_terminais' },
      { id: 'atualizacao', label: 'Está com erro de atualização', next: 'hand_suporte' },
    ],
  },
  sol_terminais: {
    id: 'sol_terminais',
    type: 'content',
    text:
      'Vamos reiniciar os terminais para sincronizar com o servidor:\n\n' +
      '1. Desligue o terminal;\n2. Desconecte o cabo de rede e o cabo de energia;\n' +
      '3. Após 20 segundos, ligue o terminal novamente.',
    next: 'resolveu',
  },

  // ─── Etiquetas ────────────────────────────────────────────────────────────
  sup_etiquetas: {
    id: 'sup_etiquetas',
    type: 'menu',
    header: 'Sistema de etiquetas',
    text: 'Referente ao sistema de etiquetas, como posso te ajudar?',
    options: [
      { id: 'nao_imprime', label: 'Nenhuma impressora imprime', next: 'hand_suporte' },
      { id: 'invertidas', label: 'Etiquetas saindo invertidas', next: 'hand_suporte' },
    ],
  },

  // ─── SGI / SGC ────────────────────────────────────────────────────────────
  sup_sgi: {
    id: 'sup_sgi',
    type: 'menu',
    header: 'SGI / SGC',
    text: 'Sobre o SGI / SGC, como posso te ajudar?',
    options: [
      { id: 'fiscais', label: 'Relatórios fiscais', next: 'hand_suporte' },
      { id: 'financeiros', label: 'Relatórios financeiros', next: 'hand_suporte' },
      { id: 'fora_do_ar', label: 'Sistema fora do ar', next: 'sol_fora_do_ar' },
    ],
  },
  sol_fora_do_ar: {
    id: 'sol_fora_do_ar',
    type: 'content',
    text:
      'Pedimos desculpas pela indisponibilidade e agradecemos por avisar! Já vamos verificar a ' +
      'situação e retornamos aqui o mais rápido possível.\n\n' +
      'Se puder, envie um print ou foto da tela mostrando o endereço que está fora do ar — ajuda a ' +
      'registrar a ocorrência e agilizar a análise.',
    next: 'hand_suporte',
  },

  // ─── Instalação de PDV ────────────────────────────────────────────────────
  sup_instalacao: {
    id: 'sup_instalacao',
    type: 'menu',
    header: 'Instalação de PDV',
    text:
      'O serviço de Instalação e Configuração de PDV custa *R$ 90,60 por máquina*. ' +
      'Estamos à disposição para agendamento!',
    options: [
      { id: 'agendar', label: 'Autorizo e quero agendar', next: 'hand_instalacao' },
      { id: 'muitos', label: 'São muitos PDVs — falar com Vendas', next: 'hand_vendas' },
    ],
  },

  // ─── Fechamento ───────────────────────────────────────────────────────────
  resolveu: {
    id: 'resolveu',
    type: 'menu',
    header: 'Resolveu?',
    text: 'Tem mais alguma coisa em que eu possa ajudar?',
    options: [
      { id: 'resolvido', label: 'Tudo certo, obrigado!', next: 'fim' },
      { id: 'nao_resolveu', label: 'Ainda não resolveu', next: 'hand_suporte' },
      { id: 'outro_erro', label: 'Tenho outro assunto', next: 'suporte' },
    ],
  },
  fim: {
    id: 'fim',
    type: 'content',
    text: 'Perfeito! Fico à disposição — é só mandar mensagem quando precisar. 🙂',
    // sem `next`: encerra o menu sem escalar
  },

  // ─── Handoffs ─────────────────────────────────────────────────────────────
  hand_suporte: {
    id: 'hand_suporte',
    type: 'handoff',
    area: 'suporte',
    text:
      'Entendi. Já estou te encaminhando para um atendente do suporte, que continua por aqui. ' +
      'Se puder, adianta um print da tela do erro para agilizar. 🙂',
  },
  hand_instalacao: {
    id: 'hand_instalacao',
    type: 'handoff',
    area: 'suporte',
    text: 'Ótimo! Vou te encaminhar para a equipe agendar a instalação. Um atendente continua por aqui.',
  },
  hand_admin: {
    id: 'hand_admin',
    type: 'handoff',
    area: 'administrativo',
    text: 'Certo! Vou te encaminhar para o time Administrativo/Financeiro. Um atendente continua por aqui em instantes.',
  },
  hand_vendas: {
    id: 'hand_vendas',
    type: 'handoff',
    area: 'vendas',
    text: 'Perfeito! Vou te encaminhar para o time de Vendas. Um atendente continua por aqui em instantes.',
  },
}

export function flowNode(id: string | null | undefined): WAFlowNode | null {
  if (!id) return null
  return WA_MENU_FLOW[id] ?? null
}
