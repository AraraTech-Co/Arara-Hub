// A mensagem que chega num grupo sem nome deixa de esperar a busca do nome.
//
// O webhook de entrada (485) perguntava o nome do grupo à Avisa DENTRO do
// processamento da mensagem, antes de seguir: até 2 chamadas de 8 s. Agora:
//   1. grava o carimbo `nome_tentado_em` (o mesmo patch de sempre, com o
//      `updated_at: ts` que levanta a conversa) e SÓ ENTÃO dispara a busca;
//   2. a busca roda sem ser aguardada e, ao voltar, relê a conversa e grava
//      SÓ o `contact_name` — e só se ela continuar sem nome e sem `nome_manual`.
//
// POR QUE NÃO HÁ O QUE ESPERAR (e este arquivo prende essa premissa): o nome
// achado era repassado a `conv` para uso do `_triagem` — avisos ao atendente e
// `{{nome}}` do bot —, e o `_triagem` NÃO RODA PARA GRUPO ("bot em grupo é o pior
// defeito possível"). Se um dia o bot passar a rodar em grupo, o caso
// "grupo não gera aviso" abaixo reprova, e é o sinal de que esta premissa mudou.
//
// O que prova: a mensagem é gravada e o webhook responde com a Avisa ainda sem
// responder; a gravação tardia acontece mesmo depois da resposta; resposta,
// mensagem e estado final são IDÊNTICOS aos de antes (laço antigo reinserido);
// a corrida com o nome digitado; a janela de 30 min.
// O que NÃO prova: tempo em produção, e durabilidade (reinício perde a busca).
//
// Roda com: node nome-de-grupo-fora-do-webhook.test.js
const fs = require('fs')
const vm = require('vm')
const { META } = require('./_camada.js')
const { reply, ok, fim, ARQ } = require('./_carregar.js')

function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}

// Relógio e sorteio FIXOS, para o código novo e o de antes poderem ser
// comparados sem diferença de milissegundo ou de id sorteado.
const FIXO = Date.parse('2026-10-16T12:00:00.000Z')
class DataFixa extends Date {
  constructor(...a) { if (a.length) super(...a); else super(FIXO) }
  static now() { return FIXO }
}
function compilar(codigo) {
  let semente = 12345
  const MathFixa = Object.create(Math)
  MathFixa.random = () => ((semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const c = {
    console, Date: DataFixa, JSON, String, Number, Object, Array, Math: MathFixa, Promise, parseInt,
    parseFloat, isNaN, isFinite, RegExp, Buffer, Error, TypeError,
    encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
    module: { exports: {} },
  }
  c.exports = c.module.exports
  c.globalThis = c
  vm.createContext(c)
  vm.runInContext(codigo, c)
  return c.module.exports.handler
}

// O bloco de ANTES, devolvido ao lugar como referência: aguardava a Avisa,
// gravava carimbo e nome num só patch e repassava o nome a `conv`.
const BLOCO_ANTIGO = `  // Grupo sem nome (webhook sem GroupName): pergunta à Avisa, no máximo a
  // cada 30 min por grupo.
  if (ehGrupoConv && !(conv.contact_name || conv.contactName) && conv.nome_manual !== true && _podeTentarNome(conv, Date.now())) {
    try {
      var _nomeG = await _nomeDoGrupoAvisa(ctx, phone, _contaDaConversa(conv) || _contaDaMensagem);
      var _patchNome = { nome_tentado_em: ts, updated_at: ts };
      if (_nomeG) _patchNome.contact_name = _nomeG;
      await Conv.update(conv.id, _patchNome);
      conv = Object.assign({}, conv, _patchNome);
    } catch (e) {}
  }
`
const cod = codigoDe('485 whatsapp POST /whatsapp/inbound')
const INI = '  // Grupo sem nome (webhook sem GroupName): pergunta à Avisa, no máximo a\n'
const FIM = '  // ── O eco da nossa própria resposta (14/10/2026)'
const a = cod.indexOf(INI), b = cod.indexOf(FIM)
if (a < 0 || b < 0 || b < a) throw new Error('não achei o bloco novo para montar a referência')
const NOVO = compilar(cod)
const ANTIGO = compilar(cod.slice(0, a) + BLOCO_ANTIGO + cod.slice(b))

// ── cenário ─────────────────────────────────────────────────────────────────
const SEGREDO = 'segredo-da-rota'
const JID_CLIENTE = '5519999990001@s.whatsapp.net'
const JID_GRUPO = '120363123456@g.us'
const iso = (minAtras) => new Date(FIXO - minAtras * 60000).toISOString()

function corpoGrupo(texto = 'oi do grupo', chat = JID_GRUPO) {
  return { jsonData: JSON.stringify({ event: {
    Info: { Chat: chat, Sender: JID_CLIENTE, PushName: 'Cliente', ID: 'WA_' + texto.replace(/\W/g, ''), IsFromMe: false, IsGroup: chat.endsWith('@g.us') },
    Message: { conversation: texto },
  } }) }
}

function mundo({ conversa, fetchResponde, falhaCarimbo = false }) {
  const e = { conversas: conversa ? [{ ...conversa }] : [], mensagens: [], eventos: [], fila: [], notificacoes: [], fetchs: [], updates: [] }
  const filtra = (lista, arg) => {
    // `limit`/`offset` não são campos de filtro na camada (`metaKeys`).
    const ch = Object.keys(arg || {}).filter((k) => !META.includes(k))
    return ch.length ? lista.filter((x) => ch.every((k) => String(x[k] ?? '') === String(arg[k]))) : lista
  }
  const Conv = {
    findById: async (id) => { const c = e.conversas.find((x) => x.id === id); return c ? { ...c } : null },
    findMany: async (arg) => filtra(e.conversas, arg).map((c) => ({ ...c })),
    create: async (c) => { e.conversas.push({ ...c }); return { ...c } },
    update: async (id, p) => {
      e.updates.push({ id, p: { ...p } })
      if (falhaCarimbo && 'nome_tentado_em' in p) throw new Error('falha de gravação')
      const c = e.conversas.find((x) => x.id === id)
      Object.assign(c, p)
      return { ...c }
    },
  }
  const vazio = { findMany: async () => [], findById: async () => null }
  const models = {
    WhatsAppConversation: Conv,
    WhatsAppMessage: {
      findMany: async (arg) => filtra(e.mensagens, arg), findById: async () => null,
      create: async (m) => { e.mensagens.push({ ...m }); return m }, update: async () => null,
    },
    WaConversationEvents: {
      findMany: async (arg) => filtra(e.eventos, arg).slice(0, 500),
      create: async (x) => { e.eventos.push({ ...x }); return x },
    },
    PushInscricao: { findMany: async () => [{ id: 'i1', user_id: 'u9' }] },
    PushNaFila: { create: async (x) => { e.fila.push({ ...x }); return x } },
    Profile: { findById: async () => ({ id: 'u9', role: 'support', full_name: 'Dono', active: true }), findMany: async () => [] },
    Sessao: { findById: async () => null },
    SystemSettings: { findMany: async () => [{ id: 's1', waGruposEnabled: true, waMenuEnabled: false }], update: async () => ({}) },
    SupportSchedule: vazio, WaFlows: vazio, Company: vazio, CompanyContact: vazio, Contact: vazio, Ticket: vazio,
    Unit: vazio, ClientUser: vazio, WaConta: vazio, WaTags: vazio, WaConversationTags: vazio,
  }
  const ctx = (body) => ({
    params: {}, headers: {}, query: { token: SEGREDO }, body, models,
    secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
    fetch: (url, init) => { e.fetchs.push({ url, body: init && init.body }); return fetchResponde(url, init) },
    notify: async (n) => { e.notificacoes.push(n); return {} },
    reply: reply(),
  })
  return { e, Conv, ctx }
}
const grupoSemNome = (extra) => ({
  id: 'g1', status: 'open', remote_jid: JID_GRUPO, is_group: true, phase: 'novo',
  created_at: iso(900), updated_at: iso(900), ...extra,
})
// Avisa que responde na hora, e Avisa que só responde quando o teste manda.
const imediata = (nome) => () => Promise.resolve({ status: 200, body: JSON.stringify({ name: nome }) })
function manual() {
  const pendentes = []
  const f = () => new Promise((resolve) => { pendentes.push(resolve) })
  f.pendentes = pendentes
  f.liberar = (nome) => { while (pendentes.length) pendentes.shift()({ status: 200, body: JSON.stringify({ name: nome }) }) }
  return f
}
const aTempo = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r('__TRAVOU__'), ms))])
const folga = () => new Promise((r) => setTimeout(r, 30))
// Os ids sorteados mudam de ordem entre as duas execuções; o conteúdo, não.
const norm = (x) => JSON.stringify(x).replace(/\b([a-z]{2,8}_)[0-9a-z]{6,}\b/g, '$1#')
const buscasDeNome = (e) => e.fetchs.filter((f) => /group\/(info|list)/.test(f.url)).length

;(async () => {
  // ═══ 1. o webhook RESPONDE e a mensagem já está gravada, com a Avisa pendente ═══
  {
    const f = manual()
    const w = mundo({ conversa: grupoSemNome(), fetchResponde: f })
    const r = await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
    ok('o webhook responde com a Avisa ainda sem responder (não trava)', r !== '__TRAVOU__' && r.status === 200, r === '__TRAVOU__' ? 'travou' : r.status)
    ok('  a mensagem já está gravada quando o webhook responde', w.e.mensagens.length === 1, w.e.mensagens.length)
    ok('  o carimbo já está gravado, e a busca está em voo', !!w.e.conversas[0].nome_tentado_em && f.pendentes.length === 1, { carimbo: w.e.conversas[0].nome_tentado_em, emVoo: f.pendentes.length })
    ok('  o nome ainda não está (a busca não terminou)', !w.e.conversas[0].contact_name, w.e.conversas[0].contact_name)
    f.liberar('Grupo X')
  }

  // ═══ 2. O TEMPO ESGOTADO NÃO PERDE A GRAVAÇÃO: a busca volta DEPOIS da resposta ═══
  {
    const f = manual()
    const w = mundo({ conversa: grupoSemNome(), fetchResponde: f })
    const r = await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
    await folga()
    ok('antes de a Avisa responder: webhook respondido e nome ausente', r.status === 200 && !w.e.conversas[0].contact_name, w.e.conversas[0])
    f.liberar('Grupo Tardio')
    await folga()
    ok('a busca volta DEPOIS da resposta e o contact_name acaba gravado', w.e.conversas[0].contact_name === 'Grupo Tardio', w.e.conversas[0])
  }

  // ═══ 3. A CORRIDA: nome digitado enquanto a busca voa não é atropelado ═══
  {
    const f = manual()
    const w = mundo({ conversa: grupoSemNome(), fetchResponde: f })
    await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
    await folga()
    await w.Conv.update('g1', { contact_name: 'Digitado pelo atendente', nome_manual: true })
    f.liberar('Nome da Avisa')
    await folga()
    ok('nome digitado + nome_manual durante a busca NÃO é sobrescrito', w.e.conversas[0].contact_name === 'Digitado pelo atendente', w.e.conversas[0])
  }
  {
    const f = manual()
    const w = mundo({ conversa: grupoSemNome(), fetchResponde: f })
    await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
    await folga()
    await w.Conv.update('g1', { nome_manual: true })
    f.liberar('Nome da Avisa')
    await folga()
    ok('nome_manual ligado durante a busca também impede a gravação', !w.e.conversas[0].contact_name, w.e.conversas[0])
  }
  {
    // Nome que chegou por OUTRA via (sem nome_manual): isola a checagem de contact_name.
    const f = manual()
    const w = mundo({ conversa: grupoSemNome(), fetchResponde: f })
    await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
    await folga()
    await w.Conv.update('g1', { contact_name: 'Nome vindo de outra via' })
    f.liberar('Nome da Avisa')
    await folga()
    ok('nome gravado por outra via (sem nome_manual) NÃO é sobrescrito', w.e.conversas[0].contact_name === 'Nome vindo de outra via', w.e.conversas[0])
  }

  // ═══ 4. a janela de 30 min vale: a segunda mensagem não busca de novo ═══
  {
    const f = manual()
    const w = mundo({ conversa: grupoSemNome(), fetchResponde: f })
    await aTempo(NOVO(w.ctx(corpoGrupo('primeira'))), 1500)
    await folga()
    await aTempo(NOVO(w.ctx(corpoGrupo('segunda'))), 1500)
    await aTempo(NOVO(w.ctx(corpoGrupo('terceira'))), 1500)
    await folga()
    ok('três mensagens seguidas no mesmo grupo: UMA busca só', f.pendentes.length === 1 && buscasDeNome(w.e) === 1, { emVoo: f.pendentes.length, buscas: buscasDeNome(w.e) })
    ok('  e as três mensagens foram gravadas', w.e.mensagens.length === 3, w.e.mensagens.length)
    f.liberar('Grupo X')
  }

  // ═══ 5. carimbo que falha NÃO dispara a busca ═══
  {
    const f = manual()
    const w = mundo({ conversa: grupoSemNome(), fetchResponde: f, falhaCarimbo: true })
    const r = await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
    await folga()
    ok('carimbo que falha: o webhook ainda responde e grava a mensagem', r.status === 200 && w.e.mensagens.length === 1, { s: r.status, m: w.e.mensagens.length })
    ok('  e a busca NÃO dispara (senão viraria uma busca por mensagem)', f.pendentes.length === 0 && buscasDeNome(w.e) === 0, { emVoo: f.pendentes.length })
  }

  // ═══ 6. quem NÃO deve ser buscado continua não sendo ═══
  {
    for (const [rotulo, conversa] of [
      ['grupo que já tem nome', grupoSemNome({ contact_name: 'Já tem nome' })],
      ['grupo com nome_manual', grupoSemNome({ nome_manual: true })],
      ['grupo tentado há 5 min (dentro da janela)', grupoSemNome({ nome_tentado_em: iso(5) })],
    ]) {
      const f = manual()
      const w = mundo({ conversa, fetchResponde: f })
      await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
      await folga()
      ok(rotulo + ': nenhuma busca', f.pendentes.length === 0 && buscasDeNome(w.e) === 0, buscasDeNome(w.e))
    }
    const f = manual()
    const w = mundo({ conversa: grupoSemNome({ nome_tentado_em: iso(45) }), fetchResponde: f })
    await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
    await folga()
    ok('grupo tentado há 45 min (fora da janela): busca', f.pendentes.length === 1, f.pendentes.length)
    f.liberar('Grupo X')
  }

  // ═══ 7. `updated_at` do carimbo fica; a gravação do nome não mexe nele ═══
  {
    const f = manual()
    const w = mundo({ conversa: grupoSemNome(), fetchResponde: f })
    await aTempo(NOVO(w.ctx(corpoGrupo())), 1500)
    await folga()
    const depoisDoCarimbo = w.e.conversas[0].updated_at
    f.liberar('Grupo X')
    await folga()
    ok('o updated_at do carimbo é o da mensagem e não muda quando o nome chega',
      w.e.conversas[0].contact_name === 'Grupo X' && w.e.conversas[0].updated_at === depoisDoCarimbo, { antes: depoisDoCarimbo, depois: w.e.conversas[0].updated_at })
    const gravacaoDoNome = w.e.updates.find((u) => 'contact_name' in u.p)
    ok('  a gravação do nome escreve SÓ contact_name', gravacaoDoNome && Object.keys(gravacaoDoNome.p).join() === 'contact_name', gravacaoDoNome)
  }

  // ═══ 8. IDENTIDADE com o código de antes: Avisa respondendo na hora ═══
  {
    const a = mundo({ conversa: grupoSemNome(), fetchResponde: imediata('Grupo Rapido') })
    const b = mundo({ conversa: grupoSemNome(), fetchResponde: imediata('Grupo Rapido') })
    const rn = await aTempo(NOVO(a.ctx(corpoGrupo())), 1500)
    await folga()
    const ra = await aTempo(ANTIGO(b.ctx(corpoGrupo())), 1500)
    await folga()
    ok('o nome do grupo foi gravado nos dois', a.e.conversas[0].contact_name === 'Grupo Rapido' && b.e.conversas[0].contact_name === 'Grupo Rapido', [a.e.conversas[0].contact_name, b.e.conversas[0].contact_name])
    ok('resposta do webhook IDÊNTICA à de antes', norm(rn) === norm(ra) && rn.status === 200, { rn, ra })
    ok('conversa final IDÊNTICA à de antes (inclui nome, carimbo e updated_at)', norm(a.e.conversas) === norm(b.e.conversas), { a: a.e.conversas, b: b.e.conversas })
    ok('mensagem gravada IDÊNTICA à de antes', norm(a.e.mensagens) === norm(b.e.mensagens) && a.e.mensagens.length === 1, { a: a.e.mensagens, b: b.e.mensagens })
    ok('eventos (a sonda que fica) IDÊNTICOS aos de antes', norm(a.e.eventos) === norm(b.e.eventos), { a: a.e.eventos, b: b.e.eventos })
    ok('fila de push e sino IDÊNTICOS aos de antes', norm([a.e.fila, a.e.notificacoes]) === norm([b.e.fila, b.e.notificacoes]), { a: [a.e.fila, a.e.notificacoes], b: [b.e.fila, b.e.notificacoes] })
    ok('as chamadas à Avisa são as mesmas, na mesma ordem', norm(a.e.fetchs) === norm(b.e.fetchs), { a: a.e.fetchs.map((f) => f.url), b: b.e.fetchs.map((f) => f.url) })
  }

  // ═══ 9. A PREMISSA: grupo não gera aviso, nem com dono e com a Avisa respondendo ═══
  // É por isto que não há o que esperar. Se o bot passar a rodar em grupo, este
  // caso reprova — e é o aviso de que o nome volta a ter consumidor.
  {
    const dono = grupoSemNome({ assigned_to_id: 'u9', phase: 'em_atendimento' })
    const b = mundo({ conversa: dono, fetchResponde: imediata('Grupo Com Dono') })
    await aTempo(ANTIGO(b.ctx(corpoGrupo())), 1500)
    await folga()
    ok('PREMISSA (código de antes): grupo com dono e nome achado NÃO gera push nem sino',
      b.e.fila.length === 0 && b.e.notificacoes.length === 0 && b.e.conversas[0].contact_name === 'Grupo Com Dono',
      { fila: b.e.fila, sino: b.e.notificacoes })
  }
  {
    // Controle: o harness ENXERGA aviso quando existe. Conversa de PESSOA com dono
    // gera o push "Mensagem de …" nos dois códigos, e idêntico.
    const pessoa = { id: 'p1', status: 'open', remote_jid: JID_CLIENTE, phase: 'em_atendimento', assigned_to_id: 'u9', contact_name: 'Fulano', created_at: iso(900), updated_at: iso(900) }
    const corpoPessoa = { jsonData: JSON.stringify({ event: { Info: { Chat: JID_CLIENTE, Sender: JID_CLIENTE, PushName: 'Fulano', ID: 'WA_P1', IsFromMe: false }, Message: { conversation: 'preciso de ajuda' } } }) }
    const a = mundo({ conversa: pessoa, fetchResponde: imediata('x') })
    const b = mundo({ conversa: pessoa, fetchResponde: imediata('x') })
    await aTempo(NOVO(a.ctx(corpoPessoa)), 1500)
    await aTempo(ANTIGO(b.ctx(corpoPessoa)), 1500)
    await folga()
    ok('controle: conversa de pessoa com dono gera o push, e o teste o enxerga', a.e.fila.length >= 1 && /Fulano/.test(JSON.stringify(a.e.fila)), a.e.fila)
    ok('  e o push é IDÊNTICO ao de antes', norm(a.e.fila) === norm(b.e.fila), { a: a.e.fila, b: b.e.fila })
  }

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
