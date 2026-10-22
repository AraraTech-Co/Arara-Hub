// A página de acompanhamento do cliente (POST /tickets/acompanhar, rota pública, número + código) mostra
// o PRAZO DE ATENDIMENTO: o SLA do chamado. A previsão de entrega do dev é interna e não chega ao cliente.
//
// O QUE SE GARANTE:
//   - chamado com SLA aberto: `prazo_atendimento` = o `resolution_deadline` do SLATracking DESTE chamado;
//   - chamado SEM SLA: `prazo_atendimento` nulo, MESMO com `previsao_entrega` do dev preenchida, e a data do
//     dev não aparece em NENHUM ponto da resposta serializada (nem na linha do tempo); a chave `previsao`
//     não existe mais;
//   - o dev definir ou reestimar a previsão NÃO muda a resposta (idêntica byte a byte);
//   - a lista de campos é fechada: do SLA só sai o prazo (nem breached, nem escalated_to, nem
//     first_response_at, nem minutos), e o segredo de um campo interno não vaza;
//   - o SLA é o do chamado de SUPORTE: o de outro chamado e o do card Dev que compartilha o número não entram;
//   - com várias linhas de SLA vale a mais recente; data ilegível, modelo ausente e leitura que falha viram
//     "sem prazo", nunca erro nem outra data;
//   - chamado resolvido ou encerrado deixa de mostrar o prazo (resolvido_em segue sendo mostrado);
//   - a trava por tentativas, o código errado e a resposta única de recusa seguem como eram.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node acompanhar-mostra-o-sla.test.js
const fs = require('fs')
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

const DEV_DATA = '2031-03-17T12:00:00'                 // previsão do dev: não pode aparecer
const SLA_DATA = '2031-02-10T15:30:00.000Z'            // prazo prometido
const t1 = (extra) => ({
  id: 't1', ticket_number: 'TCK000100', title: 'Impressora não imprime', status: 'em_atendimento', quadro: 'suporte',
  acomp_codigo: 'ABC234', acomp_expira_em: '2099-01-01T00:00:00Z', created_at: '2026-10-01T10:00:00Z',
  previsao_entrega: DEV_DATA, ...extra,
})
const cardDev = () => ({ id: 'd1', ticket_number: 'TCK000100', title: 'Card dev', status: 'em_desenvolvimento', quadro: 'dev', previsao_entrega: DEV_DATA })
const sla = (extra) => ({ id: 's1', ticket_id: 't1', resolution_deadline: SLA_DATA, escalated: true, escalated_to: 'ALEX-SECRETO', first_response_at: '2026-10-01T10:05:00Z', created_at: '2026-10-01T10:00:00Z', ...extra })

async function rodar(cod, { tickets, slas, semModelo = false, leituraFalha = false, ignorarFiltro = false, codigo = 'ABC234' } = {}) {
  const leituras = []
  const h = compilar(cod)
  const linhas = (tickets || [t1()]).map((x) => ({ ...x }))
  const models = {
    Ticket: {
      findMany: async (a) => linhas.filter((x) => Object.entries(a || {}).every(([k, v]) => String(x[k] ?? '') === String(v))).map((x) => ({ ...x })),
      update: async (id, p) => { const x = linhas.find((y) => y.id === id); if (x) Object.assign(x, p) },
    },
    ActivityLog: { findMany: async () => [{ id: 'l1', ticket_id: 't1', action: 'status_changed', details: { from: 'triagem', to: 'em_atendimento', previsao_entrega: DEV_DATA }, created_at: '2026-10-01T11:00:00Z' }] },
    TicketMessage: { findMany: async () => [{ id: 'm1', ticket_id: 't1', message: 'Olá', is_internal: false, created_at: '2026-10-01T12:00:00Z', user_id: 'u1' }] },
  }
  if (!semModelo) {
    models.SLATracking = {
      // a camada da plataforma: a linha mais RECENTE (gravada por último) primeiro, e `limit` corta
      findMany: async (a) => {
        leituras.push({ ...(a || {}) })
        if (leituraFalha) throw new Error('boom')
        const casam = (slas || []).filter((x) => ignorarFiltro || Object.entries(a || {}).every(([k, v]) => ['limit', 'offset'].includes(k) || String(x[k] ?? '') === String(v)))
        return casam.slice().reverse().slice(0, Number((a || {}).limit) || 500).map((x) => ({ ...x }))
      },
    }
  }
  const r = await h({ params: {}, query: {}, headers: {}, body: { numero: 'TCK000100', codigo }, models, reply: reply() })
  return { status: r.status, corpo: r.body, texto: JSON.stringify(r.body), leituras }
}

async function bateria(cod = ROTA) {
  const f = []
  const t = (nome, cond, det) => { if (!cond) f.push(nome + (det !== undefined ? ' ' + JSON.stringify(det).slice(0, 220) : '')) }

  let r = await rodar(cod, { slas: [sla()] })
  t('com SLA: 200 e prazo_atendimento = o prazo do SLA', r.status === 200 && r.corpo.data.prazo_atendimento === SLA_DATA, r.corpo)
  t('com SLA: a previsão do dev não aparece em lugar nenhum', !r.texto.includes('2031-03-17') && !('previsao' in r.corpo.data), r.texto)
  t('a lista de campos é fechada', JSON.stringify(Object.keys(r.corpo.data).sort()) === JSON.stringify(['aberto_em', 'encerrado', 'etapa', 'linha_do_tempo', 'numero', 'prazo_atendimento', 'resolvido_em', 'titulo']), Object.keys(r.corpo.data))
  t('do SLA só sai o prazo (nenhum campo interno)', !/ALEX-SECRETO|escalated|first_response|breached|minutes/.test(r.texto), r.texto)

  r = await rodar(cod, { slas: [] })
  t('sem SLA (nenhuma linha), com previsão do dev: prazo nulo e a data do dev fora da resposta', r.corpo.data.prazo_atendimento === null && !r.texto.includes('2031-03-17'), r.texto)
  r = await rodar(cod, { slas: [sla({ resolution_deadline: null })] })
  t('linha de SLA sem prazo: nulo, sem cair na previsão do dev', r.corpo.data.prazo_atendimento === null && !r.texto.includes('2031-03-17'), r.texto)
  r = await rodar(cod, { slas: [sla({ resolution_deadline: 'não é data' })] })
  t('prazo ilegível: nulo', r.corpo.data.prazo_atendimento === null && !r.texto.includes('2031-03-17'), r.texto)
  r = await rodar(cod, { semModelo: true })
  t('modelo SLATracking ausente: nulo, sem erro e sem a data do dev', r.status === 200 && r.corpo.data.prazo_atendimento === null && !r.texto.includes('2031-03-17'), r.texto)
  r = await rodar(cod, { slas: [sla()], leituraFalha: true })
  t('leitura do SLA falhando: nulo, sem erro e sem a data do dev', r.status === 200 && r.corpo.data.prazo_atendimento === null && !r.texto.includes('2031-03-17'), r.texto)

  // o dev define / reestima: a resposta não muda
  const a = await rodar(cod, { tickets: [t1({ previsao_entrega: '2031-03-17T12:00:00' })], slas: [sla()] })
  const b = await rodar(cod, { tickets: [t1({ previsao_entrega: '2031-09-30T12:00:00', esforco_entrega: 'dois_sprints' })], slas: [sla()] })
  const c0 = await rodar(cod, { tickets: [t1({ previsao_entrega: null })], slas: [sla()] })
  t('o dev definir/reestimar a previsão deixa a resposta IDÊNTICA', a.texto === b.texto && a.texto === c0.texto && a.texto.length > 100, [a.texto.length, b.texto.length])

  // de quem é o SLA
  r = await rodar(cod, { tickets: [t1(), cardDev()], slas: [sla({ ticket_id: 'd1', resolution_deadline: '2040-01-01T00:00:00.000Z', id: 's2' })] })
  t('o SLA do card Dev (mesmo NÚMERO, id diferente) não entra', r.corpo.data.prazo_atendimento === null && !r.texto.includes('2040'), r.texto)
  r = await rodar(cod, { ignorarFiltro: true, tickets: [t1(), cardDev()], slas: [sla({ ticket_id: 'd1', resolution_deadline: '2040-01-01T00:00:00.000Z', id: 's2' })] })
  t('mesmo se a camada devolvesse a linha do card Dev, a conferência pelo ID do chamado a exclui', r.corpo.data.prazo_atendimento === null && !r.texto.includes('2040'), r.texto)
  r = await rodar(cod, { slas: [sla({ ticket_id: 'outro', resolution_deadline: '2040-01-01T00:00:00.000Z' })] })
  t('o SLA de OUTRO chamado não entra', r.corpo.data.prazo_atendimento === null && !r.texto.includes('2040'), r.texto)
  // a conferência em JS vale mesmo que a camada devolva linhas de outros chamados
  r = await rodar(cod, { ignorarFiltro: true, slas: [sla({ id: 'z', ticket_id: 'outro', resolution_deadline: '2040-01-01T00:00:00.000Z', created_at: '2026-12-01T10:00:00Z' }), sla({ id: 'y', resolution_deadline: '2031-02-10T15:30:00.000Z', created_at: '2026-10-01T10:00:00Z' })] })
  t('camada que ignora o filtro: ainda assim só o SLA deste chamado', r.corpo.data.prazo_atendimento === '2031-02-10T15:30:00.000Z' && !r.texto.includes('2040'), r.texto)
  // várias linhas: o código CONFIA na ordenação da plataforma (a mais recente primeiro) e pede só uma
  r = await rodar(cod, { slas: [sla({ id: 'a', resolution_deadline: '2031-01-01T00:00:00.000Z' }), sla({ id: 'c', resolution_deadline: '2031-02-02T00:00:00.000Z' }), sla({ id: 'b', resolution_deadline: '2031-05-05T00:00:00.000Z' })] })
  t('várias linhas: vale a gravada por último (a plataforma ordena; o código não reordena)', r.corpo.data.prazo_atendimento === '2031-05-05T00:00:00.000Z', r.corpo.data.prazo_atendimento)
  const lido = r.leituras.find((x) => 'ticket_id' in x)
  t('a leitura do SLA é filtrada por ticket_id do chamado de suporte e pede UMA linha (limit: 1)', lido && lido.ticket_id === 't1' && lido.limit === 1, r.leituras)
  // grafia camelCase na linha que já está em mãos
  r = await rodar(cod, { slas: [{ id: 's9', ticket_id: 't1', resolutionDeadline: '2031-07-07T00:00:00.000Z', created_at: '2026-10-01T10:00:00Z' }] })
  t('a linha com resolutionDeadline (camelCase) também é lida', r.corpo.data.prazo_atendimento === '2031-07-07T00:00:00.000Z', r.corpo.data.prazo_atendimento)

  // resolvido / encerrado (dentro dos 7 dias em que a página ainda abre)
  const RES = new Date(Date.now() - 3600 * 1000).toISOString()
  for (const st of ['resolvido', 'resolvido_com_manual', 'fechado', 'post_mortem']) {
    r = await rodar(cod, { tickets: [t1({ status: st, resolved_at: RES })], slas: [sla()] })
    t(`chamado ${st}: sem prazo de atendimento, e o resolvido_em segue`, r.status === 200 && r.corpo.data.prazo_atendimento === null && r.corpo.data.resolvido_em === RES, r.texto)
  }
  r = await rodar(cod, { tickets: [t1({ status: 'fechado', updated_at: RES })], slas: [sla()] })
  t('chamado encerrado SEM resolved_at (só o status): sem prazo', r.status === 200 && r.corpo.data.prazo_atendimento === null, r.texto)
  r = await rodar(cod, { tickets: [t1({ status: 'resolvido', updated_at: RES })], slas: [sla()] })
  t('chamado resolvido SEM resolved_at (só o status): sem prazo', r.status === 200 && r.corpo.data.prazo_atendimento === null, r.texto)
  r = await rodar(cod, { tickets: [t1({ status: 'em_atendimento', resolved_at: RES })], slas: [sla()] })
  t('com resolved_at preenchido, mesmo que o status ainda não diga: sem prazo', r.corpo.data.prazo_atendimento === null, r.texto)

  // o resto da rota
  r = await rodar(cod, { slas: [sla()], codigo: 'ZZZZZ9' })
  t('código errado: 400 com a resposta única e nada do chamado', r.status === 400 && r.corpo.error === 'Número ou código inválido.' && !/prazo|TCK/.test(r.texto), r.texto)
  return f
}

// A tela: lê `prazo_atendimento` (e não mais `previsao`) e só mostra quando vier. Teste de TEXTO, e dito assim.
const path = require('path')
const PAGINA = fs.readFileSync(path.resolve(__dirname, '../../app/(public)/acompanhar/page.tsx'), 'utf8')
const paginaSemComentarios = PAGINA.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
function tela(txt) {
  const f = []
  if (!/prazo_atendimento:\s*string \| null/.test(txt)) f.push('tipo-sem-prazo_atendimento')
  if (!/dados\.prazo_atendimento\s*\?[^:]*prazo de atendimento:/.test(txt)) f.push('legenda-ou-condicao')
  if (/previsao\b/.test(txt)) f.push('ainda-le-previsao')
  return f
}
;(async () => {
  const f0 = await bateria()
  ok('a bateria passa limpa', f0.length === 0, f0)
  ok('a tela lê `prazo_atendimento` com a legenda "prazo de atendimento" e não lê mais `previsao`', tela(paginaSemComentarios).length === 0, tela(paginaSemComentarios))
  ok('mutação "a tela volta a ler previsao" é pega', tela(paginaSemComentarios + '\nconst x = dados.previsao').includes('ainda-le-previsao'))
  ok('mutação "a tela perde a condição" é pega', tela(paginaSemComentarios.replace('dados.prazo_atendimento ?', 'true ?')).includes('legenda-ou-condicao'))
  const muts = [
    ['cai na previsão do dev quando não há SLA', 'prazo_atendimento: prazoAtendimento,', 'prazo_atendimento: prazoAtendimento || t.previsao_entrega || null,'],
    ['a chave previsao volta', 'prazo_atendimento: prazoAtendimento,', 'prazo_atendimento: prazoAtendimento, previsao: t.previsao_entrega || null,'],
    ['devolve o objeto do SLA', 'if (!isNaN(dlMs)) prazoAtendimento = new Date(dlMs).toISOString();', 'if (!isNaN(dlMs)) prazoAtendimento = trilhas[0];'],
    ['ignora o ticket_id da linha', 'return x && String(x.ticket_id || x.ticketId || "") === String(t.id);', 'return !!x;'],
    ['a leitura perde o limit: 1', '{ ticket_id: t.id, limit: 1 }', '{ ticket_id: t.id }'],
    ['a leitura filtra por outra chave', '{ ticket_id: t.id, limit: 1 }', '{ ticket_id: t.ticket_number, limit: 1 }'],
    ['só lê a grafia snake do prazo', 'trilhas[0].resolution_deadline || trilhas[0].resolutionDeadline', 'trilhas[0].resolution_deadline'],
    ['o encerrado só olha o resolved_at', 'TERMINAIS.indexOf(String(t.status || "")) >= 0 || !!t.resolved_at;', '!!t.resolved_at;'],
    ['mostra o prazo depois de encerrado', 'if (Track && !encerrado) {', 'if (Track) {'],
    ['só olha o status, não o resolved_at', 'TERMINAIS.indexOf(String(t.status || "")) >= 0 || !!t.resolved_at;', 'TERMINAIS.indexOf(String(t.status || "")) >= 0;'],
    ['leitura que falha vira erro para o cliente', '} catch (e) { prazoAtendimento = null; }', '} catch (e) { throw e; }'],
    ['data ilegível passa direto', 'if (!isNaN(dlMs)) prazoAtendimento = new Date(dlMs).toISOString();', 'prazoAtendimento = dl || null;'],
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
