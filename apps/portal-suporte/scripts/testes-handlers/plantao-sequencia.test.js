// A conta que distribui o plantão pelos dias do mês.
//
// É aqui que o erro mora: um giro calculado errado grava um mês inteiro com a
// pessoa errada em cada dia, e um gerador descuidado apaga a troca pontual que
// a equipe combinou. Os dois casos têm caso de teste abaixo.
//
// A tela não entra: tudo isto é conta pura, sem React e sem build.
//
// Roda com: node plantao-sequencia.test.js
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const {
  instanteDoDia, diasEntre, pessoaDoDia, diasDoMes,
  deduzirSequencia, planejarPreenchimento, nomeCurto, colunaDaSemana, deducaoUtilizavel, mesmoPlano,
  decidirGravacao,
} = require(path.resolve(__dirname, '../../app/lib/plantao-sequencia.ts'))

const seq = (ordem, ancora) => ({ ordem, ancora })
const dia = (date, agent_ids, backup_ids = []) => ({ date, agent_ids, backup_ids })
// Dia de plano vazio. Plano que não gerou o dia esperado tem de REPROVAR na
// asserção que fala dele, não estourar o arquivo: mutante que mata por
// exceção não conta, e um `undefined.data` aqui escondia qual regra quebrou.
const VAZIO = { data: null, agentIds: [], backupIds: [], desvioBackup: 0, semBackupPossivel: null, substitui: null, substituindo: null }
const d0 = (p) => (p && p.dias && p.dias[0]) || VAZIO

;(async () => {
  // ── o dia existe? ────────────────────────────────────────────────────────
  ok('dia normal é aceito', instanteDoDia('2026-10-14') !== null)
  ok('mês 00 é recusado', instanteDoDia('2026-00-10') === null)
  ok('dia 32 é recusado', instanteDoDia('2026-10-32') === null)
  ok('31 de fevereiro é recusado (o runtime rolaria para março)', instanteDoDia('2026-02-31') === null)
  ok('29 de fevereiro em ano comum é recusado', instanteDoDia('2026-02-29') === null)
  ok('29 de fevereiro em ano bissexto é aceito', instanteDoDia('2028-02-29') !== null)
  ok('texto é recusado', instanteDoDia('ontem') === null)
  ok('data com hora é recusada (aqui só dia)', instanteDoDia('2026-10-14T00:00:00Z') === null)

  // ── distância entre dias ─────────────────────────────────────────────────
  ok('mesmo dia = 0', diasEntre('2026-10-14', '2026-10-14') === 0)
  ok('um dia depois = 1', diasEntre('2026-10-14', '2026-10-15') === 1)
  ok('virada de mês conta certo', diasEntre('2026-10-31', '2026-11-01') === 1)
  ok('virada de ano conta certo', diasEntre('2026-12-31', '2027-01-01') === 1)
  ok('mês de 31 dias', diasEntre('2026-10-01', '2026-10-31') === 30)
  ok('para trás é negativo', diasEntre('2026-10-14', '2026-10-13') === -1)
  ok('data impossível não devolve número', diasEntre('2026-00-10', '2026-10-14') === null)

  // ── de quem é o dia ──────────────────────────────────────────────────────
  {
    const s = seq(['a', 'b', 'c'], '2026-10-01')
    const esperado = {
      '2026-10-01': 'a', '2026-10-02': 'b', '2026-10-03': 'c',
      '2026-10-04': 'a', '2026-10-05': 'b', '2026-10-06': 'c',
      // Fim de semana (10 e 11/10/2026 são sábado e domingo) entra na fila.
      '2026-10-10': 'a', '2026-10-11': 'b',
      '2026-10-31': 'a', '2026-11-01': 'b',
    }
    for (const [d, quem] of Object.entries(esperado)) {
      ok(`${d} é de ${quem}`, pessoaDoDia(s, d) === quem, pessoaDoDia(s, d))
    }
    ok('dia antes da âncora não cai em posição negativa', pessoaDoDia(s, '2026-09-30') === 'c', pessoaDoDia(s, '2026-09-30'))
    ok('dois dias antes', pessoaDoDia(s, '2026-09-29') === 'b', pessoaDoDia(s, '2026-09-29'))
  }
  ok('fila de uma pessoa: todo dia é dela', pessoaDoDia(seq(['so_eu'], '2026-10-01'), '2026-12-25') === 'so_eu')
  ok('fila vazia não tem dono', pessoaDoDia(seq([], '2026-10-01'), '2026-10-01') === null)
  ok('data impossível não tem dono', pessoaDoDia(seq(['a'], '2026-10-01'), '2026-13-01') === null)

  // ── dias do mês ──────────────────────────────────────────────────────────
  ok('outubro tem 31 dias', diasDoMes('2026-10-14').length === 31)
  ok('  do dia 1 ao 31', diasDoMes('2026-10-14')[0] === '2026-10-01' && diasDoMes('2026-10-14')[30] === '2026-10-31')
  ok('fevereiro comum tem 28', diasDoMes('2026-02-10').length === 28)
  ok('fevereiro bissexto tem 29', diasDoMes('2028-02-10').length === 29)
  ok('abril tem 30', diasDoMes('2026-04-10').length === 30)

  // ── coluna no calendário ─────────────────────────────────────────────────
  // Datas de referência conferidas: 01/10/2026 é quinta, 01/11/2026 é domingo.
  ok('quinta-feira é a coluna 3', colunaDaSemana('2026-10-01') === 3, colunaDaSemana('2026-10-01'))
  ok('quarta-feira é a coluna 2', colunaDaSemana('2026-10-14') === 2, colunaDaSemana('2026-10-14'))
  ok('domingo é a coluna 6 (último lugar da grade)', colunaDaSemana('2026-11-01') === 6, colunaDaSemana('2026-11-01'))
  ok('29 de fevereiro bissexto é terça, coluna 1', colunaDaSemana('2028-02-29') === 1, colunaDaSemana('2028-02-29'))
  ok('a coluna de um mês inteiro avança de um em um e volta a 0',
    diasDoMes('2026-10-01').every((d, i) => colunaDaSemana(d) === (3 + i) % 7), 'nao')
  ok('data impossível não tem coluna', colunaDaSemana('2026-00-10') === null)

  // ── dedução: o giro que fecha ────────────────────────────────────────────
  {
    const d = deduzirSequencia([
      dia('2026-10-01', ['joao']), dia('2026-10-02', ['maria']), dia('2026-10-03', ['pedro']),
      dia('2026-10-04', ['joao']), dia('2026-10-05', ['maria']),
    ])
    ok('giro de 3 é deduzido', JSON.stringify(d.sequencia.ordem) === JSON.stringify(['joao', 'maria', 'pedro']), d.sequencia)
    ok('  a âncora é o primeiro dia lançado', d.sequencia.ancora === '2026-10-01', d.sequencia.ancora)
    ok('  e é confirmado, porque algum dia repete', d.confirmado === true, d)
    ok('  sem quebra e sem buraco', d.quebrouEm === null && !d.buracos.length, d)
    ok('  usou os 5 dias', d.diasUsados === 5, d)
  }

  // ── dedução: sem repetição, propõe mas não confirma ──────────────────────
  {
    const d = deduzirSequencia([
      dia('2026-10-01', ['joao']), dia('2026-10-02', ['maria']), dia('2026-10-03', ['pedro']),
    ])
    ok('3 dias e 3 pessoas: a fila sai', JSON.stringify(d.sequencia.ordem) === JSON.stringify(['joao', 'maria', 'pedro']), d.sequencia)
    ok('  mas NÃO é confirmado (nada repetiu ainda)', d.confirmado === false, d)
  }

  // ── dedução: o giro que quebra ───────────────────────────────────────────
  {
    const d = deduzirSequencia([
      dia('2026-10-01', ['joao']), dia('2026-10-02', ['maria']), dia('2026-10-03', ['pedro']),
      dia('2026-10-04', ['maria']),
    ])
    ok('diz em que dia quebrou', d.quebrouEm === '2026-10-04', d)
    ok('  e não se diz confirmado', d.confirmado === false, d)
  }

  // ── dedução: buraco na escala não desalinha a fila ───────────────────────
  {
    // Falta o dia 03. A posição vem da DATA, então o dia 04 ainda é a posição 1
    // e o dia 05 volta para a 0 — é isso que um giro de 2 manda.
    const d = deduzirSequencia([
      dia('2026-10-01', ['joao']), dia('2026-10-02', ['maria']),
      dia('2026-10-04', ['maria']), dia('2026-10-05', ['joao']),
    ])
    ok('a posição vem da data, não da ordem de leitura',
      JSON.stringify(d.sequencia.ordem) === JSON.stringify(['joao', 'maria']), d.sequencia)
    ok('  o dia que falta não quebra nada', d.quebrouEm === null && !d.buracos.length, d)
    ok('  a fila serve de ponto de partida', deducaoUtilizavel(d) === true, d)
    // O dia 03 nunca foi lançado: o que a fila diz DELE é extrapolação. A fila
    // bate com o que existe, e é por isso que ela é proposta — mas "confere"
    // em verde só quando os dias lançados sustentam o giro inteiro.
    ok('  mas o vão é apontado e o giro NÃO se diz confirmado',
      d.temVao === true && d.confirmado === false, d)
  }

  // ── dedução: dias seguidos confirmam; dias salteados não ────────────────
  {
    // O caso que mais engana: duas aparições da MESMA pessoa com dias vazios
    // entre elas. É a assinatura de um giro de 4 visto só pelos dias de uma
    // pessoa — os dias 02, 03 e 04 não foram lançados e não sustentam nada.
    const salteado = deduzirSequencia([dia('2026-10-01', ['joao']), dia('2026-10-05', ['joao'])])
    ok('duas aparições com vão: fila de 1 proposta, não confirmada',
      JSON.stringify(salteado.sequencia.ordem) === JSON.stringify(['joao'])
      && salteado.temVao === true && salteado.confirmado === false, salteado)

    const seguido = deduzirSequencia([
      dia('2026-10-01', ['joao']), dia('2026-10-02', ['joao']),
    ])
    ok('dois dias seguidos da mesma pessoa: giro de 1 confirmado',
      seguido.confirmado === true && seguido.temVao === false, seguido)
  }

  // ── a fila que não serve de ponto de partida ────────────────────────────
  {
    // 01 joão, 03 pedro, 04 carlos: três pessoas, e o dia 03 contraria o giro
    // de 3 ancorado no dia 01. Encurtar a fila manteria a âncora e rodaria as
    // posições, fazendo a fila contradizer o dia que a deduziu.
    const d = deduzirSequencia([
      dia('2026-10-01', ['joao']), dia('2026-10-03', ['pedro']), dia('2026-10-04', ['carlos']),
    ])
    ok('fila com buraco não é utilizável', deducaoUtilizavel(d) === false, d)
    ok('  e a fila crua guarda o vazio na posição certa',
      d.sequencia.ordem.length === 3 && d.sequencia.ordem[1] === '', d.sequencia.ordem)
    ok('  e o buraco é apontado, pela posição', JSON.stringify(d.buracos) === JSON.stringify([1]), d.buracos)
  }

  // ── utilizável: o que entra e o que não entra ───────────────────────────
  {
    ok('fila vazia não é utilizável', deducaoUtilizavel(deduzirSequencia([])) === false)
    const limpa = deduzirSequencia([
      dia('2026-10-01', ['a']), dia('2026-10-02', ['b']), dia('2026-10-03', ['a']),
    ])
    ok('fila limpa é utilizável', deducaoUtilizavel(limpa) === true, limpa)
    const quebrada = deduzirSequencia([
      dia('2026-10-01', ['a']), dia('2026-10-02', ['b']), dia('2026-10-03', ['b']),
    ])
    ok('fila com nome repetido não é utilizável', deducaoUtilizavel(quebrada) === false, quebrada)
  }

  // ── dedução: pessoa da escala que não aparece nos dias lançados ──────────
  {
    // 01 joão, 03 pedro, 04 joão. Só DUAS pessoas aparecem, então o giro simples
    // é de 2 — e o dia 03 o contraria. Quem for o terceiro não dá para adivinhar:
    // a função aponta a quebra em vez de inventar um giro de 3 que caiba.
    const d = deduzirSequencia([
      dia('2026-10-01', ['joao']), dia('2026-10-03', ['pedro']), dia('2026-10-04', ['joao']),
    ])
    ok('aponta o dia que contraria o giro simples', d.quebrouEm === '2026-10-03', d)
    ok('  e não enche a lista com nome repetido',
      d.sequencia.ordem.filter(Boolean).length === new Set(d.sequencia.ordem.filter(Boolean)).size, d.sequencia.ordem)
    ok('  sem se dizer confirmado', d.confirmado === false, d)
  }

  // ── dedução: o que ela ignora ────────────────────────────────────────────
  {
    const d = deduzirSequencia([
      dia('2026-10-01', ['joao']), dia('2026-10-02', ['maria', 'pedro']), dia('2026-10-03', ['pedro']),
    ])
    ok('dia com duas pessoas é ignorado e contado', d.diasIgnorados === 1 && d.diasUsados === 2, d)
  }
  {
    const d = deduzirSequencia([])
    ok('mês vazio: fila vazia, sem erro', d.sequencia.ordem.length === 0 && d.confirmado === false, d)
  }
  {
    const d = deduzirSequencia([dia('2026-10-05', ['joao'])])
    ok('um dia só: fila de um, âncora nele, não confirmado',
      JSON.stringify(d.sequencia.ordem) === JSON.stringify(['joao'])
      && d.sequencia.ancora === '2026-10-05' && d.confirmado === false, d)
  }
  {
    const d = deduzirSequencia([
      dia('2026-10-01', ['x'], ['ana']), dia('2026-10-02', ['y'], ['carlos']),
      dia('2026-10-03', ['z'], ['ana']),
    ], 'backup')
    ok('deduz a fila do BACKUP quando pedido',
      JSON.stringify(d.sequencia.ordem) === JSON.stringify(['ana', 'carlos']) && d.confirmado === true, d)
  }

  // ESCOLHER só o backup com a fila de plantão montada: o mês já gravado tem
  // a retaguarda trocada sem que o plantão seja refeito. É o caso de quem
  // usou "usar o que já está lançado" (que monta as duas filas) e quer mudar
  // só o backup.
  {
    const lancados = [
      dia('2026-11-01', ['joao'], ['willian']),
      dia('2026-11-02', ['maria'], ['willian']),
      dia('2026-11-03', ['pedro'], []),
    ]
    const comum = {
      dias: ['2026-11-01', '2026-11-02', '2026-11-03'],
      plantao: seq(['ze', 'ana'], '2026-11-01'),
      backup: seq(['hefler', 'eron'], '2026-11-01'),
      lancados,
    }
    const p = planejarPreenchimento({ ...comum, preencher: 'backup' })
    ok('preencher só backup com fila de plantão montada: o modo liga', p.soBackup === true, p.soBackup)
    ok('  sem refazer, só o dia sem backup entra',
      p.dias.map((d) => d.data).join(',') === '2026-11-03', p.dias.map((d) => d.data))
    ok('  e o plantonista dele é o lançado, não o da fila',
      d0(p).agentIds.join(',') === 'pedro', d0(p).agentIds)

    const r = planejarPreenchimento({ ...comum, preencher: 'backup', refazer: true })
    ok('preencher só backup + refazer: os três dias entram', r.dias.length === 3, r.dias.length)
    ok('  nenhum plantonista vem da fila de plantão',
      r.dias.map((d) => d.agentIds.join(',')).join(';') === 'joao;maria;pedro', r.dias.map((d) => d.agentIds))
    ok('  o backup é trocado pela fila de backup',
      r.dias.map((d) => d.backupIds.join(',')).join(';') === 'hefler;eron;hefler', r.dias.map((d) => d.backupIds))

    const t = planejarPreenchimento({ ...comum, refazer: true })
    ok('sem escolher, a fila de plantão montada refaz o plantão (o modo de sempre)',
      t.soBackup === false && d0(t).agentIds.join(',') === 'ze', [t.soBackup, d0(t).agentIds])

    // A reconferência de antes de gravar usa o MESMO modo da prévia.
    const d = decidirGravacao({ ...comum, plano: r, preencher: 'backup', refazer: true })
    ok('gravar a prévia "só backup" com o mesmo modo: grava', d.acao === 'gravar', d.acao)
    const d2 = decidirGravacao({ ...comum, plano: r, refazer: true })
    ok('reconferir a prévia "só backup" com outro modo: não grava', d2.acao === 'mudou', d2.acao)
  }

  // Dois planos iguais DIA A DIA, um "só backup" e outro não: não são a mesma
  // gravação. Montado para os dias coincidirem — fila de plantão igual ao que
  // está lançado, todo dia já com backup — e assim só o modo os distingue.
  {
    const comum = {
      dias: ['2026-11-01', '2026-11-02'],
      plantao: seq(['joao', 'maria'], '2026-11-01'),
      backup: seq(['hefler', 'eron'], '2026-11-01'),
      lancados: [dia('2026-11-01', ['joao'], ['willian']), dia('2026-11-02', ['maria'], ['willian'])],
      refazer: true,
    }
    const tudo = planejarPreenchimento(comum)
    const soB = planejarPreenchimento({ ...comum, preencher: 'backup' })
    const chave = (p) => JSON.stringify(p.dias)
    ok('o caso foi montado com os dias idênticos nos dois modos', chave(tudo) === chave(soB), [chave(tudo), chave(soB)])
    ok('dias iguais em modos diferentes não são o mesmo plano', mesmoPlano(tudo, soB) === false, 'iguais')
  }

  // Sem regressão: com fila de plantão, o plano é o mesmo de antes.
  // Primeiro do gerador de propósito: se o modo só-backup ligar com fila de
  // plantão, os casos seguintes esvaziam e alguns estouram — esta asserção
  // tem de reprovar pelo valor antes disso.
  {
    const comum = {
      dias: diasDoMes('2026-10-01'),
      plantao: seq(['joao', 'maria', 'pedro'], '2026-10-01'),
      backup: seq(['ana', 'carlos'], '2026-10-01'),
      lancados: [dia('2026-10-05', ['willian'], [])],
    }
    const p = planejarPreenchimento(comum)
    ok('com fila de plantão o modo só-backup não liga', p.soBackup === false, p.soBackup)
    ok('  e o dia lançado segue preservado',
      p.preservados.length === 1 && p.preservados[0] === '2026-10-05', p.preservados)
    ok('  e os demais 30 dias entram com o plantonista calculado',
      p.dias.length === 30 && d0(p).agentIds[0] === 'joao', p.dias.length)
  }

  // ── gerador: o caminho normal ────────────────────────────────────────────
  {
    const p = planejarPreenchimento({
      dias: diasDoMes('2026-10-01'),
      plantao: seq(['joao', 'maria', 'pedro'], '2026-10-01'),
      backup: seq(['ana', 'carlos'], '2026-10-01'),
      lancados: [],
    })
    ok('mês vazio gera os 31 dias', p.dias.length === 31, p.dias.length)
    ok('  o dia 1 é do primeiro de cada fila',
      d0(p).data === '2026-10-01' && d0(p).agentIds[0] === 'joao' && d0(p).backupIds[0] === 'ana', d0(p))
    ok('  cada dia tem exatamente um plantonista', p.dias.every((d) => d.agentIds.length === 1), 'nao')
    ok('  ninguém é plantonista e backup no mesmo dia',
      p.dias.every((d) => !d.backupIds.includes(d.agentIds[0])), p.dias.filter((d) => d.backupIds.includes(d.agentIds[0])))
    ok('  nada a preservar e nada sem sequência', !p.preservados.length && !p.semSequencia.length, p)
  }

  // ── gerador: a troca pontual sobrevive ───────────────────────────────────
  {
    const lancados = [dia('2026-10-02', ['pedro'], ['ana'])] // troca combinada
    const p = planejarPreenchimento({
      dias: diasDoMes('2026-10-01'),
      plantao: seq(['joao', 'maria', 'pedro'], '2026-10-01'),
      backup: seq(['ana', 'carlos'], '2026-10-01'),
      lancados,
    })
    ok('o dia já lançado não entra no que vai ser gravado',
      !p.dias.some((d) => d.data === '2026-10-02'), p.dias.filter((d) => d.data === '2026-10-02'))
    ok('  ele é listado como preservado', JSON.stringify(p.preservados) === JSON.stringify(['2026-10-02']), p.preservados)
    ok('  e os 30 outros dias são gerados', p.dias.length === 30, p.dias.length)
    ok('  o ritmo segue pela data: o dia 3 continua sendo do terceiro da fila',
      p.dias.find((d) => d.data === '2026-10-03').agentIds[0] === 'pedro', p.dias.find((d) => d.data === '2026-10-03'))
  }

  // ── gerador: refazer um trecho, quando pedido com todas as letras ────────
  {
    const lancados = [dia('2026-10-02', ['pedro'], ['ana'])]
    const p = planejarPreenchimento({
      dias: diasDoMes('2026-10-01'),
      plantao: seq(['joao', 'maria', 'pedro'], '2026-10-01'),
      backup: seq(['ana', 'carlos'], '2026-10-01'),
      lancados,
      refazer: true,
    })
    ok('no modo refazer o dia entra', p.dias.length === 31, p.dias.length)
    ok('  e vem marcado como substituição',
      p.dias.find((d) => d.data === '2026-10-02').substitui === true, p.dias.find((d) => d.data === '2026-10-02'))
    ok('  só ele está marcado', p.dias.filter((d) => d.substitui).length === 1, p.dias.filter((d) => d.substitui))
    ok('  e nada aparece como preservado', !p.preservados.length, p.preservados)
  }
  {
    // Dia gravado SEM ninguém (plantão vago) conta como vazio: pode preencher.
    const p = planejarPreenchimento({
      dias: ['2026-10-01', '2026-10-02'],
      plantao: seq(['joao'], '2026-10-01'),
      lancados: [dia('2026-10-02', [], [])],
    })
    ok('dia gravado sem ninguém é tratado como vazio', p.dias.length === 2 && !p.preservados.length, p)
  }

  // ── gerador: o choque de papéis ──────────────────────────────────────────
  {
    // As duas filas têm as MESMAS pessoas: todo dia a conta bate no mesmo id.
    const p = planejarPreenchimento({
      dias: diasDoMes('2026-10-01'),
      plantao: seq(['joao', 'maria'], '2026-10-01'),
      backup: seq(['joao', 'maria'], '2026-10-01'),
      lancados: [],
    })
    ok('o backup anda uma posição para não ser a mesma pessoa',
      p.dias.every((d) => d.desvioBackup === 1), p.dias.filter((d) => d.desvioBackup !== 1).slice(0, 2))
    ok('  e aí ninguém é plantonista e backup no mesmo dia',
      p.dias.every((d) => !d.backupIds.includes(d.agentIds[0])), 'nao')
    ok('  nenhum dia fica sem backup', p.dias.every((d) => d.backupIds.length === 1), 'nao')
  }
  {
    // A fila de backup tem UMA pessoa, que é também a do plantão naquele dia.
    const p = planejarPreenchimento({
      dias: ['2026-10-01', '2026-10-02'],
      plantao: seq(['joao', 'maria'], '2026-10-01'),
      backup: seq(['joao'], '2026-10-01'),
      lancados: [],
    })
    const d1 = p.dias.find((d) => d.data === '2026-10-01') || VAZIO
    const d2 = p.dias.find((d) => d.data === '2026-10-02') || VAZIO
    ok('fila de backup inteira colidindo: o dia sai SEM backup',
      d1.backupIds.length === 0 && d1.semBackupPossivel === true, d1)
    ok('  e o dia em que não colide sai com backup',
      d2.backupIds[0] === 'joao' && d2.semBackupPossivel === false, d2)
  }
  {
    const p = planejarPreenchimento({
      dias: ['2026-10-01'],
      plantao: seq(['joao'], '2026-10-01'),
      lancados: [],
    })
    ok('sem fila de backup, o dia sai só com plantonista',
      d0(p).backupIds.length === 0 && d0(p).semBackupPossivel === false, d0(p))
  }
  {
    const p = planejarPreenchimento({
      dias: ['2026-10-01', '2026-10-02'],
      plantao: seq([], '2026-10-01'),
      lancados: [],
    })
    ok('sem fila de plantão, nada é gerado e os dias são apontados',
      !p.dias.length && p.semSequencia.length === 2, p)
  }
  {
    const p = planejarPreenchimento({
      dias: ['2026-10-01', '2026-00-10', '2026-10-32'],
      plantao: seq(['joao'], '2026-10-01'),
      lancados: [],
    })
    ok('data impossível na lista é descartada, sem estourar', p.dias.length === 1 && d0(p).data === '2026-10-01', p.dias)
  }

  // ── o que "ocupado" significa: dia só com backup também é dia lançado ───
  // A revisão mostrou que nenhum caso cobria isto: trocar a regra para olhar
  // só o plantonista passava no teste, e um dia em que só o backup foi
  // escalado seria sobrescrito sem refazer.
  {
    const p = planejarPreenchimento({
      dias: ['2026-10-01', '2026-10-02', '2026-10-03'],
      plantao: seq(['joao', 'maria'], '2026-10-01'),
      backup: seq(['ana'], '2026-10-01'),
      lancados: [dia('2026-10-02', [], ['carlos'])],
    })
    ok('dia só com backup é preservado', JSON.stringify(p.preservados) === JSON.stringify(['2026-10-02']), p.preservados)
    ok('  e não entra no que vai ser gravado', !p.dias.some((d) => d.data === '2026-10-02'), p.dias.map((d) => d.data))
  }
  {
    const p = planejarPreenchimento({
      dias: ['2026-10-01', '2026-10-02'],
      plantao: seq(['joao'], '2026-10-01'),
      lancados: [dia('2026-10-02', ['pedro'], [])],
    })
    ok('dia só com plantonista é preservado', JSON.stringify(p.preservados) === JSON.stringify(['2026-10-02']), p.preservados)
  }

  // ── o desvio do backup é a distância REAL, não um sim/não ───────────────
  {
    // Fila de plantão de 3 e de backup de 3, com as mesmas pessoas em ordens
    // diferentes: o desvio varia de dia para dia. Fixar o desvio em 1 passava
    // no teste antigo, e a barra da prévia contaria errado.
    const p = planejarPreenchimento({
      dias: ['2026-10-01', '2026-10-02', '2026-10-03'],
      plantao: seq(['a', 'b', 'c'], '2026-10-01'),
      backup: seq(['a', 'b', 'c'], '2026-10-01'),
      lancados: [],
    })
    ok('todos os dias colidem e todos desviam 1', p.dias.every((d) => d.desvioBackup === 1), p.dias.map((d) => d.desvioBackup))
    const q = planejarPreenchimento({
      dias: ['2026-10-01', '2026-10-02', '2026-10-03'],
      plantao: seq(['a', 'b', 'c'], '2026-10-01'),
      backup: seq(['x', 'b', 'y'], '2026-10-01'),
      lancados: [],
    })
    ok('só o dia que colide desvia', JSON.stringify(q.dias.map((d) => d.desvioBackup)) === JSON.stringify([0, 1, 0]),
      q.dias.map((d) => `${d.data}:${d.desvioBackup}`))
    ok('  e o backup do dia que desviou é o próximo da fila',
      q.dias[1].backupIds[0] === 'y', q.dias[1])
    // Desvio de DUAS posições: dois candidatos seguidos colidem. Sem este
    // caso, trocar o desvio por um sim/não passava no teste, e a barra da
    // prévia contaria errado quantos dias desviaram.
    const r = planejarPreenchimento({
      dias: ['2026-10-01'],
      plantao: seq(['a'], '2026-10-01'),
      backup: seq(['a', 'a', 'b'], '2026-10-01'),
      lancados: [],
    })
    ok('duas colisões seguidas: o desvio é 2, não 1',
      r.dias[0].desvioBackup === 2 && r.dias[0].backupIds[0] === 'b', r.dias[0])
  }

  // ── a ordem dos dias lançados não muda a âncora ─────────────────────────
  {
    // Se a listagem vier fora de ordem, a âncora tem de continuar no dia mais
    // antigo: sem ordenar, a fila inteira desloca.
    const fora = deduzirSequencia([
      dia('2026-10-03', ['pedro']), dia('2026-10-01', ['joao']), dia('2026-10-02', ['maria']),
      dia('2026-10-04', ['joao']),
    ])
    ok('a âncora é o dia mais antigo, venha a lista na ordem que vier',
      fora.sequencia.ancora === '2026-10-01', fora.sequencia)
    ok('  e a fila sai na ordem do giro',
      JSON.stringify(fora.sequencia.ordem) === JSON.stringify(['joao', 'maria', 'pedro']), fora.sequencia)
  }

  // ── âncora de backup impossível não finge que há backup ─────────────────
  {
    const p = planejarPreenchimento({
      dias: ['2026-10-01'],
      plantao: seq(['joao'], '2026-10-01'),
      backup: { ordem: ['ana'], ancora: '2026-02-31' },
      lancados: [],
    })
    ok('âncora de backup impossível: o dia sai sem backup, e marcado',
      d0(p).backupIds.length === 0 && d0(p).semBackupPossivel === true, d0(p))
  }

  // ── lista de dias lançados com item nulo não estoura ────────────────────
  {
    let estourou = null
    let p = null
    try {
      p = planejarPreenchimento({
        dias: ['2026-10-01'],
        plantao: seq(['joao'], '2026-10-01'),
        lancados: [null, undefined, dia('2026-10-05', ['x'])],
      })
    } catch (e) { estourou = e }
    ok('item nulo na lista de lançados é ignorado, sem estourar',
      !estourou && p && p.dias.length === 1, estourou ? String(estourou.message) : p)
  }

  // ── a conferência que decide se o lote pode gravar ──────────────────────
  // Sem ela, lançar um dia no diálogo DEPOIS de montar a prévia e então clicar
  // em Gravar passava por cima do dia lançado — a troca combinada desaparecia,
  // e a barra na tela dizia que nenhum dia lançado seria alterado.
  {
    const comum = {
      dias: diasDoMes('2026-10-01'),
      plantao: seq(['joao', 'maria', 'pedro'], '2026-10-01'),
      backup: seq(['ana', 'carlos'], '2026-10-01'),
    }
    const antes = planejarPreenchimento({ ...comum, lancados: [] })
    ok('a mesma prévia é igual a si mesma', mesmoPlano(antes, antes) === true)
    ok('  e igual a uma recalculada do mesmo estado',
      mesmoPlano(antes, planejarPreenchimento({ ...comum, lancados: [] })) === true)

    // Alguém lançou o dia 15 no diálogo: a prévia encolhe e deixa de valer.
    const depois = planejarPreenchimento({ ...comum, lancados: [dia('2026-10-15', ['maria'], ['ana'])] })
    ok('um dia lançado no meio torna a prévia diferente', mesmoPlano(antes, depois) === false,
      { antes: antes.dias.length, depois: depois.dias.length })

    // Mudar a fila muda quem entra em cada dia, com o mesmo número de dias.
    const outraFila = planejarPreenchimento({
      ...comum, plantao: seq(['pedro', 'maria', 'joao'], '2026-10-01'), lancados: [],
    })
    ok('mesma quantidade de dias e gente diferente também é diferente',
      outraFila.dias.length === antes.dias.length && mesmoPlano(antes, outraFila) === false,
      outraFila.dias[0])

    // Mudar só o backup conta.
    const outroBackup = planejarPreenchimento({ ...comum, backup: seq(['carlos', 'ana'], '2026-10-01'), lancados: [] })
    ok('trocar só a ordem do backup é diferente', mesmoPlano(antes, outroBackup) === false, outroBackup.dias[0])

    // A data entra na conta: mesma gente, dia diferente, é outra gravação.
    const outroDia = planejarPreenchimento({
      dias: ['2026-10-02'], plantao: seq(['joao'], '2026-10-01'), lancados: [],
    })
    const primeiroDia = planejarPreenchimento({
      dias: ['2026-10-01'], plantao: seq(['joao'], '2026-10-01'), lancados: [],
    })
    ok('mesma pessoa em dia diferente é outra gravação',
      mesmoPlano(primeiroDia, outroDia) === false,
      [primeiroDia.dias[0].data, outroDia.dias[0].data])

    // O QUE ESTÁ NO DIA conta: no modo refazer, dois planos podem mandar a
    // mesma pessoa para o mesmo dia substituindo gente DIFERENTE. Sem isto, a
    // troca combinada que entrasse entre a prévia e o clique era apagada sem
    // nunca aparecer numa prévia.
    {
      const comRefazer = {
        dias: ['2026-10-01', '2026-10-02', '2026-10-03'],
        plantao: seq(['joao', 'maria', 'pedro'], '2026-10-01'),
        refazer: true,
      }
      const previa = planejarPreenchimento({
        ...comRefazer, lancados: [dia('2026-10-02', ['ana'], ['bia'])],
      })
      const depoisDaTroca = planejarPreenchimento({
        ...comRefazer, lancados: [dia('2026-10-02', ['ze'], ['tina'])],
      })
      ok('substituir gente diferente é outra gravação',
        mesmoPlano(previa, depoisDaTroca) === false,
        [previa.dias[1].substituindo, depoisDaTroca.dias[1].substituindo])
      ok('  e o plano guarda quem sai, para a prévia poder dizer',
        JSON.stringify(previa.dias[1].substituindo) === JSON.stringify({ agentIds: ['ana'], backupIds: ['bia'] }),
        previa.dias[1].substituindo)
      ok('  dia que não substitui ninguém guarda nulo',
        previa.dias[0].substituindo === null, previa.dias[0])

      // SÓ o backup do dia muda. Sem este caso, comparar apenas o plantonista
      // do dia substituído passava no teste — e a troca do backup combinada
      // entre as pessoas seria apagada sem aparecer em prévia nenhuma.
      const soOBackupMudou = planejarPreenchimento({
        ...comRefazer, lancados: [dia('2026-10-02', ['ana'], ['tina'])],
      })
      ok('trocar só o backup do dia substituído é outra gravação',
        mesmoPlano(previa, soOBackupMudou) === false,
        [previa.dias[1].substituindo, soOBackupMudou.dias[1].substituindo])

      // E só o plantonista.
      const soOPlantonistaMudou = planejarPreenchimento({
        ...comRefazer, lancados: [dia('2026-10-02', ['ze'], ['bia'])],
      })
      ok('trocar só o plantonista do dia substituído é outra gravação',
        mesmoPlano(previa, soOPlantonistaMudou) === false,
        [previa.dias[1].substituindo, soOPlantonistaMudou.dias[1].substituindo])
    }

    // Um dia que deixou de estar lançado muda o que vai acontecer.
    {
      const comum2 = { dias: ['2026-10-01', '2026-10-02'], plantao: seq(['joao', 'maria'], '2026-10-01') }
      const comPreservado = planejarPreenchimento({ ...comum2, lancados: [dia('2026-10-02', ['ana'], [])] })
      const semPreservado = planejarPreenchimento({ ...comum2, lancados: [] })
      // Preservado é o dia que NÃO entra na lista de gravação: deixar de ser
      // preservado faz o dia aparecer na lista, e é por aí que a conferência
      // percebe. Não há conta separada de preservados, de propósito.
      ok('um dia que deixa de estar lançado entra na lista e muda a gravação',
        mesmoPlano(comPreservado, semPreservado) === false
        && comPreservado.dias.length === 1 && semPreservado.dias.length === 2,
        { antes: comPreservado.preservados, depois: semPreservado.preservados })
    }

    // O modo refazer muda a marca de substituição, não a lista de dias.
    const lancadoUm = [dia('2026-10-15', ['maria'], ['ana'])]
    const normal = planejarPreenchimento({ ...comum, lancados: lancadoUm })
    const refeito = planejarPreenchimento({ ...comum, lancados: lancadoUm, refazer: true })
    ok('preencher e refazer descrevem gravações diferentes', mesmoPlano(normal, refeito) === false,
      { normal: normal.dias.length, refeito: refeito.dias.length })
  }

  // ── a decisão de gravar: a guarda da regra que não se negocia ───────────
  // Esta decisão morava dentro da tela, onde teste nenhum alcançava, e foi ali
  // que três revisões independentes acharam defeito grave. Agora é função pura.
  {
    const comum = {
      dias: diasDoMes('2026-10-01'),
      plantao: seq(['joao', 'maria', 'pedro'], '2026-10-01'),
      backup: seq(['ana', 'carlos'], '2026-10-01'),
    }

    // Nada mudou desde a prévia: grava.
    {
      const plano = planejarPreenchimento({ ...comum, lancados: [] })
      const d = decidirGravacao({ ...comum, plano, lancados: [] })
      ok('nada mudou: a decisão é gravar', d.acao === 'gravar', d.acao)
      ok('  e são os 31 dias da prévia', d.acao === 'gravar' && d.dias.length === 31, d)
    }

    // Alguém lançou um dia depois da prévia: NÃO grava, e devolve a prévia nova.
    {
      const plano = planejarPreenchimento({ ...comum, lancados: [] })
      const d = decidirGravacao({ ...comum, plano, lancados: [dia('2026-10-15', ['maria'], ['ana'])] })
      ok('um dia lançado depois da prévia: a decisão é NÃO gravar', d.acao === 'mudou', d.acao)
      ok('  e a prévia nova preserva o dia lançado',
        d.acao === 'mudou' && !d.plano.dias.some((x) => x.data === '2026-10-15')
        && d.plano.preservados.includes('2026-10-15'), d.acao === 'mudou' && d.plano.preservados)
    }

    // O dia foi lançado com a MESMA pessoa que a sequência mandaria: ainda
    // assim não grava, porque o dia deixou de estar vazio e a prévia dizia que
    // ia escrever nele.
    {
      const plano = planejarPreenchimento({ ...comum, lancados: [] })
      const naPreviaDoDia15 = plano.dias.find((x) => x.data === '2026-10-15')
      const d = decidirGravacao({
        ...comum, plano,
        lancados: [dia('2026-10-15', naPreviaDoDia15.agentIds, naPreviaDoDia15.backupIds)],
      })
      ok('dia lançado com a mesma pessoa da sequência: também não grava', d.acao === 'mudou', d.acao)
    }

    // No modo refazer, a troca do conteúdo do dia impede a gravação.
    {
      const comRefazer = { ...comum, refazer: true }
      const lancadoAntes = [dia('2026-10-02', ['ana'], ['bia'])]
      const plano = planejarPreenchimento({ ...comRefazer, lancados: lancadoAntes })
      const igual = decidirGravacao({ ...comRefazer, plano, lancados: lancadoAntes })
      ok('refazer sem mudança: grava', igual.acao === 'gravar', igual.acao)
      const trocado = decidirGravacao({
        ...comRefazer, plano, lancados: [dia('2026-10-02', ['ze'], ['tina'])],
      })
      ok('refazer com o dia trocado por outra pessoa: NÃO grava', trocado.acao === 'mudou', trocado.acao)
      const soBackup = decidirGravacao({
        ...comRefazer, plano, lancados: [dia('2026-10-02', ['ana'], ['tina'])],
      })
      ok('refazer com só o backup trocado: NÃO grava', soBackup.acao === 'mudou', soBackup.acao)
    }

    // Um dia que DEIXOU de estar lançado também muda o que vai acontecer.
    {
      const plano = planejarPreenchimento({ ...comum, lancados: [dia('2026-10-20', ['ana'], [])] })
      const d = decidirGravacao({ ...comum, plano, lancados: [] })
      ok('dia que deixou de estar lançado: não grava', d.acao === 'mudou', d.acao)
      ok('  e a prévia nova passa a incluí-lo',
        d.acao === 'mudou' && d.plano.dias.some((x) => x.data === '2026-10-20'), d.acao === 'mudou' && d.plano.dias.length)
    }
  }

  // ── fila SÓ de backup: o mês de plantão já está lançado ─────────────────
  //
  // É o caso do plantão de 03/11/2026: novembro inteiro com plantonista e a
  // retaguarda faltando. Sem este modo, a única saída era abrir 30 diálogos.
  {
    const diasNov = diasDoMes('2026-11-01')
    const lancados = diasNov.map((d, i) => dia(d, [['joao', 'maria', 'pedro'][i % 3]], []))
    const p = planejarPreenchimento({
      dias: diasNov,
      plantao: seq([], '2026-11-01'),
      backup: seq(['ana', 'carlos'], '2026-11-01'),
      lancados,
    })
    ok('fila só de backup preenche o mês já lançado', p.dias.length === 30, p.dias.length)
    ok('  e o plano se declara "só backup"', p.soBackup === true, p.soBackup)
    ok('  e nenhum dia é tratado como preservado', p.preservados.length === 0, p.preservados.length)
    ok('  e nenhum dia fica sem sequência', p.semSequencia.length === 0, p.semSequencia.length)

    // `|| vazio`: plano vazio tem de REPROVAR estas asserções, não estourar o
    // arquivo — mutante que mata por exceção não conta.
    const primeiro = d0(p)
    ok('o plantonista do dia é o que JÁ estava lançado',
      primeiro.agentIds.length === 1 && primeiro.agentIds[0] === 'joao', primeiro.agentIds)
    ok('  e o backup do dia vem da fila de backup',
      primeiro.backupIds.length === 1 && primeiro.backupIds[0] === 'ana', primeiro.backupIds)
    ok('todo dia do plano conserva o plantonista lançado',
      p.dias.every((d, i) => d.agentIds.length === 1 && d.agentIds[0] === ['joao', 'maria', 'pedro'][i % 3]),
      p.dias.slice(0, 4).map((d) => d.agentIds.join(',')))
    ok('nenhum dia é marcado como substituição (não havia backup para trocar)',
      p.dias.every((d) => d.substitui === false), p.dias.filter((d) => d.substitui).length)
    ok('mas o retrato do dia entra, para a conferência de antes de gravar',
      p.dias.every((d) => d.substituindo && d.substituindo.agentIds.length === 1), primeiro.substituindo)
  }

  // Dia que já tem backup é preservado: o lote não troca retaguarda combinada.
  {
    const p = planejarPreenchimento({
      dias: ['2026-11-01', '2026-11-02'],
      plantao: seq([], '2026-11-01'),
      backup: seq(['ana', 'carlos'], '2026-11-01'),
      lancados: [dia('2026-11-01', ['joao'], ['willian']), dia('2026-11-02', ['maria'], [])],
    })
    ok('dia que já tem backup fica de fora',
      p.dias.length === 1 && d0(p).data === '2026-11-02', p.dias.map((d) => d.data))
    ok('  e aparece como preservado',
      p.preservados.length === 1 && p.preservados[0] === '2026-11-01', p.preservados)
  }

  // Com refazer, o backup já lançado é trocado — e aparece como substituição.
  {
    const p = planejarPreenchimento({
      dias: ['2026-11-01'],
      plantao: seq([], '2026-11-01'),
      backup: seq(['ana'], '2026-11-01'),
      lancados: [dia('2026-11-01', ['joao'], ['willian'])],
      refazer: true,
    })
    ok('refazer troca o backup já lançado',
      p.dias.length === 1 && d0(p).backupIds[0] === 'ana', d0(p))
    ok('  mantendo o plantonista', d0(p).agentIds[0] === 'joao', d0(p).agentIds)
    ok('  e marcando que substitui', d0(p).substitui === true, d0(p).substitui)
  }

  // Colisão: o backup do dia seria quem já está de plantão naquele dia.
  {
    const p = planejarPreenchimento({
      dias: ['2026-11-01', '2026-11-02'],
      plantao: seq([], '2026-11-01'),
      backup: seq(['joao', 'ana'], '2026-11-01'),
      lancados: [dia('2026-11-01', ['joao'], []), dia('2026-11-02', ['maria'], [])],
    })
    const d1 = p.dias.find((d) => d.data === '2026-11-01') || VAZIO
    ok('o backup anda quando cairia em cima do plantonista lançado',
      d1.backupIds[0] === 'ana' && d1.desvioBackup === 1, d1)
  }

  // Fila de backup com uma pessoa só, que é o plantonista: dia sem backup.
  {
    const p = planejarPreenchimento({
      dias: ['2026-11-01'],
      plantao: seq([], '2026-11-01'),
      backup: seq(['joao'], '2026-11-01'),
      lancados: [dia('2026-11-01', ['joao'], [])],
    })
    ok('fila de backup que colide inteira deixa o dia sem backup',
      d0(p).backupIds.length === 0 && d0(p).semBackupPossivel === true, d0(p))
  }

  // O plantonista mudou entre a prévia e o Gravar: NÃO grava.
  {
    const comum = {
      dias: ['2026-11-01'],
      plantao: seq([], '2026-11-01'),
      backup: seq(['ana'], '2026-11-01'),
    }
    const plano = planejarPreenchimento({ ...comum, lancados: [dia('2026-11-01', ['joao'], [])] })
    const d = decidirGravacao({ ...comum, plano, lancados: [dia('2026-11-01', ['pedro'], [])] })
    ok('plantonista trocado depois da prévia: o lote não grava', d.acao === 'mudou', d.acao)
    ok('  e a prévia nova já traz o plantonista novo',
      d.acao === 'mudou' && d0(d.plano).agentIds[0] === 'pedro',
      d.acao === 'mudou' ? d0(d.plano).agentIds : d.acao)
  }

  // Mês lançado só em parte: o modo só-backup não cria dia de plantão vazio.
  {
    const p = planejarPreenchimento({
      dias: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
      plantao: seq([], '2026-11-01'),
      backup: seq(['ana', 'carlos'], '2026-11-01'),
      lancados: [dia('2026-11-01', ['joao'], []), dia('2026-11-02', ['maria'], [])],
    })
    ok('só-backup: nenhum dia do plano sai sem plantonista',
      p.dias.every((d) => d.agentIds.length > 0), p.dias.map((d) => d.data + ':' + d.agentIds.join(',')))
    ok('  só os dias com plantonista lançado entram',
      p.dias.map((d) => d.data).join(',') === '2026-11-01,2026-11-02', p.dias.map((d) => d.data))
    ok('  e os dias sem plantonista aparecem como fora do lote',
      p.semSequencia.join(',') === '2026-11-03,2026-11-04', p.semSequencia)
  }

  // ── nome curto ───────────────────────────────────────────────────────────
  ok('nome curto pega primeiro e inicial do último', nomeCurto('Maria Lima Souza', 'u1') === 'Maria S.', nomeCurto('Maria Lima Souza', 'u1'))
  ok('nome de uma palavra fica inteiro', nomeCurto('Maria', 'u1') === 'Maria')
  ok('sem nome, mostra o id', nomeCurto(null, 'u1') === 'u1')
  ok('nome em branco, mostra o id', nomeCurto('   ', 'u1') === 'u1')

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
