// O aviso à EQUIPE (fila) para de fazer 3 idas à plataforma por pessoa
// dentro do webhook da Avisa — bloco 485, `_enfileirarPushFila`.
//
// Antes: 1 leitura de inscrições + por destinatário (teto 20) 2 consultas e 1
// gravação, cada uma esperando a anterior. Até 1 + 60 idas SEQUENCIAIS antes de
// o webhook responder. Webhook que demora a Avisa reentrega, e reentrega vira
// mensagem repetida.
//
// Depois: 1 leitura de inscrições + 1 de preferências + as gravações num lote.
//
// O teste conta as chamadas ao modelo e mede a CONCORRÊNCIA das gravações: uma
// contagem baixa com gravações ainda em série não resolveria o problema, que é
// tempo de parede, não número de consultas.
//
// Roda com: node push-fila-em-lote.test.js
const { carregarContexto, ok, fim } = require('./_carregar.js')

const dentro = carregarContexto('485 whatsapp POST /whatsapp/inbound')
const enfileirarFila = dentro._enfileirarPushFila

function cenario({ inscritos = [], prefs = null, prefsSemFiltro = undefined, falharCriacaoDe = null } = {}) {
  const estado = {
    criadas: [],
    chamadas: [],           // toda ida ao modelo, em ordem
    emVoo: 0,
    maxEmVoo: 0,            // quantas gravações correram ao mesmo tempo
  }
  const registrar = (o) => { estado.chamadas.push(o); return o }

  const models = {
    PushInscricao: {
      findMany: async (f) => {
        const chaves = Object.keys(f || {})
        registrar('Ins.findMany(' + (chaves.length ? chaves.join(',') : 'SEM FILTRO') + ')')
        if (!chaves.length) return inscritos
        return inscritos.filter((x) => String(x.user_id) === String(f.user_id))
      },
    },
    PushNaFila: {
      create: async (r) => {
        registrar('Fila.create')
        estado.emVoo++
        if (estado.emVoo > estado.maxEmVoo) estado.maxEmVoo = estado.emVoo
        // Cede o laço: com gravações em série, maxEmVoo nunca passa de 1.
        await new Promise((res) => setImmediate(res))
        estado.emVoo--
        if (falharCriacaoDe && String(r.user_id) === String(falharCriacaoDe)) {
          throw new Error('banco recusou')
        }
        estado.criadas.push(r)
        return r
      },
    },
  }
  if (prefs !== null) {
    models.PushPreferencia = {
      findMany: async (f) => {
        const chaves = Object.keys(f || {})
        registrar('Pref.findMany(' + (chaves.length ? chaves.join(',') : 'SEM FILTRO') + ')')
        if (!chaves.length) return prefsSemFiltro !== undefined ? prefsSemFiltro : prefs
        return prefs.filter((x) => String(x.user_id) === String(f.user_id))
      },
    }
  }
  return { estado, ctx: { models } }
}

const inscricao = (u, i = 1) => ({ id: 'ins_' + u + '_' + i, user_id: u, endpoint: 'https://push/' + u, p256dh: 'p', auth: 'a' })
const nomes = (n) => Array.from({ length: n }, (_, i) => 'u' + (i + 1))

;(async () => {
  // ══ a contagem de idas à plataforma ═══════════════════════════════════
  {
    const pessoas = nomes(5)
    const c = cenario({ inscritos: pessoas.map((u) => inscricao(u)), prefs: [] })
    await enfileirarFila(c.ctx, 'Novo na fila', 'Cliente aguardando', '/inbox')

    const ins = c.estado.chamadas.filter((x) => x.startsWith('Ins.findMany')).length
    const pref = c.estado.chamadas.filter((x) => x.startsWith('Pref.findMany')).length
    const cria = c.estado.chamadas.filter((x) => x === 'Fila.create').length

    ok('5 destinatários: UMA leitura de inscrições', ins === 1, c.estado.chamadas)
    ok('  UMA leitura de preferências', pref === 1, c.estado.chamadas)
    ok('  5 gravações, uma por pessoa', cria === 5, cria)
    ok('  total de 7 idas, não 16 (era 1+3N)', c.estado.chamadas.length === 7, c.estado.chamadas.length)
    ok('  nenhuma consulta de inscrição POR PESSOA (era a redundância)',
      !c.estado.chamadas.some((x) => x === 'Ins.findMany(user_id)'), c.estado.chamadas)
    ok('  as 5 gravações correm ao mesmo tempo, não em série',
      c.estado.maxEmVoo === 5, c.estado.maxEmVoo)
    ok('  e as 5 pessoas foram enfileiradas',
      c.estado.criadas.map((x) => x.user_id).sort().join(',') === pessoas.join(','),
      c.estado.criadas.map((x) => x.user_id))
  }

  // ══ quem desligou o aviso continua sem receber ════════════════════════
  {
    const c = cenario({
      inscritos: ['u1', 'u2', 'u3'].map((u) => inscricao(u)),
      prefs: [{ user_id: 'u2', fila: false }],
    })
    await enfileirarFila(c.ctx, 't', 'c', '/inbox')
    ok('quem desligou "fila" não é enfileirado',
      c.estado.criadas.map((x) => x.user_id).sort().join(',') === 'u1,u3',
      c.estado.criadas.map((x) => x.user_id))
  }

  // ══ quem não tem inscrição não entra ══════════════════════════════════
  {
    const c = cenario({ inscritos: [inscricao('u1')], prefs: [] })
    await enfileirarFila(c.ctx, 't', 'c', '/inbox')
    ok('sem inscrição, sem aviso: só o inscrito recebe',
      c.estado.criadas.length === 1 && c.estado.criadas[0].user_id === 'u1',
      c.estado.criadas.map((x) => x.user_id))
  }

  // ══ duas inscrições da mesma pessoa não viram dois avisos ═════════════
  {
    const c = cenario({ inscritos: [inscricao('u1', 1), inscricao('u1', 2), inscricao('u2')], prefs: [] })
    await enfileirarFila(c.ctx, 't', 'c', '/inbox')
    ok('dois aparelhos da mesma pessoa: UMA linha na fila',
      c.estado.criadas.length === 2, c.estado.criadas.map((x) => x.user_id))
  }

  // ══ o teto de 20 continua valendo ═════════════════════════════════════
  {
    const c = cenario({ inscritos: nomes(25).map((u) => inscricao(u)), prefs: [] })
    await enfileirarFila(c.ctx, 't', 'c', '/inbox')
    ok('25 inscritos: o teto de 20 é respeitado', c.estado.criadas.length === 20, c.estado.criadas.length)
  }

  // ══ A TRAVA: índice de preferências truncado não vira aviso indesejado ═
  //
  // A leitura sem filtro vem cortada no teto de 500 da plataforma. Se a linha
  // de quem DESLIGOU cair fora do corte, ela fica ausente do índice — e
  // ausência significa "nunca mexeu", cujo padrão é LIGADO. Sem esta trava, o
  // truncamento mandaria aviso para quem pediu para não receber.
  {
    const recheio = Array.from({ length: 500 }, (_, i) => ({ user_id: 'ninguem' + i, fila: true }))
    const c = cenario({
      inscritos: ['u1', 'u2'].map((u) => inscricao(u)),
      prefs: [{ user_id: 'u2', fila: false }],   // existe, mas fora do corte
      prefsSemFiltro: recheio,                   // 500 linhas = teto batido
    })
    await enfileirarFila(c.ctx, 't', 'c', '/inbox')
    ok('índice truncado: volta a perguntar por pessoa',
      c.estado.chamadas.filter((x) => x === 'Pref.findMany(user_id)').length === 2,
      c.estado.chamadas.filter((x) => x.startsWith('Pref')))
    ok('  e quem desligou continua de fora',
      c.estado.criadas.map((x) => x.user_id).join(',') === 'u1',
      c.estado.criadas.map((x) => x.user_id))
  }

  // ══ uma gravação que falha não cancela as outras ══════════════════════
  {
    const c = cenario({
      inscritos: ['u1', 'u2', 'u3'].map((u) => inscricao(u)),
      prefs: [],
      falharCriacaoDe: 'u2',
    })
    await enfileirarFila(c.ctx, 't', 'c', '/inbox')
    ok('gravação que falha não tira o aviso dos outros',
      c.estado.criadas.map((x) => x.user_id).sort().join(',') === 'u1,u3',
      c.estado.criadas.map((x) => x.user_id))
  }

  // ══ sem o model de preferências, todo inscrito recebe ═════════════════
  {
    const c = cenario({ inscritos: ['u1', 'u2'].map((u) => inscricao(u)), prefs: null })
    await enfileirarFila(c.ctx, 't', 'c', '/inbox')
    ok('schema sem PushPreferencia: todo inscrito recebe',
      c.estado.criadas.length === 2, c.estado.criadas.map((x) => x.user_id))
    ok('  e nenhuma leitura de preferência é tentada',
      !c.estado.chamadas.some((x) => x.startsWith('Pref')), c.estado.chamadas)
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
