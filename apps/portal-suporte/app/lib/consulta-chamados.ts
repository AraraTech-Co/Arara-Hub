// =============================================================================
// Interpreta uma pergunta escrita em português e devolve o que filtrar.
//
// AVISO IMPORTANTE, para ninguém se enganar lendo isto depois: NÃO é modelo de
// linguagem. A rota `/ai/chat` da plataforma existe mas é um stub que devolve
// 501, não há chave de LLM no cofre do app, e a saída de rede da sandbox é uma
// allowlist que hoje só tem o provedor de WhatsApp. Enquanto isso não mudar,
// qualquer coisa aqui que se chamasse "IA" seria encenação — foi exatamente o
// pecado do botão original, que fazia `.includes()` num array fixo e exibia um
// spinner falso de 300ms para parecer que consultava algo.
//
// O que isto faz de verdade: reconhece na frase os nomes que EXISTEM nos dados
// (empresas cadastradas, pessoas, status, período) e monta o filtro. Acerta as
// perguntas reais do atendimento — "chamados abertos da Casa & Lar",
// "o que o Hefler tem em aberto", "pendências do Shopping Util essa semana" —
// e, quando não reconhece nada, diz que não reconheceu em vez de inventar.
//
// Trocar isto por um LLM depois não muda a tela: o contrato de saída
// (`Interpretacao`) continua o mesmo.
// =============================================================================

import { chaveEmpresa, resolver, type EmpresaBruta, type IndiceEmpresas } from './empresas'
import { STATUS_LABELS } from './ticket-status'

export type Interpretacao = {
  empresa: string | null
  responsavel: string | null
  solicitante: string | null
  /** Lista de status; vazio = qualquer um. */
  status: string[]
  /** Só os que não têm responsável. */
  semResponsavel: boolean
  /** Recorte de tempo, em dias para trás a partir de hoje. */
  desdeDias: number | null
  /** Trechos da frase que viraram filtro — para explicar o que foi entendido. */
  entendido: string[]
  /** O que sobrou sem reconhecer, usado como busca textual no título. */
  texto: string
}

/** "aberto" no vocabulário do suporte é tudo que ainda não terminou. */
const EM_ABERTO = [
  'novos_chamados',
  'triagem',
  'em_atendimento',
  'pendencia_suporte',
  'pendencia_dev',
  'aguardando_cliente',
  'em_teste',
]
const RESOLVIDOS = ['resolvido', 'resolvido_com_manual', 'resolvido_sem_manual']
const PENDENCIAS = ['pendencia_suporte', 'pendencia_dev', 'aguardando_cliente']

/** Sinônimos que o time usa falando, mapeados para status reais. */
const APELIDOS_STATUS: Array<[RegExp, string[], string]> = [
  [/\b(em\s+)?abert[oa]s?\b|\bpendente?s?\b(?!\s+de)|\bativ[oa]s?\b/i, EM_ABERTO, 'em aberto'],
  [/\bresolvid[oa]s?\b/i, RESOLVIDOS, 'resolvidos'],
  [/\bfechad[oa]s?\b|\bencerrad[oa]s?\b/i, ['fechado'], 'fechados'],
  [/\bpend[êe]ncias?\b/i, PENDENCIAS, 'em pendência'],
  [/\bem\s+atendimento\b/i, ['em_atendimento'], 'em atendimento'],
  [/\btriagem\b/i, ['triagem'], 'em triagem'],
  [/\bbacklog\b|\bnovos?\b/i, ['novos_chamados'], 'no backlog'],
  [/\bteste\b|\bhomologa[çc][ãa]o\b/i, ['em_teste'], 'em teste'],
  [/\bcancelad[oa]s?\b/i, ['cancelado'], 'cancelados'],
]

const PERIODOS: Array<[RegExp, number, string]> = [
  [/\bhoje\b/i, 1, 'hoje'],
  [/\bontem\b/i, 2, 'desde ontem'],
  [/\b(essa|esta|nesta)\s+semana\b|\b[úu]ltimos?\s+7\s+dias\b/i, 7, 'nos últimos 7 dias'],
  [/\b(esse|este|neste)\s+m[êe]s\b|\b[úu]ltimos?\s+30\s+dias\b/i, 30, 'nos últimos 30 dias'],
]

/** Remove o trecho reconhecido para ele não virar busca textual depois. */
function tirar(frase: string, re: RegExp): string {
  return frase.replace(re, ' ')
}

export type PessoaConhecida = { nome: string }

/**
 * @param empresas  cadastro real — só ele vira filtro de empresa
 * @param pessoas   nomes que aparecem como responsável nos chamados
 * @param quemAbriu nomes que aparecem como solicitante
 */
export function interpretar(
  pergunta: string,
  empresas: EmpresaBruta[],
  indice: IndiceEmpresas,
  pessoas: string[],
  quemAbriu: string[],
): Interpretacao {
  let resto = ` ${pergunta} `
  const entendido: string[] = []

  const r: Interpretacao = {
    empresa: null,
    responsavel: null,
    solicitante: null,
    status: [],
    semResponsavel: false,
    desdeDias: null,
    entendido,
    texto: '',
  }

  // ── Empresa ────────────────────────────────────────────────────────────────
  // Casa pela chave normalizada, então "casa e lar", "Casa & Lar" e
  // "casaelar" chegam no mesmo lugar. Vence o nome mais longo: senão
  // "Shopping" casaria antes de "Shopping da Utilidade - Americana".
  const chaveFrase = chaveEmpresa(resto)
  const candidatas = empresas
    .map((c) => ({ c, k: chaveEmpresa(c.name) }))
    .filter(({ k }) => k.length >= 4 && chaveFrase.includes(k))
    .sort((a, b) => b.k.length - a.k.length)
  // Nome parcial ("Shopping Util") só vira filtro quando aponta para UMA
  // cadastrada. Havendo mais de uma — e há quatro "Shopping da Utilidade —" —
  // escolher a primeira responderia sobre a loja errada com ar de certeza; aí
  // é melhor deixar o trecho virar busca no título.
  if (!candidatas.length) {
    const parciais = empresas.filter((c) => {
      const k = chaveEmpresa(c.name)
      return k.length >= 4 && chaveFrase.length >= 6 && k.startsWith(chaveFrase.slice(0, Math.min(k.length, chaveFrase.length)))
    })
    if (parciais.length === 1) candidatas.push({ c: parciais[0], k: chaveEmpresa(parciais[0].name) })
  }
  if (candidatas.length) {
    r.empresa = candidatas[0].c.name
    entendido.push(`empresa ${candidatas[0].c.name}`)
    // Tira da frase a sequência de palavras que formou o nome.
    for (const palavra of candidatas[0].c.name.split(/\s+/)) {
      if (chaveEmpresa(palavra).length >= 3) {
        resto = tirar(resto, new RegExp(`\\b${palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'))
      }
    }
  }

  // ── Sem responsável ────────────────────────────────────────────────────────
  const semDono = /\bsem\s+(respons[áa]vel|dono|atendente)\b|\bn[ãa]o\s+atribu[íi]d[oa]s?\b/i
  if (semDono.test(resto)) {
    r.semResponsavel = true
    entendido.push('sem responsável')
    resto = tirar(resto, semDono)
  }

  // ── Pessoas ────────────────────────────────────────────────────────────────
  // "abertos por X" / "que o X abriu" aponta solicitante; o resto, responsável.
  // Sem essa distinção, perguntar "o que a Rayssa abriu" devolveria o que ela
  // atende, que é outra lista.
  const achaPessoa = (lista: string[]): string | null => {
    const alvo = chaveEmpresa(resto)
    const achados = lista
      .map((n) => ({ n, k: chaveEmpresa(n) }))
      // Nome inteiro OU primeiro nome: no dia a dia ninguém escreve o sobrenome.
      .flatMap(({ n, k }) => {
        const primeiro = chaveEmpresa(n.split(/\s+/)[0] ?? '')
        return [
          { n, k },
          ...(primeiro.length >= 4 && primeiro !== k ? [{ n, k: primeiro }] : []),
        ]
      })
      .filter(({ k }) => k.length >= 4 && alvo.includes(k))
      .sort((a, b) => b.k.length - a.k.length)
    return achados[0]?.n ?? null
  }

  const marcaSolicitante = /\b(abert[oa]s?\s+(por|pel[oa])|quem\s+abriu|abriu|solicitad[oa]s?\s+por|solicitante)\b/i
  if (marcaSolicitante.test(resto)) {
    const p = achaPessoa(quemAbriu)
    if (p) {
      r.solicitante = p
      entendido.push(`aberto por ${p}`)
      resto = tirar(resto, new RegExp(p.split(/\s+/)[0], 'ig'))
    }
    resto = tirar(resto, marcaSolicitante)
  }
  if (!r.semResponsavel) {
    const p = achaPessoa(pessoas)
    if (p) {
      r.responsavel = p
      entendido.push(`responsável ${p}`)
      resto = tirar(resto, new RegExp(p.split(/\s+/)[0], 'ig'))
    }
  }

  // ── Status ─────────────────────────────────────────────────────────────────
  for (const [re, alvos, rotulo] of APELIDOS_STATUS) {
    if (re.test(resto)) {
      r.status = alvos
      entendido.push(rotulo)
      resto = tirar(resto, re)
      break
    }
  }
  // Nome exato do status ("Teste e Homologação") também vale.
  if (!r.status.length) {
    for (const [chave, rotulo] of Object.entries(STATUS_LABELS)) {
      if (chaveEmpresa(resto).includes(chaveEmpresa(rotulo)) && chaveEmpresa(rotulo).length >= 5) {
        r.status = [chave]
        entendido.push(rotulo.toLowerCase())
        break
      }
    }
  }

  // ── Período ────────────────────────────────────────────────────────────────
  for (const [re, dias, rotulo] of PERIODOS) {
    if (re.test(resto)) {
      r.desdeDias = dias
      entendido.push(rotulo)
      resto = tirar(resto, re)
      break
    }
  }
  const nDias = resto.match(/\b[úu]ltimos?\s+(\d{1,3})\s+dias?\b/i)
  if (!r.desdeDias && nDias) {
    r.desdeDias = Number(nDias[1])
    entendido.push(`nos últimos ${nDias[1]} dias`)
    resto = tirar(resto, /\b[úu]ltimos?\s+\d{1,3}\s+dias?\b/i)
  }

  // ── Sobra ──────────────────────────────────────────────────────────────────
  // Palavras de ligação não são busca: sem tirá-las, "chamados da" viraria
  // filtro de texto e zeraria o resultado.
  // Palavra por palavra, e não regex sobre a frase inteira: com `\b`, o "e" de
  // "NFC-e" é uma palavra isolada (o hífen é fronteira) e virava "NFC-",
  // que não casa com nada. Descartar token inteiro preserva o termo técnico.
  const RUIDO = new Set(
    ('chamado chamados ticket tickets todo todos toda todas tudo quais quantos quantas mostra mostrar ' +
      'liste listar ver traz trazer me meu minha do da de dos das no na nos nas em com para pra por ' +
      'e o a os as um uma que estao está esta tem ha ainda agora lista historico situacao ai')
      .split(' ')
      .map((p) => chaveEmpresa(p)),
  )
  r.texto = resto
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p && !RUIDO.has(chaveEmpresa(p)))
    .join(' ')
    .trim()
  if (r.texto.length < 3) r.texto = ''
  else entendido.push(`texto "${r.texto}"`)

  return r
}

/** Reconhece a empresa de um chamado — reexportado para a tela não importar dois módulos. */
export { resolver as resolverEmpresa }
