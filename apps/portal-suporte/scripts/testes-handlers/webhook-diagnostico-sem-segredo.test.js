// O diagnóstico do webhook (GET e POST /whatsapp/diagnostico/webhook) não devolve mais o SEGREDO do
// webhook. O endereço que a Avisa guarda leva o segredo na consulta (`?token=…`), e a resposta do
// provedor era repassada intacta a quem tem nível de suporte.
//
// O QUE SE GARANTE:
//   - da resposta do provedor sai só a lista de `enderecos`, e de cada um só origem e caminho: a consulta
//     e o fragmento são cortados SEMPRE, com qualquer nome de parâmetro (`token`, `secret`, `key`, outro
//     qualquer), com um ou vários parâmetros, com o segredo no meio, e usuário:senha embutidos;
//   - segmento de caminho que parece segredo (24+ caracteres) vira "…";
//   - formato inesperado (texto, HTML, lista, número, nulo, objeto sem endereço, campo novo como
//     `secret`) não vaza: o que não é endereço não sai, e a lista vem vazia;
//   - o que a tela usa continua lá: `http` e um endereço que contém `/v1/r/portal-suporte/whatsapp/inbound`
//     (o card de conexão compara com ele), e a lista vazia continua dizendo "nenhum endereço";
//   - o POST (recadastrar) devolve só `http`, endereços e a mensagem do provedor, também sem segredo.
// O TESTE NÃO PROCURA `token=`: o segredo é um valor sentinela, e a asserção é que ele NÃO aparece em lugar
// nenhum da resposta serializada. Procurar o nome do parâmetro é a guarda que falha calada quando o formato muda.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node webhook-diagnostico-sem-segredo.test.js
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
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, module: { exports: {} },
  }
  c.exports = c.module.exports; c.globalThis = c
  vm.createContext(c); vm.runInContext(codigo, c)
  return c.module.exports.handler
}
const GET = codigoDe('GET /whatsapp/diagnostico/webhook')
const POST = codigoDe('POST /whatsapp/diagnostico/webhook')

const SEG = 'ZQXsegredoSENTINELA9f3k2'      // o valor que NÃO pode aparecer
const INBOUND = 'https://api.arara-tech.com/v1/r/portal-suporte/whatsapp/inbound'

async function chamar(cod, meth, corpoDoProvedor, { quem = 'u1', role = 'admin', http = 200, body } = {}) {
  const h = compilar(cod)
  const r = await h({
    params: {}, query: {}, headers: {}, body: body || { webhook: INBOUND + '?token=' + SEG }, user: quem ? { id: quem } : {},
    models: { Profile: { findById: async () => ({ id: 'u1', role }) }, Sessao: { findById: async () => null } },
    secrets: { get: async () => 'token-da-avisa' },
    fetch: async () => ({ status: http, body: typeof corpoDoProvedor === 'string' ? corpoDoProvedor : JSON.stringify(corpoDoProvedor) }),
    reply: reply(),
  })
  return { status: r.status, corpo: r.body, texto: JSON.stringify(r.body) }
}
const padrao = (url) => ({ code: 200, data: { subscribe: ['Message'], webhook: url }, success: true })

async function bateria(cod = { GET, POST }) {
  const f = []
  const t = (nome, cond, det) => { if (!cond) f.push(nome + (det !== undefined ? ' ' + JSON.stringify(det).slice(0, 200) : '')) }
  const semVazar = (nome, r) => t(`${nome}: o segredo não aparece em lugar nenhum da resposta`, !r.texto.includes(SEG), r.texto)

  const formatos = [
    ['formato de hoje (consulta com token)', padrao(INBOUND + '?token=' + SEG), [INBOUND]],
    ['sem consulta', padrao(INBOUND), [INBOUND]],
    ['vários parâmetros', padrao(INBOUND + '?a=1&token=' + SEG + '&b=2'), [INBOUND]],
    ['segredo no meio da consulta, com fragmento', padrao(INBOUND + '?x=1&token=' + SEG + '&y=2#frag' + SEG), [INBOUND]],
    ['parâmetro com outro nome (secret)', padrao(INBOUND + '?secret=' + SEG), [INBOUND]],
    ['parâmetro com outro nome (key)', padrao(INBOUND + '?key=' + SEG), [INBOUND]],
    ['parâmetro com nome qualquer', padrao(INBOUND + '?qualquercoisa=' + SEG), [INBOUND]],
    ['usuário:senha embutidos', padrao('https://admin:' + SEG + '@api.arara-tech.com/v1/r/portal-suporte/whatsapp/inbound'), [INBOUND]],
    ['segredo longo no caminho', padrao('https://api.arara-tech.com/hooks/' + SEG + 'XXXXXXXXXXXX/inbound'), ['https://api.arara-tech.com/hooks/…/inbound']],
    ['dois endereços', { a: INBOUND + '?token=' + SEG, b: 'http://velho.exemplo.com/antigo?t=' + SEG }, [INBOUND, 'http://velho.exemplo.com/antigo']],
    ['endereço repetido sai uma vez', { a: INBOUND + '?token=' + SEG, b: INBOUND + '?token=' + SEG }, [INBOUND]],
    ['HTTP em vez de HTTPS', padrao('http://api.arara-tech.com/v1/r/portal-suporte/whatsapp/inbound?token=' + SEG), ['http://api.arara-tech.com/v1/r/portal-suporte/whatsapp/inbound']],
  ]
  for (const [nome, corpo, esperado] of formatos) {
    for (const meth of ['GET', 'POST']) {
      const r = await chamar(cod[meth], meth, corpo)
      semVazar(`${meth} ${nome}`, r)
      const enderecos = ((meth === 'GET' ? r.corpo.data.webhook : r.corpo.data.resposta) || {}).enderecos
      t(`${meth} ${nome}: só origem e caminho`, JSON.stringify(enderecos) === JSON.stringify(esperado), enderecos)
    }
  }
  // formatos que não são o esperado
  const estranhos = [
    ['texto puro com o endereço', 'webhook atual: ' + INBOUND + '?token=' + SEG + ' (ok)'],
    ['HTML de erro', '<html><body>Erro em <a href="' + INBOUND + '?token=' + SEG + '">aqui</a></body></html>'],
    ['lista', [INBOUND + '?token=' + SEG]],
    ['número', 12345],
    ['nulo', null],
    ['objeto sem endereço, com campo novo', { code: 200, data: { subscribe: ['Message'], secret: SEG, token: SEG } }],
    ['campo novo com o segredo fora de endereço', { code: 200, data: { webhook: INBOUND, chave: SEG } }],
    ['JSON dentro de texto', JSON.stringify({ data: { webhook: INBOUND + '?token=' + SEG } })],
  ]
  for (const [nome, corpo] of estranhos) {
    for (const meth of ['GET', 'POST']) {
      const r = await chamar(cod[meth], meth, corpo)
      semVazar(`${meth} formato inesperado (${nome})`, r)
      t(`${meth} formato inesperado (${nome}): responde 200`, r.status === 200 && r.corpo.success === true, r.status)
    }
  }
  const vazia = await chamar(cod.GET, 'GET', { code: 200, data: { subscribe: ['Message'] } })
  t('sem endereço: lista vazia (a tela diz "nenhum endereço")', Array.isArray((vazia.corpo.data.webhook || {}).enderecos) && vazia.corpo.data.webhook.enderecos.length === 0, vazia.corpo)
  // o que a tela usa
  const g = await chamar(cod.GET, 'GET', padrao(INBOUND + '?token=' + SEG), { http: 200 })
  t('GET: `data.http` segue lá', g.corpo.data.http === 200, g.corpo)
  t('GET: a tela acha o endereço do portal no JSON (como o card faz)', (JSON.stringify(g.corpo.data.webhook).match(/https?:\/\/[^"\\ ]+/) || [''])[0].includes('/v1/r/portal-suporte/whatsapp/inbound'), g.corpo)
  const p = await chamar(cod.POST, 'POST', { code: 200, message: 'webhook salvo em ' + INBOUND + '?token=' + SEG }, { http: 200 })
  t('POST: `success` e `data.http` seguem lá (a tela só lê isso)', p.corpo.success === true && p.corpo.data.http === 200, p.corpo)
  t('POST: a mensagem do provedor vem com o endereço sem segredo', typeof p.corpo.data.resposta.mensagem === 'string' && p.corpo.data.resposta.mensagem.includes(INBOUND) && !p.corpo.data.resposta.mensagem.includes(SEG), p.corpo.data.resposta)
  const pe = await chamar(cod.POST, 'POST', { code: 400, error: 'URL inválida: ' + INBOUND + '?token=' + SEG }, { http: 400 })
  t('POST: erro do provedor também sem segredo, e o http passa', pe.corpo.data.http === 400 && !pe.texto.includes(SEG), pe.texto)
  // acesso
  const sem = await chamar(cod.GET, 'GET', padrao(INBOUND), { quem: null })
  t('GET sem sessão: 401 (guarda) ou 403, e nada do provedor', (sem.status === 401 || sem.status === 403) && !sem.texto.includes('enderecos'), sem.status)
  const sup = await chamar(cod.POST, 'POST', padrao(INBOUND), { role: 'support' })
  t('POST de suporte (não admin): 403', sup.status === 403, sup.status)
  return f
}

;(async () => {
  const f0 = await bateria()
  ok('a bateria passa limpa', f0.length === 0, f0)
  const muts = [
    ['a consulta volta (só corta o fragmento)', 'GET', 'var m = String(u).match(/^(https?):\\/\\/([^\\/?#]*)([^?#]*)/i);', 'var m = String(u).match(/^(https?):\\/\\/([^\\/?#]*)([^#]*)/i);'],
    ['só corta o parâmetro token', 'GET', 'var m = String(u).match(/^(https?):\\/\\/([^\\/?#]*)([^?#]*)/i);', 'var m = String(u).match(/^(https?):\\/\\/([^\\/?#]*)([^#]*)/i); if (m) m[3] = m[3].replace(/[?&]token=[^&]*/g, "");'],
    ['usuário:senha ficam', 'GET', 'var host = m[2].replace(/^[^@]*@/, "");', 'var host = m[2];'],
    ['segmento parecido com segredo fica', 'GET', '{24,}$/.test(seg) ? "…" : seg;', '{24,}$/.test(seg) ? seg : seg;'],
    ['o corpo do provedor é repassado (GET)', 'GET', 'webhook: { enderecos: _enderecosDe(corpo) } } });', 'webhook: corpo } });'],
    ['o corpo do provedor é repassado (POST)', 'POST', 'resposta: { enderecos: _enderecosDe(corpo), mensagem:', 'resposta: { enderecos: corpo, mensagem:'],
    ['a mensagem do POST sai crua', 'POST', '_textoSemSegredo(_msg).slice(0, 200)', 'String(_msg).slice(0, 200)'],
    ['só reconhece https', 'GET', 'var achados = String(texto || "").match(/https?:\\/\\/[^\\s"\'\\\\<>]+/gi) || [];', 'var achados = String(texto || "").match(/https:\\/\\/[^\\s"\'\\\\<>]+/gi) || [];'],
    ['o http some', 'GET', 'data: { http: r && r.status, webhook:', 'data: { webhook:'],
  ]
  for (const [nome, qual, de, para] of muts) {
    const base = { GET, POST }
    const n = base[qual].split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let fm
    try { fm = await bateria({ ...base, [qual]: base[qual].replace(de, () => para) }) } catch (e) { fm = ['erro: ' + e.message] }
    ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('').slice(0, 70)})`, fm.length > 0, 'sobreviveu')
  }
  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
