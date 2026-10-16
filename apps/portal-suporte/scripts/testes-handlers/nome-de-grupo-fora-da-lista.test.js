// O nome do grupo deixa de ser buscado DENTRO da lista de conversas.
//
// A lista (432) percorria cada grupo aberto sem nome, em série, e aguardava a
// Avisa (até 2 chamadas de 8 s por grupo) antes de responder. Agora:
//   1. escolhe até 3 grupos, com os mesmos filtros e a janela de 30 min;
//   2. grava o carimbo `nome_tentado_em` ANTES de responder;
//   3. dispara a busca sem aguardar e responde;
//   4. a busca, ao voltar, relê a conversa e só grava o nome se ela continuar
//      sem nome e sem `nome_manual`.
//
// Visível: o nome real do grupo chega na consulta SEGUINTE, não na mesma.
//
// A CORRIDA É O PONTO MAIS IMPORTANTE DESTE ARQUIVO. Antes não existia: a
// gravação do nome era síncrona dentro da requisição, então ninguém podia
// renomear no meio. Com a busca em segundo plano o atraso CRIA a corrida, e
// atropelar o nome que o atendente digitou seria pior que o defeito consertado.
// O caso "nome digitado enquanto a busca voa" tem teste próprio e mutação.
//
// O que NÃO prova: tempo em produção, e durabilidade (processo reiniciado no
// meio perde aquela busca; a próxima tentativa só vem depois da janela).
//
// Roda com: node nome-de-grupo-fora-da-lista.test.js
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
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt,
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

// O laço de ANTES, devolvido ao lugar para servir de referência: ele aguardava
// a Avisa e gravava carimbo e nome na própria requisição.
const LACO_ANTIGO = `  var _agoraMs = Date.now();
  for (var g = 0; g < rows.length; g++) {
    var cg = rows[g];
    var _jidG = String(cg.remote_jid || cg.remoteJid || "");
    var _ehG = cg.is_group === true || /@g\\.us$/i.test(_jidG);
    if (!_ehG || String(cg.status || "open") === "closed") continue;
    if (cg.contact_name || cg.contactName) continue;
    if (cg.nome_manual === true) continue;
    if (!_podeTentarNome(cg, _agoraMs)) continue;
    try {
      var _nomeG = await _nomeDoGrupoAvisa(ctx, _jidG, _contaDaConversa(cg));
      var _p = { nome_tentado_em: nowIso(), updated_at: cg.updated_at || cg.updatedAt || nowIso() };
      if (_nomeG) _p.contact_name = _nomeG;
      await m.Conv.update(cg.id, _p);
      rows[g] = Object.assign({}, cg, _p);
    } catch (e) {}
  }
`
const cod = codigoDe('432 whatsapp GET /whatsapp')
const ini = cod.indexOf('  var _agoraMs = Date.now();\n  var _TETO_NOMES_POR_LISTA = ')
const fimLaco = cod.indexOf('  rows.sort(function (a, b) {\n    return String(b.updated_at', ini)
if (ini < 0 || fimLaco < 0) throw new Error('não achei o laço novo para montar a referência')
const HANDLER_NOVO = compilar(cod)
const HANDLER_ANTIGO = compilar(cod.slice(0, ini) + LACO_ANTIGO + cod.slice(fimLaco))

// ── mundo ───────────────────────────────────────────────────────────────────
const AGORA = Date.now()
const iso = (minAtras) => new Date(AGORA - minAtras * 60000).toISOString()
const grupo = (id, extra) => ({
  id, status: 'open', remote_jid: `1203630000${id}@g.us`,
  updated_at: iso(10), created_at: iso(500), ...extra,
})

function mundo({ convs, fetchResponde, falhaCarimboEm = null }) {
  const guardadas = convs.map((c) => ({ ...c }))
  const w = { convs: guardadas, fetchs: [], updates: [], carimbadasQuandoRespondeu: null }
  const atual = (id) => guardadas.find((c) => c.id === id)
  w.Conv = {
    findMany: async () => guardadas.map((c) => ({ ...c })),
    findById: async (id) => { const c = atual(id); return c ? { ...c } : null },
    update: async (id, patch) => {
      w.updates.push({ id, patch: { ...patch } })
      if (falhaCarimboEm === id && 'nome_tentado_em' in patch) throw new Error('falha de gravação')
      Object.assign(atual(id), patch)
      return { ...atual(id) }
    },
  }
  const vazio = { findMany: async () => [], findById: async () => null }
  w.ctx = () => ({
    params: {}, query: {}, body: {}, headers: {},
    user: { id: 'u1' },
    secrets: { get: async () => 'tok' },
    fetch: (url, init) => { w.fetchs.push({ url, init }); return fetchResponde(url, init, w) },
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      WhatsAppConversation: w.Conv,
      WhatsAppMessage: vazio,
      SystemSettings: vazio, WaDepartment: vazio, Company: vazio, CompanyContact: vazio,
      Ticket: vazio, WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio,
      WaConversationEvents: vazio,
    },
    reply: reply(),
  })
  return w
}

const imediato = (nome) => (url, init) => {
  const jid = (init && init.body) ? String(JSON.parse(init.body).groupId || '') : ''
  return Promise.resolve({ status: 200, body: JSON.stringify({ name: nome(jid) }) })
}
// Fetch que SÓ responde quando o teste manda — a janela "busca em voo" existe de verdade.
function manual() {
  const pendentes = []
  const f = (url, init) => new Promise((resolve) => { pendentes.push({ url, init, resolve }) })
  f.pendentes = pendentes
  f.liberar = (nome) => {
    while (pendentes.length) {
      const p = pendentes.shift()
      const jid = p.init && p.init.body ? String(JSON.parse(p.init.body).groupId || '') : ''
      p.resolve({ status: 200, body: JSON.stringify({ name: nome(jid) }) })
    }
  }
  return f
}
const aTempo = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r('__TRAVOU__'), ms))])
const folga = () => new Promise((r) => setTimeout(r, 25))
const nomesDe = (r) => Object.fromEntries((r.body.data || []).map((c) => [c.id, c.contact_name]))
const nomeDe = (jid) => 'Nome ' + jid.slice(-6)

;(async () => {
  // ═══ 1. a lista RESPONDE com a busca ainda em voo ═══════════════════════
  {
    const f = manual()
    const w = mundo({ convs: [grupo('1'), grupo('2'), grupo('3')], fetchResponde: f })
    const r = await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    ok('a lista responde com a Avisa ainda sem responder (não trava)', r !== '__TRAVOU__' && r.status === 200, r === '__TRAVOU__' ? 'travou' : r.status)
    await folga()
    ok('  as buscas estão em voo (a Avisa foi chamada, nada voltou ainda)', f.pendentes.length === 3, f.pendentes.length)
    ok('  a lista saiu sem o nome (chega na consulta seguinte)', Object.values(nomesDe(r)).every((n) => !n), nomesDe(r))
    f.liberar(nomeDe)
  }

  // ═══ 2. o carimbo é gravado ANTES de responder ══════════════════════════
  {
    const f = manual()
    const w = mundo({ convs: [grupo('1'), grupo('2')], fetchResponde: f })
    const r = await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    const carimbadas = w.convs.filter((c) => c.nome_tentado_em).map((c) => c.id).sort()
    ok('o carimbo já está gravado quando a lista responde, com a busca em voo', r.status === 200 && carimbadas.join() === '1,2', carimbadas)
    f.liberar(nomeDe)
  }

  // ═══ 3. teto de 3 por consulta, e as demais entram nas seguintes ════════
  {
    const f = manual()
    const w = mundo({ convs: [grupo('1'), grupo('2'), grupo('3'), grupo('4'), grupo('5')], fetchResponde: f })
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    await folga()
    const carimbadas = w.convs.filter((c) => c.nome_tentado_em).length
    ok('no máximo 3 grupos por consulta', carimbadas === 3 && f.pendentes.length === 3, { carimbadas, emVoo: f.pendentes.length })

    // Segunda consulta IMEDIATA: os 3 já carimbados NÃO são buscados de novo.
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    await folga()
    ok('segunda consulta: os já carimbados não disparam de novo, entram os 2 que faltavam',
      w.convs.filter((c) => c.nome_tentado_em).length === 5 && f.pendentes.length === 5,
      { carimbadas: w.convs.filter((c) => c.nome_tentado_em).length, totalDeBuscas: f.pendentes.length })

    // Terceira: tudo carimbado, ninguém dispara.
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    await folga()
    ok('terceira consulta: nenhuma busca nova (a janela de 30 min vale)', f.pendentes.length === 5, f.pendentes.length)
    f.liberar(nomeDe)
  }

  // ═══ 4. o nome chega na consulta SEGUINTE ═══════════════════════════════
  {
    const f = manual()
    const w = mundo({ convs: [grupo('1'), grupo('2')], fetchResponde: f })
    const r1 = await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    f.liberar(nomeDe)
    await folga()
    const r2 = await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    const n2 = nomesDe(r2)
    ok('1ª consulta sem nome; 2ª já mostra o nome que a Avisa devolveu',
      Object.values(nomesDe(r1)).every((n) => !n) && n2['1'] === nomeDe(w.convs[0].remote_jid) && n2['2'] === nomeDe(w.convs[1].remote_jid),
      { primeira: nomesDe(r1), segunda: n2 })
    ok('  e nenhuma busca nova na 2ª consulta', f.pendentes.length === 0 && w.fetchs.length === 2, w.fetchs.length)
  }

  // ═══ 5. A CORRIDA: nome digitado enquanto a busca voa NÃO é atropelado ═══
  {
    const f = manual()
    const w = mundo({ convs: [grupo('1')], fetchResponde: f })
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    await folga()
    // o atendente renomeia (é o que o PATCH faz) enquanto a busca ainda voa
    await w.Conv.update('1', { contact_name: 'Digitado pelo atendente', nome_manual: true })
    f.liberar(() => 'Nome da Avisa')
    await folga()
    ok('nome digitado durante a busca NÃO é sobrescrito', w.convs[0].contact_name === 'Digitado pelo atendente', w.convs[0])
  }
  {
    const f = manual()
    const w = mundo({ convs: [grupo('1')], fetchResponde: f })
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    await folga()
    await w.Conv.update('1', { nome_manual: true }) // marcou manual, sem nome ainda
    f.liberar(() => 'Nome da Avisa')
    await folga()
    ok('`nome_manual` ligado durante a busca também impede a gravação', !w.convs[0].contact_name, w.convs[0])
  }
  {
    // Nome que chega por OUTRA via, sem `nome_manual` (por exemplo, o que a
    // entrada de mensagens grava): a busca também não pode sobrescrevê-lo. Este
    // caso isola a checagem de `contact_name` da de `nome_manual`.
    const f = manual()
    const w = mundo({ convs: [grupo('1')], fetchResponde: f })
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    await folga()
    await w.Conv.update('1', { contact_name: 'Nome vindo de outra via' })
    f.liberar(() => 'Nome da Avisa')
    await folga()
    ok('nome gravado por outra via (sem nome_manual) durante a busca NÃO é sobrescrito',
      w.convs[0].contact_name === 'Nome vindo de outra via', w.convs[0])
  }
  {
    // E sem corrida, a busca grava o nome normalmente (a trava não bloqueia tudo).
    const f = manual()
    const w = mundo({ convs: [grupo('1')], fetchResponde: f })
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    f.liberar(() => 'Nome da Avisa')
    await folga()
    ok('sem corrida, o nome é gravado', w.convs[0].contact_name === 'Nome da Avisa', w.convs[0])
  }

  // ═══ 6. carimbo que falha NÃO dispara a busca ═══════════════════════════
  {
    const f = manual()
    const w = mundo({ convs: [grupo('1'), grupo('2')], fetchResponde: f, falhaCarimboEm: '2' })
    const r = await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    await folga()
    ok('carimbo que falha: a lista ainda responde', r.status === 200, r)
    ok('  e só o grupo carimbado dispara a busca (senão viraria uma chamada por consulta)',
      f.pendentes.length === 1 && w.convs[0].nome_tentado_em && !w.convs[1].nome_tentado_em,
      { emVoo: f.pendentes.length, c1: !!w.convs[0].nome_tentado_em, c2: !!w.convs[1].nome_tentado_em })
    f.liberar(nomeDe)
  }

  // ═══ 7. quem NÃO deve ser buscado continua não sendo ════════════════════
  {
    const f = manual()
    const w = mundo({
      fetchResponde: f,
      convs: [
        grupo('1', { contact_name: 'Já tem nome' }),
        grupo('2', { nome_manual: true }),
        grupo('3', { status: 'closed' }),
        grupo('4', { nome_tentado_em: iso(5) }),                 // tentado há 5 min: dentro da janela
        { id: '5', status: 'open', remote_jid: '5519999990005@s.whatsapp.net', updated_at: iso(10), created_at: iso(500) }, // não é grupo
        grupo('6', { nome_tentado_em: iso(45) }),                // tentado há 45 min: pode de novo
      ],
    })
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    await folga()
    ok('só o grupo aberto, sem nome, fora da janela é buscado', f.pendentes.length === 1, f.pendentes.length)
    f.liberar(nomeDe)
  }

  // ═══ 8. `updated_at` exatamente como antes (a lista é ordenada por ele) ══
  {
    const f = manual()
    const comUpdated = grupo('1', { updated_at: '2026-10-10T10:00:00.000Z' })
    const w = mundo({ convs: [comUpdated, grupo('2', { updated_at: '2026-10-12T10:00:00.000Z' })], fetchResponde: f })
    await aTempo(HANDLER_NOVO(w.ctx()), 1500)
    f.liberar(nomeDe)
    await folga()
    ok('o carimbo e o nome não mexem no `updated_at`',
      w.convs[0].updated_at === '2026-10-10T10:00:00.000Z' && w.convs[1].updated_at === '2026-10-12T10:00:00.000Z',
      w.convs.map((c) => c.updated_at))
  }

  // ═══ 9. identidade com o laço antigo ═════════════════════════════════════
  // 9a. lista SEM nenhum grupo sem nome: resposta byte a byte igual.
  {
    const convs = [
      grupo('1', { contact_name: 'Com nome' }),
      { id: '2', status: 'open', remote_jid: '5519999990002@s.whatsapp.net', contact_name: 'Pessoa', updated_at: iso(3), created_at: iso(400) },
      grupo('3', { status: 'closed' }),
      grupo('4', { nome_manual: true }),
    ]
    const a = mundo({ convs, fetchResponde: manual() })
    const b = mundo({ convs, fetchResponde: manual() })
    const rn = await aTempo(HANDLER_NOVO(a.ctx()), 1500)
    const ra = await aTempo(HANDLER_ANTIGO(b.ctx()), 1500)
    ok('lista sem grupo sem nome: resposta IDÊNTICA à de antes, byte a byte',
      JSON.stringify(rn) === JSON.stringify(ra) && rn.status === 200 && rn.body.data.length === 4, { rn, ra })
    ok('  e nenhuma chamada à Avisa nos dois', a.fetchs.length === 0 && b.fetchs.length === 0, [a.fetchs.length, b.fetchs.length])
  }
  // 9b. lista COM grupos sem nome: a única diferença é o nome chegar um ciclo depois.
  {
    const convs = [grupo('1'), grupo('2'), { id: '3', status: 'open', remote_jid: '5519999990003@s.whatsapp.net', contact_name: 'Pessoa', updated_at: iso(3), created_at: iso(400) }]
    const resp = imediato(nomeDe)
    const novo = mundo({ convs, fetchResponde: resp })
    const antigo = mundo({ convs, fetchResponde: resp })
    const n1 = await aTempo(HANDLER_NOVO(novo.ctx()), 1500)
    await folga()
    const n2 = await aTempo(HANDLER_NOVO(novo.ctx()), 1500)
    const a1 = await aTempo(HANDLER_ANTIGO(antigo.ctx()), 1500)

    ok('a resposta de antes já trazia os nomes (referência válida)',
      a1.body.data.find((c) => c.id === '1').contact_name === nomeDe(convs[0].remote_jid), nomesDe(a1))
    // A consulta SEGUINTE do código novo é igual à consulta ÚNICA do antigo.
    ok('a 2ª consulta do código novo é IDÊNTICA à resposta de antes, byte a byte',
      JSON.stringify(n2) === JSON.stringify(a1), { n2: nomesDe(n2), a1: nomesDe(a1) })
    // E a 1ª difere SÓ no nome dos grupos buscados.
    const difere = []
    for (const c of a1.body.data) {
      const x = n1.body.data.find((y) => y.id === c.id)
      for (const k of new Set([...Object.keys(c), ...Object.keys(x)])) {
        if (JSON.stringify(c[k]) !== JSON.stringify(x[k])) difere.push(`${c.id}.${k}`)
      }
    }
    const permitido = (d) => /^[12]\.(contact_name|contactName)$/.test(d)
    ok('a 1ª consulta do código novo difere de antes SOMENTE no nome dos grupos buscados',
      difere.length > 0 && difere.every(permitido) && JSON.stringify(n1.body.data.map((c) => c.id)) === JSON.stringify(a1.body.data.map((c) => c.id)),
      difere)
  }

  fim()
})().catch((e) => { console.error(e); process.exit(1) })
