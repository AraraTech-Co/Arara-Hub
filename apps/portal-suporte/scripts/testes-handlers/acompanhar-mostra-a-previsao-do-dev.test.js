// A página de acompanhamento do cliente (POST /tickets/acompanhar, rota pública, número + código) mostra a
// PREVISÃO DE ENTREGA que o dev informou. O SLA não é aplicado hoje (nada grava SLATracking), então a fonte é
// o card Dev ABERTO que nasceu deste chamado.
//
// O QUE SE GARANTE:
//   - chamado aberto com card Dev aberto e previsão válida: `previsao_entrega` = a data do card;
//   - sai SÓ a data: nada do card (quem é o dev, coluna, esforço, número, id, título) em lugar nenhum da resposta;
//   - sem card, card sem previsão (esforço indeterminado), data ilegível, card encerrado (aplicado/descartado):
//     sem data;
//   - o card de OUTRO chamado e um chamado de SUPORTE que aponta para este (quadro errado) não entram, mesmo se a
//     camada devolvesse linhas de outros chamados; a previsão do próprio chamado de suporte não é usada;
//   - com vários cards abertos vale o atualizado por último;
//   - reestimar muda o que o cliente vê (é a data do dev);
//   - resolvido ou encerrado (por data de resolução e só pelo status) deixa de mostrar a data;
//   - a lista de campos é fechada; leitura que falha e erro viram "sem data", sem erro para o cliente;
//   - a trava por tentativas, o código errado e a resposta única de recusa seguem como eram.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node acompanhar-mostra-a-previsao-do-dev.test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}
function compilar(codigo) {
  const c = {
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}
const ROTA = codigoDe('412 tickets POST /tickets/acompanhar')

const DATA = '2031-03-17T12:00:00'
const suporte = (extra) => ({
  id: 't1', ticket_number: 'TCK000100', title: 'Impressora não imprime', status: 'em_atendimento', quadro: 'suporte',
  acomp_codigo: 'ABC234', acomp_expira_em: '2099-01-01T00:00:00Z', created_at: '2026-10-01T10:00:00Z', ...extra,
})
const card = (extra) => ({
  id: 'd1', ticket_number: 'TCK000100', dev_ticket_number: 'DEV-SECRETO-77', title: 'Card interno SEGREDO', quadro: 'dev',
  status: 'em_desenvolvimento', origem_ticket_id: 't1', assigned_to: 'u-ana-DEV', esforco_entrega: 'um_sprint',
  pull_request_url: 'https://github.com/x/SEGREDO/pull/1', previsao_entrega: DATA, updated_at: '2026-10-10T10:00:00Z', ...extra,
})

async function rodar(cod, { tickets, leituraFalha = false, ignorarFiltro = false, codigo = 'ABC234' } = {}) {
  const h = compilar(cod)
  const linhas = (tickets || [suporte()]).map((x) => ({ ...x }))
  const models = {
    Ticket: {
      findMany: async (a) => {
        if (leituraFalha && a && a.origem_ticket_id) throw new Error('boom')
        return linhas.filter((x) => ignorarFiltro || Object.entries(a || {}).every(([k, v]) => String(x[k] ?? '') === String(v))).map((x) => ({ ...x }))
      },
      update: async (id, p) => { const x = linhas.find((y) => y.id === id); if (x) Object.assign(x, p) },
    },
    ActivityLog: { findMany: async () => [{ id: 'l1', ticket_id: 't1', action: 'status_changed', details: { from: 'triagem', to: 'em_atendimento' }, created_at: '2026-10-01T11:00:00Z' }] },
    TicketMessage: { findMany: async () => [{ id: 'm1', ticket_id: 't1', message: 'Olá', is_internal: false, created_at: '2026-10-01T12:00:00Z', user_id: 'u1' }] },
  }
  let r
  try { r = await h({ params: {}, query: {}, headers: {}, body: { numero: 'TCK000100', codigo }, models, reply: reply() }) } catch (e) { r = { status: 500, body: { error: 'exceção: ' + e.message } } }
  return { status: r.status, corpo: r.body, texto: JSON.stringify(r.body) }
}

async function bateria(cod = ROTA) {
  const f = []
  const t = (nome, cond, det) => { if (!cond) f.push(nome + (det !== undefined ? ' ' + JSON.stringify(det).slice(0, 220) : '')) }
  const semData = (r) => r.status === 200 && r.corpo.data.previsao_entrega === null

  let r = await rodar(cod, { tickets: [suporte(), card()] })
  t('com card Dev aberto e previsão: previsao_entrega = a data do card', r.status === 200 && r.corpo.data.previsao_entrega === DATA, r.texto)
  t('sai SÓ a data: nada do card em lugar nenhum da resposta', !/SEGREDO|u-ana|DEV-|um_sprint|esforco|d1|em_desenvolvimento|github/.test(r.texto), r.texto)
  t('a lista de campos é fechada', JSON.stringify(Object.keys(r.corpo.data).sort()) === JSON.stringify(['aberto_em', 'encerrado', 'etapa', 'linha_do_tempo', 'numero', 'previsao_entrega', 'resolvido_em', 'titulo']), Object.keys(r.corpo.data))

  r = await rodar(cod, { tickets: [suporte()] })
  t('sem card Dev: sem data', semData(r), r.texto)
  r = await rodar(cod, { tickets: [suporte({ previsao_entrega: '2031-04-04' })] })
  t('a previsão do próprio chamado de suporte não é usada (só a do card)', semData(r) && !r.texto.includes('2031-04-04'), r.texto)
  r = await rodar(cod, { tickets: [suporte(), card({ previsao_entrega: null })] })
  t('card sem previsão (esforço indeterminado): sem data', semData(r), r.texto)
  r = await rodar(cod, { tickets: [suporte(), card({ previsao_entrega: 'amanhã' })] })
  t('previsão ilegível: sem data', semData(r), r.texto)
  for (const st of ['aplicado_no_cliente', 'descartado']) {
    r = await rodar(cod, { tickets: [suporte(), card({ status: st })] })
    t(`card ${st}: sem data`, semData(r), r.texto)
  }
  r = await rodar(cod, { tickets: [suporte(), card({ previsao_entrega: DATA, status: 'backlog' })] })
  t('card em Aguardando Início (data derivada do esforço) também é mostrado', r.corpo.data.previsao_entrega === DATA, r.texto)

  // de quem é o card
  r = await rodar(cod, { tickets: [suporte(), card({ origem_ticket_id: 'outro' })] })
  t('card de OUTRO chamado não entra', semData(r), r.texto)
  r = await rodar(cod, { ignorarFiltro: true, tickets: [suporte(), card({ origem_ticket_id: 'outro', previsao_entrega: '2040-01-01T12:00:00' })] })
  t('mesmo se a camada devolvesse o card de outro chamado, a conferência pelo ID de origem o exclui', semData(r) && !r.texto.includes('2040'), r.texto)
  r = await rodar(cod, { tickets: [suporte(), card({ quadro: 'suporte', previsao_entrega: '2041-01-01T12:00:00' })] })
  t('um chamado de SUPORTE que aponta para este (quadro errado) não é card Dev', semData(r) && !r.texto.includes('2041'), r.texto)
  r = await rodar(cod, { tickets: [suporte(), card({ id: 'd1', updated_at: '2026-10-01T10:00:00Z', previsao_entrega: '2031-01-01T12:00:00' }), card({ id: 'd2', updated_at: '2026-10-09T10:00:00Z', previsao_entrega: '2031-05-05T12:00:00' }), card({ id: 'd3', updated_at: '2026-10-05T10:00:00Z', previsao_entrega: '2031-02-02T12:00:00' })] })
  t('vários cards abertos: vale o atualizado por último', r.corpo.data.previsao_entrega === '2031-05-05T12:00:00', r.corpo.data.previsao_entrega)

  // o dev reestima: o cliente vê a nova data
  const a = await rodar(cod, { tickets: [suporte(), card({ previsao_entrega: '2031-03-17T12:00:00' })] })
  const b = await rodar(cod, { tickets: [suporte(), card({ previsao_entrega: '2031-09-30T12:00:00' })] })
  t('reestimar muda o que o cliente vê', a.corpo.data.previsao_entrega === '2031-03-17T12:00:00' && b.corpo.data.previsao_entrega === '2031-09-30T12:00:00', [a.corpo.data.previsao_entrega, b.corpo.data.previsao_entrega])

  // resolvido / encerrado
  const RES = new Date(Date.now() - 3600 * 1000).toISOString()
  for (const st of ['resolvido', 'resolvido_com_manual', 'fechado', 'post_mortem']) {
    r = await rodar(cod, { tickets: [suporte({ status: st, resolved_at: RES }), card()] })
    t(`chamado ${st}: sem data, e o resolvido_em segue`, r.status === 200 && r.corpo.data.previsao_entrega === null && r.corpo.data.resolvido_em === RES, r.texto)
  }
  r = await rodar(cod, { tickets: [suporte({ status: 'fechado', updated_at: RES }), card()] })
  t('chamado encerrado SEM resolved_at (só o status): sem data', semData(r), r.texto)
  r = await rodar(cod, { tickets: [suporte({ status: 'resolvido', updated_at: RES }), card()] })
  t('chamado resolvido SEM resolved_at (só o status): sem data', semData(r), r.texto)
  r = await rodar(cod, { tickets: [suporte({ status: 'em_atendimento', resolved_at: RES }), card()] })
  t('com resolved_at preenchido, mesmo que o status ainda não diga: sem data', semData(r), r.texto)

  // falhas
  r = await rodar(cod, { tickets: [suporte(), card()], leituraFalha: true })
  t('leitura do card falhando: sem data, 200, sem a data de nenhum card', semData(r) && !r.texto.includes('2031'), r.texto)

  // o resto da rota
  r = await rodar(cod, { tickets: [suporte(), card()], codigo: 'ZZZZZ9' })
  t('código errado: 400 com a resposta única e nada do chamado', r.status === 400 && r.corpo.error === 'Número ou código inválido.' && !/previsao|2031|TCK/.test(r.texto), r.texto)
  return f
}

// A tela: lê `previsao_entrega` com a legenda "previsão de entrega" e só mostra quando vier. Teste de TEXTO, e dito assim.
const PAGINA = fs.readFileSync(path.resolve(__dirname, '../../app/(public)/acompanhar/page.tsx'), 'utf8')
const paginaSemComentarios = PAGINA.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
function tela(txt) {
  const f = []
  if (!/previsao_entrega:\s*string \| null/.test(txt)) f.push('tipo-sem-previsao_entrega')
  if (!/dados\.previsao_entrega\s*\?[^:]*previsão de entrega:/.test(txt)) f.push('legenda-ou-condicao')
  if (/prazo_atendimento|prazo de atendimento/.test(txt)) f.push('ainda-fala-de-sla')
  return f
}

;(async () => {
  const f0 = await bateria()
  ok('a bateria passa limpa', f0.length === 0, f0)
  ok('a tela lê `previsao_entrega` com a legenda "previsão de entrega"', tela(paginaSemComentarios).length === 0, tela(paginaSemComentarios))
  ok('mutação "a tela perde a condição" é pega', tela(paginaSemComentarios.replace('dados.previsao_entrega ?', 'true ?')).includes('legenda-ou-condicao'))
  ok('mutação "a tela volta ao prazo de atendimento" é pega', tela(paginaSemComentarios + '\nconst x = "prazo de atendimento"').includes('ainda-fala-de-sla'))
  const muts = [
    ['mostra a previsão do próprio chamado de suporte', 'previsao_entrega: previsaoEntrega,', 'previsao_entrega: previsaoEntrega || t.previsao_entrega || null,'],
    ['devolve o card inteiro', 'if (/^\\d{4}-\\d{2}-\\d{2}/.test(prev) && !isNaN(new Date(prev).getTime())) previsaoEntrega = prev;', 'if (atual) previsaoEntrega = atual;'],
    ['mostra depois de encerrado', 'if (!terminou) {', 'if (true) {'],
    ['o encerrado só olha o resolved_at', 'TERMINAIS.indexOf(String(t.status || "")) >= 0 || !!t.resolved_at;', '!!t.resolved_at;'],
    ['card encerrado também mostra', 'var _cardEncerrado = { aplicado_no_cliente: 1, descartado: 1 };', 'var _cardEncerrado = {};'],
    ['ignora a conferência do chamado de origem', 'return c && String(c.origem_ticket_id || "") === String(t.id) && String(c.quadro || "") === "dev"', 'return c && String(c.quadro || "") === "dev"'],
    ['aceita card de outro quadro', 'String(c.quadro || "") === "dev" && !_cardEncerrado', 'true && !_cardEncerrado'],
    ['vale o card mais antigo', 'String(cards[q].updated_at || "") > String(atual.updated_at || "")', 'String(cards[q].updated_at || "") < String(atual.updated_at || "")'],
    ['data ilegível passa direto', 'if (/^\\d{4}-\\d{2}-\\d{2}/.test(prev) && !isNaN(new Date(prev).getTime())) previsaoEntrega = prev;', 'previsaoEntrega = prev || null;'],
    ['leitura que falha vira erro para o cliente', '} catch (e) { previsaoEntrega = null; }', '} catch (e) { throw e; }'],
  ]
  for (const [nome, de, para] of muts) {
    const n = ROTA.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria(ROTA.replace(de, () => para)) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('').slice(0, 70)})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
