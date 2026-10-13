import type { WAGraph } from './wa-flow-graph'

// ===========================================================================
// Modelos prontos de fluxo (Fluxo v2 entrega 5, 13/10/2026)
//
// Três, não um catálogo: cada um existe porque resolve um caso que a Arara
// realmente tem, e todos usam SÓ os cards que o motor executa de verdade
// (menu, mensagem, condição de horário, handoff). Nenhum modelo usa atraso,
// aleatório, integração ou assistente — eles ainda não são executados, e um
// modelo pronto que não funciona é pior que modelo nenhum.
// ===========================================================================

export interface ModeloDeFluxo {
  id: string
  nome: string
  descricao: string
  graph: WAGraph
}

export const MODELOS_DE_FLUXO: ModeloDeFluxo[] = [
  {
    id: 'menu-por-setor',
    nome: 'Menu por setor',
    descricao: 'Pergunta o assunto e passa a uma pessoa com o contexto já escolhido.',
    graph: {
      root: 'inicio',
      nodes: [
        {
          id: 'inicio', type: 'menu', position: { x: 0, y: 0 },
          data: {
            label: 'Início', text: 'Olá! Para agilizar, qual o assunto?',
            options: [
              { id: 'suporte', label: 'Problema no sistema' },
              { id: 'financeiro', label: 'Financeiro / boleto' },
              { id: 'comercial', label: 'Quero conhecer o sistema' },
            ],
          },
        },
        {
          id: 'suporte', type: 'handoff', position: { x: 320, y: -140 },
          data: { label: 'Suporte', text: 'Nossa equipe já foi avisada e entra em contato em instantes.', area: 'suporte' },
        },
        {
          id: 'financeiro', type: 'handoff', position: { x: 320, y: 0 },
          data: { label: 'Financeiro', text: 'Já avisamos o financeiro, que responde por aqui mesmo.', area: 'administrativo' },
        },
        {
          id: 'comercial', type: 'handoff', position: { x: 320, y: 140 },
          data: { label: 'Comercial', text: 'Que bom! Já chamamos alguém do comercial.', area: 'vendas' },
        },
      ],
      edges: [
        { id: 'e1', source: 'inicio', target: 'suporte', sourceHandle: 'opt:suporte', label: 'Problema no sistema' },
        { id: 'e2', source: 'inicio', target: 'financeiro', sourceHandle: 'opt:financeiro', label: 'Financeiro / boleto' },
        { id: 'e3', source: 'inicio', target: 'comercial', sourceHandle: 'opt:comercial', label: 'Quero conhecer o sistema' },
      ],
    },
  },
  {
    id: 'horario-com-ausencia',
    nome: 'Horário com aviso de ausência',
    descricao:
      'Dentro do expediente, atende. Fora dele, avisa UMA vez por período fechado e diz quando voltamos.',
    graph: {
      root: 'horario',
      nodes: [
        {
          id: 'horario', type: 'condition', position: { x: 0, y: 0 },
          data: { label: 'Está no horário?', text: '', check: 'businessHours' },
        },
        {
          id: 'aberto', type: 'menu', position: { x: 320, y: -120 },
          data: {
            label: 'Atendimento', text: 'Olá! Como podemos ajudar?',
            options: [
              { id: 'ajuda', label: 'Preciso de ajuda com o sistema' },
              { id: 'outro', label: 'Outro assunto' },
            ],
          },
        },
        {
          id: 'pessoa', type: 'handoff', position: { x: 660, y: -120 },
          data: { label: 'Atendente', text: 'Nossa equipe já foi avisada e entra em contato em instantes.', area: 'suporte' },
        },
        {
          id: 'fechado', type: 'content', position: { x: 320, y: 120 },
          // `umaVezPorJanela` é o anti-repetição da entrega 2: cinco mensagens
          // às 23h geram um aviso, não cinco.
          data: {
            label: 'Fora do horário',
            text: 'Oi {{nome}}! Nosso atendimento está fechado agora. Voltamos {{proxima_abertura}} e respondemos assim que abrir.',
            umaVezPorJanela: true,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'horario', target: 'aberto', sourceHandle: 'true', label: 'Sim' },
        { id: 'e2', source: 'horario', target: 'fechado', sourceHandle: 'false', label: 'Não' },
        { id: 'e3', source: 'aberto', target: 'pessoa', sourceHandle: 'opt:ajuda', label: 'Preciso de ajuda com o sistema' },
        { id: 'e4', source: 'aberto', target: 'pessoa', sourceHandle: 'opt:outro', label: 'Outro assunto' },
      ],
    },
  },
  {
    id: 'plantao',
    nome: 'Plantão fora do expediente',
    descricao:
      'Fora do expediente, diz ao cliente que a equipe foi avisada — e é o caminho em que o plantonista recebe WhatsApp.',
    graph: {
      root: 'horario',
      nodes: [
        {
          id: 'horario', type: 'condition', position: { x: 0, y: 0 },
          data: { label: 'Está no horário?', text: '', check: 'businessHours' },
        },
        {
          id: 'aberto', type: 'menu', position: { x: 320, y: -120 },
          data: {
            label: 'Atendimento', text: 'Olá! Como podemos ajudar?',
            options: [{ id: 'falar', label: 'Falar com o suporte' }],
          },
        },
        {
          id: 'dia', type: 'handoff', position: { x: 660, y: -120 },
          data: { label: 'Fila do dia', text: 'Nossa equipe já foi avisada e entra em contato em instantes.', area: 'suporte' },
        },
        {
          id: 'urgencia', type: 'menu', position: { x: 320, y: 120 },
          data: {
            label: 'Fora do horário', text: 'Oi {{nome}}! Estamos fora do horário ({{proxima_abertura}}). É algo que não pode esperar?',
            options: [
              { id: 'urgente', label: 'Sim, o sistema está parado' },
              { id: 'pode_esperar', label: 'Não, pode ser no horário normal' },
            ],
          },
        },
        {
          id: 'plantao', type: 'handoff', position: { x: 660, y: 60 },
          // Este é o card que aciona o aviso ao plantonista: a conversa fica
          // sem dono, e dentro da janela de plantão o motor chama quem está
          // escalado (entrega 3c). Fora da janela, entra na fila e o aviso sai
          // quando o turno começa.
          data: { label: 'Plantão', text: 'Entendi. Já avisamos quem está de plantão — alguém responde em instantes.', area: 'suporte' },
        },
        {
          id: 'amanha', type: 'content', position: { x: 660, y: 200 },
          data: {
            label: 'Fica para o horário', text: 'Combinado! Deixamos registrado e respondemos {{proxima_abertura}}.',
            umaVezPorJanela: true,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'horario', target: 'aberto', sourceHandle: 'true', label: 'Sim' },
        { id: 'e2', source: 'horario', target: 'urgencia', sourceHandle: 'false', label: 'Não' },
        { id: 'e3', source: 'aberto', target: 'dia', sourceHandle: 'opt:falar', label: 'Falar com o suporte' },
        { id: 'e4', source: 'urgencia', target: 'plantao', sourceHandle: 'opt:urgente', label: 'Sim, o sistema está parado' },
        { id: 'e5', source: 'urgencia', target: 'amanha', sourceHandle: 'opt:pode_esperar', label: 'Não, pode ser no horário normal' },
      ],
    },
  },
]
