// ===========================================================================
// A sequência do plantão: a conta que diz de quem é cada dia.
//
// A equipe não escolhe dia a dia — segue um giro: um fica na segunda, outro na
// terça, outro na quarta, e assim até o fim do mês, com troca pontual quando
// alguém precisa. Plantão e backup técnico giram SEPARADOS, cada um com a sua
// lista e a sua âncora. Fim de semana conta como dia normal (decisão do
// Leonardo, 14/10/2026): a janela de plantão cobre os sete dias.
//
// Nada daqui é gravado: a sequência vive na tela, e o que o servidor guarda
// continua sendo um registro por dia, como sempre foi. É o que mantém esta
// entrega fora do caminho que decide quem é acordado de madrugada.
//
// Sem import de valor de propósito: assim o teste carrega este arquivo com
// `node` puro, sem React e sem build.
// ===========================================================================

/** Uma fila de pessoas e o dia em que o primeiro da fila entra. */
export interface SequenciaDePlantao {
  /** Ids de pessoas, na ordem de entrada. */
  ordem: string[]
  /** AAAA-MM-DD: o dia da posição 0. */
  ancora: string
}

const UM_DIA = 86400000

/** AAAA-MM-DD → instante UTC do começo do dia, ou null se não for um dia que existe. */
export function instanteDoDia(data: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return null
  const t = new Date(data + 'T00:00:00Z').getTime()
  if (!isFinite(t)) return null
  // `new Date` normaliza 2026-02-31 para 03/03: se a volta não bate, o dia não existe.
  return new Date(t).toISOString().slice(0, 10) === data ? t : null
}

/** Instante → AAAA-MM-DD. */
export function diaDoInstante(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

/** Dias cheios entre dois dias; negativo quando `data` vem antes da âncora. */
export function diasEntre(de: string, ate: string): number | null {
  const a = instanteDoDia(de)
  const b = instanteDoDia(ate)
  if (a === null || b === null) return null
  return Math.round((b - a) / UM_DIA)
}

/**
 * De quem é o dia, pela sequência.
 *
 * A posição é o resto da divisão dos dias desde a âncora pelo tamanho da fila.
 * O resto é ajustado para ser positivo: a sequência também vale para trás, e um
 * dia antes da âncora não pode cair numa posição negativa.
 */
export function pessoaDoDia(seq: SequenciaDePlantao, data: string): string | null {
  const n = seq.ordem.length
  if (!n) return null
  const d = diasEntre(seq.ancora, data)
  if (d === null) return null
  return seq.ordem[((d % n) + n) % n] || null
}

/**
 * Coluna do dia numa grade que começa na segunda: 0 = segunda, 6 = domingo.
 *
 * É a conta que alinha o mês no calendário. Errar um dia aqui desloca TODOS os
 * nomes uma coluna, e ninguém percebe olhando — por isso ela mora aqui, com
 * teste, e não dentro da tela.
 */
export function colunaDaSemana(data: string): number | null {
  const t = instanteDoDia(data)
  if (t === null) return null
  return (new Date(t).getUTCDay() + 6) % 7
}

/** Todos os dias do mês a que `data` pertence, em ordem. */
export function diasDoMes(data: string): string[] {
  const t = instanteDoDia(data)
  if (t === null) return []
  const d = new Date(t)
  const ano = d.getUTCFullYear()
  const mes = d.getUTCMonth()
  const dias: string[] = []
  for (let i = 1; i <= 31; i++) {
    const atual = new Date(Date.UTC(ano, mes, i))
    if (atual.getUTCMonth() !== mes) break
    dias.push(diaDoInstante(atual.getTime()))
  }
  return dias
}

/** Um dia já lançado, do jeito que a tela recebe do servidor. */
export interface DiaLancado {
  date: string
  agent_ids: string[]
  backup_ids: string[]
}

export interface Deducao {
  /** A fila deduzida; pode ter buraco se os dias lançados não cobrirem todas as posições. */
  sequencia: SequenciaDePlantao
  /**
   * Verdadeiro só quando os dias lançados SUSTENTAM o giro: sem buraco na
   * fila, sem dia que a contrarie, com alguma repetição e — o que faltava —
   * com os dias SEGUIDOS, do primeiro ao último.
   *
   * Sem a contiguidade, dois dias da mesma pessoa com três dias vazios entre
   * eles "confirmavam" um giro de 1, e a tela dizia em verde que conferia.
   * É a assinatura de um giro de 4 visto só pelos dias de uma pessoa: os dias
   * que ninguém lançou não sustentam nada.
   */
  confirmado: boolean
  /** Há dia sem lançar entre o primeiro e o último usado. */
  temVao: boolean
  /** Dias com uma pessoa que serviram para deduzir. */
  diasUsados: number
  /** Dias ignorados por não ter exatamente uma pessoa. */
  diasIgnorados: number
  /** Primeiro dia que contraria a fila deduzida, se houver. */
  quebrouEm: string | null
  /** Posições da fila que nenhum dia lançado preencheu. */
  buracos: number[]
}

/**
 * Deduz a fila a partir dos dias já lançados.
 *
 * Só olha dias com UMA pessoa: dia com duas não diz nada sobre um giro de um
 * por dia. A âncora é o primeiro dia desses, e cada dia seguinte é encaixado na
 * posição que a data manda — assim um buraco na escala não desalinha a fila,
 * como desalinharia se a ordem viesse da ordem de leitura.
 *
 * O tamanho do giro é quantas pessoas DIFERENTES aparecem — a hipótese mais
 * simples. Quem está na escala mas não aparece em nenhum dos dias lançados não
 * pode ser adivinhado: nesse caso os dias contrariam o giro simples, e a função
 * diz isso em vez de inventar um giro maior que caiba.
 *
 * Nunca grava nada e nunca "conserta" o que achou: devolve o que entendeu, com
 * o primeiro dia que contraria, para a pessoa ver e corrigir antes.
 */
export function deduzirSequencia(dias: DiaLancado[], papel: 'plantao' | 'backup' = 'plantao'): Deducao {
  const campo = papel === 'backup' ? 'backup_ids' : 'agent_ids'
  const vazia: Deducao = {
    sequencia: { ordem: [], ancora: '' },
    confirmado: false, temVao: false, diasUsados: 0, diasIgnorados: 0, quebrouEm: null, buracos: [],
  }

  const ordenados = (dias || [])
    .filter((d) => d && instanteDoDia(d.date) !== null)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const comUma = ordenados.filter((d) => ((d as unknown as Record<string, string[]>)[campo] || []).length === 1)
  const ignorados = ordenados.length - comUma.length
  if (!comUma.length) return { ...vazia, diasIgnorados: ignorados }

  const quem = (d: DiaLancado) => ((d as unknown as Record<string, string[]>)[campo] || [])[0]
  const ancora = comUma[0].date
  // O tamanho da fila é quantas pessoas diferentes aparecem.
  const pessoas: string[] = []
  for (const d of comUma) if (!pessoas.includes(quem(d))) pessoas.push(quem(d))
  const n = pessoas.length

  const ordem: string[] = new Array(n).fill('')
  let quebrouEm: string | null = null
  let repetiu = false
  for (const d of comUma) {
    const dist = diasEntre(ancora, d.date)
    if (dist === null) continue
    const pos = ((dist % n) + n) % n
    const pessoa = quem(d)
    if (!ordem[pos]) {
      ordem[pos] = pessoa
    } else if (ordem[pos] === pessoa) {
      // A mesma pessoa cair de novo na sua posição é a prova de que há giro.
      if (dist >= n) repetiu = true
    } else {
      // Dois nomes na mesma posição: os dias não formam um giro desse tamanho.
      // Para de deduzir aqui — seguir preencheria a lista com nome repetido e
      // daria a impressão de uma fila que ninguém escalou.
      quebrouEm = d.date
      break
    }
  }

  const buracos: number[] = []
  for (let i = 0; i < n; i++) if (!ordem[i]) buracos.push(i)

  // Dias seguidos? Do primeiro ao último usado, sem vão.
  const distanciaTotal = diasEntre(ancora, comUma[comUma.length - 1].date)
  const temVao = distanciaTotal === null || distanciaTotal + 1 !== comUma.length

  return {
    sequencia: { ordem, ancora },
    confirmado: !quebrouEm && !buracos.length && repetiu && !temVao,
    temVao,
    diasUsados: comUma.length,
    diasIgnorados: ignorados,
    quebrouEm,
    buracos,
  }
}

/**
 * A fila deduzida é segura para carregar na tela?
 *
 * Só quando ela reproduz os dias de que saiu. Fila com buraco ou com um dia
 * que a contraria não serve de ponto de partida: encurtá-la (tirando os
 * vazios) MANTÉM a âncora e roda todas as posições seguintes, e aí a fila
 * contradiz justamente o dia de onde foi deduzida.
 */
export function deducaoUtilizavel(d: Deducao): boolean {
  if (!d.sequencia.ordem.length) return false
  if (d.quebrouEm || d.buracos.length) return false
  if (d.sequencia.ordem.some((x) => !x)) return false
  // Fila com nome repetido só aparece junto de quebra, mas conferir é barato.
  return new Set(d.sequencia.ordem).size === d.sequencia.ordem.length
}

/** Um dia que o preenchimento vai gravar. */
export interface DiaGerado {
  data: string
  agentIds: string[]
  backupIds: string[]
  /** Quantas posições o backup andou para não ser a mesma pessoa do plantão. */
  desvioBackup: number
  /** Verdadeiro quando a fila de backup inteira colidia e o dia fica sem backup. */
  semBackupPossivel: boolean
  /** Verdadeiro quando o dia já tinha gente e vai ser substituído (só no modo refazer). */
  substitui: boolean
  /**
   * Quem está no dia AGORA, quando ele vai ser substituído.
   *
   * Guardado junto do plano por dois motivos: a prévia precisa dizer quem SAI
   * (sem isto a tela lia o estado, que podia estar velho, e afirmava que saía
   * quem já não estava lá), e a conferência de antes de gravar precisa notar
   * que o conteúdo do dia mudou desde a prévia — senão uma troca combinada
   * entre as pessoas é apagada sem nunca aparecer na prévia.
   */
  substituindo: { agentIds: string[]; backupIds: string[] } | null
}

export interface PlanoDePreenchimento {
  dias: DiaGerado[]
  /** Dias do período que já tinham gente e foram deixados como estavam. */
  preservados: string[]
  /** Dias que ficariam sem plantonista por falta de sequência. */
  semSequencia: string[]
}

/**
 * Monta o que o preenchimento vai gravar, sem gravar nada.
 *
 * Regra que não se negocia: dia já lançado NÃO é tocado. A troca pontual é
 * combinada entre as pessoas e não está escrita em lugar nenhum além do dia —
 * sobrescrever por padrão faria uma troca desaparecer sem ninguém notar, e quem
 * descobriria seria o cliente, à noite, ligando para quem não está de plantão.
 * `refazer` existe para o caso em que a pessoa pede isso com todas as letras, e
 * aí cada substituição aparece na prévia.
 *
 * O servidor recusa a mesma pessoa como plantonista e backup no mesmo dia. Em
 * vez de gerar um dia que será recusado, o backup anda para o próximo da sua
 * fila; se a fila inteira colidir, o dia sai sem backup — e os dois casos
 * aparecem na prévia.
 */
export function planejarPreenchimento(opcoes: {
  dias: string[]
  plantao: SequenciaDePlantao
  backup?: SequenciaDePlantao
  lancados: DiaLancado[]
  refazer?: boolean
}): PlanoDePreenchimento {
  const { dias, plantao, backup, lancados, refazer = false } = opcoes
  const porData = new Map<string, DiaLancado>()
  for (const d of lancados || []) {
    if (d && ((d.agent_ids || []).length > 0 || (d.backup_ids || []).length > 0)) porData.set(d.date, d)
  }
  const ocupado = new Set(porData.keys())

  const saida: DiaGerado[] = []
  const preservados: string[] = []
  const semSequencia: string[] = []

  for (const data of dias) {
    if (instanteDoDia(data) === null) continue
    const jaTem = ocupado.has(data)
    if (jaTem && !refazer) { preservados.push(data); continue }

    const plantonista = pessoaDoDia(plantao, data)
    if (!plantonista) { semSequencia.push(data); continue }

    let backupIds: string[] = []
    let desvioBackup = 0
    let semBackupPossivel = false
    const m = backup && backup.ordem.length ? backup.ordem.length : 0
    if (m) {
      const base = diasEntre(backup!.ancora, data)
      // Âncora que não é um dia que existe: não dá para calcular a posição.
      // Marcar como "sem backup possível" em vez de deixar o dia parecido com
      // um dia que simplesmente não tem fila de backup.
      if (base === null) semBackupPossivel = true
      if (base !== null) {
        const inicio = ((base % m) + m) % m
        for (let k = 0; k < m; k++) {
          const candidato = backup!.ordem[(inicio + k) % m]
          if (candidato && candidato !== plantonista) {
            backupIds = [candidato]
            desvioBackup = k
            break
          }
        }
        if (!backupIds.length) semBackupPossivel = true
      }
    }

    const atual = jaTem ? porData.get(data) : undefined
    saida.push({
      data, agentIds: [plantonista], backupIds, desvioBackup, semBackupPossivel, substitui: jaTem,
      substituindo: atual
        ? { agentIds: (atual.agent_ids || []).slice(), backupIds: (atual.backup_ids || []).slice() }
        : null,
    })
  }

  return { dias: saida, preservados, semSequencia }
}

/**
 * Duas prévias descrevem a mesma gravação?
 *
 * É a conferência que decide se o lote pode ir ao banco. Entre montar a prévia
 * e clicar em Gravar, a escala pode ter mudado — por quem lançou um dia no
 * diálogo, ou por outra pessoa em outra aba. Gravar o plano velho passaria por
 * cima de uma troca combinada, com a tela afirmando que nenhum dia lançado
 * seria alterado.
 *
 * Compara dia a dia: a data, quem entra no plantão, quem entra no backup e se
 * é substituição. Qualquer diferença significa "a prévia não descreve mais o
 * que vai acontecer".
 */
export function mesmoPlano(a: PlanoDePreenchimento, b: PlanoDePreenchimento): boolean {
  const chave = (p: PlanoDePreenchimento) => p.dias
    .map((d) => [
      d.data,
      d.agentIds.join(','),
      d.backupIds.join(','),
      d.substitui ? 1 : 0,
      // Quem está no dia agora entra na conta: no modo refazer, dois planos
      // podem mandar a MESMA pessoa para o mesmo dia e, ainda assim, estarem
      // substituindo gente diferente. Sem isto a troca combinada que entrou
      // entre a prévia e o clique era apagada sem aparecer em prévia nenhuma.
      d.substituindo ? `${d.substituindo.agentIds.join(',')}/${d.substituindo.backupIds.join(',')}` : '-',
    ].join('|'))
    .join(';')
  // Os dias preservados não precisam de conferência própria: preservado é
  // justamente o dia que NÃO entra nesta lista, então um dia que deixa de ser
  // preservado aparece aqui, e um que passa a ser preservado desaparece daqui.
  return chave(a) === chave(b)
}

/** O que fazer quando a pessoa aperta Gravar. */
export type DecisaoDeGravacao =
  /** A prévia confirmada ainda descreve o que vai acontecer: pode gravar. */
  | { acao: 'gravar'; dias: DiaGerado[] }
  /** A escala mudou desde a prévia: nada é gravado, e esta é a prévia nova. */
  | { acao: 'mudou'; plano: PlanoDePreenchimento }

/**
 * A decisão de gravar ou não, fora do componente — e por isso testável.
 *
 * É a função que protege a regra que não se negocia: dia já lançado não é
 * alterado sem o modo refazer. Entre montar a prévia e clicar em Gravar a
 * escala pode ter mudado, por quem lançou um dia no diálogo ou por outra
 * pessoa em outra aba; gravar a prévia velha apagaria uma troca combinada com
 * a tela afirmando que nenhum dia lançado seria alterado.
 *
 * Esta decisão morava dentro da tela, onde nenhum teste alcançava. Três
 * revisões independentes acharam defeito grave exatamente nessa região: é a
 * razão de ela estar aqui.
 */
export function decidirGravacao(opcoes: {
  /** A prévia que a pessoa viu e confirmou. */
  plano: PlanoDePreenchimento
  /** Os dias do período, como a tela os monta. */
  dias: string[]
  plantao: SequenciaDePlantao
  backup?: SequenciaDePlantao
  /** O que o servidor diz AGORA, relido no momento do clique. */
  lancados: DiaLancado[]
  refazer?: boolean
}): DecisaoDeGravacao {
  const { plano, dias, plantao, backup, lancados, refazer = false } = opcoes
  const conferido = planejarPreenchimento({ dias, plantao, backup, lancados, refazer })
  if (!mesmoPlano(plano, conferido)) return { acao: 'mudou', plano: conferido }
  return { acao: 'gravar', dias: conferido.dias }
}

/** Nome curto para a tela: "Maria Lima" → "Maria L.". */
export function nomeCurto(nome: string | null, id: string): string {
  const limpo = String(nome || '').trim()
  if (!limpo) return id
  const partes = limpo.split(/\s+/)
  if (partes.length === 1) return partes[0]
  return partes[0] + ' ' + partes[partes.length - 1].charAt(0).toUpperCase() + '.'
}
