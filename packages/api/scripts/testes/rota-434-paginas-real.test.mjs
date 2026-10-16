// A rota 434 lê a conversa por PÁGINAS, sobre a camada de modelos REAL.
//
// O teste de handlers (apps/portal-suporte/scripts/testes-handlers/
// conversa-por-paginas) usa um emulador da camada. Este arquivo roda a MESMA rota
// contra o `buildModelsApi` e um Postgres de verdade, e mostra, com o `offset`
// e a ordem "mais recentes primeiro" da camada real:
//   - o que o código de ANTES (metades por `from_me`) fazia com conversas
//     DESBALANCEADAS: perdia mensagem abaixo de mil e dizia que estava completo;
//   - o que o código novo faz: devolve inteira o que cabe no teto, as 1000 mais
//     recentes contíguas acima dele, e acusa `truncado` só quando falta de fato.
//
// O índice de produção `model_records_app_model_created_idx` é criado aqui para
// a forma do banco ser a de produção.
//
// Sem banco, o arquivo se declara PENDENTE e sai: nunca passa por verde sem ter
// rodado.
//
// Roda com:
//   DATABASE_URL=postgresql://... npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://... node scripts/testes/rota-434-paginas-real.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import { buildModelsApi } from '../../src/lib/models.ts';

const p = process.env.DATABASE_URL ? new PrismaClient() : null;
let vivo = false;
if (p) { try { await p.$queryRaw`SELECT 1`; vivo = true; } catch { /* sem banco */ } }
if (!vivo) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: a rota 434 por páginas NÃO foi exercitada sobre a camada real.');
  process.exit(0);
}

let falhas = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhas++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};

// ── a rota nova e a de ANTES (metades por from_me) ──────────────────────────
const fonte = fs.readFileSync(new URL('../../src/apps/portal-suporte/routes.generated.ts', import.meta.url), 'utf8');
const at = fonte.indexOf('434 whatsapp GET /whatsapp/:id/messages');
const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
re.lastIndex = at;
const cod = JSON.parse('"' + re.exec(fonte)[1] + '"');
const compilar = (c) => {
  const ctx = {
    console, Date, JSON, String, Number, Object, Array, Math, Promise, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Buffer, Error, TypeError, encodeURIComponent, decodeURIComponent, Intl, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval, module: { exports: {} },
  };
  ctx.exports = ctx.module.exports; ctx.globalThis = ctx;
  vm.createContext(ctx); vm.runInContext(c, ctx);
  return ctx.module.exports.handler;
};
const BLOCO_ANTIGO = `  var all = [];
  var _via = "filtro";
  var _ultimaPaginaCheia = false;
  try { all = (await m.Msg.findMany({ conversation_id: id, mascararCampos: _MASCARAR_MIDIA })) || []; } catch (e) { all = []; }
  if (all.length >= 500) {
    var _unidas = {};
    for (var _u = 0; _u < all.length; _u++) _unidas[String(all[_u].id)] = all[_u];
    var _lados = [true, false];
    for (var _l = 0; _l < _lados.length; _l++) {
      try {
        var _parte = (await m.Msg.findMany({ conversation_id: id, from_me: _lados[_l], mascararCampos: _MASCARAR_MIDIA })) || [];
        for (var _p = 0; _p < _parte.length; _p++) _unidas[String(_parte[_p].id)] = _parte[_p];
      } catch (e) {}
    }
    var _juntas = [];
    for (var _k in _unidas) _juntas.push(_unidas[_k]);
    if (_juntas.length > all.length) { all = _juntas; _via = "filtro+lados"; }
  }
`;
const INI = '  // Quantas páginas de 500 a rota lê por conversa';
const FIM = '  if (!all.length) {\n    // O campo pode ter outro nome no banco';
const a = cod.indexOf(INI), b = cod.indexOf(FIM);
ok('o bloco novo foi localizado e o de antes pôde ser reconstituído', a >= 0 && b > a, { a, b });
let antigo = cod.slice(0, a) + BLOCO_ANTIGO + cod.slice(b);
const t = antigo.match(/truncado: \(_via === "varredura" && _lidas >= 500\) \|\| _ultimaPaginaCheia,/);
ok('o controle usa o `truncado` de ANTES (a substituição aconteceu)', !!t, 'regex não casou');
if (t) antigo = antigo.replace(t[0], () => 'truncado: (_via === "varredura" && _lidas >= 500) || (_via === "filtro+lados" && _lidas >= 1000),');
const NOVO = compilar(cod);
const ANTIGO = compilar(antigo);

// ── massa: três conversas desbalanceadas, gravadas em ordem cronológica ────
const SLUG = 'real-434p';
const EMAIL = `${SLUG}@teste.local`;
await p.app.deleteMany({ where: { slug: SLUG } });
const dono = await p.user.upsert({ where: { email: EMAIL }, update: {}, create: { email: EMAIL, passwordHash: 'x' } });
const app = await p.app.create({ data: { slug: SLUG, name: 'rota 434 paginas', ownerId: dono.id } });
try {
  // O índice de produção, para o banco ter a forma de produção.
  await p.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS model_records_app_model_created_idx ON model_records (app_id, model_name, created_at DESC)');
  await p.modelDef.create({ data: { appId: app.id, name: `${SLUG}_Msg`, schema: { type: 'object' } } });
  const apis = await buildModelsApi(p, app.id, SLUG);
  const Msg = apis[`${SLUG}_Msg`];

  const T0 = Date.UTC(2026, 0, 1);
  let ordem = 0;
  const conversa = (id, nCliente, nNos) => {
    const total = nCliente + nNos;
    const nossas = new Set();
    for (let k = 0; k < nNos; k++) nossas.add(Math.min(total - 1, Math.floor(k * total / nNos)));
    return Array.from({ length: total }, (_, i) => ({
      id: `${id}_${i}`, conversation_id: id, from_me: nossas.has(i), body: 'mensagem ' + i,
      sender_name: nossas.has(i) ? 'Atendente' : 'Cliente', message_id: `WA_${id}_${i}`,
      timestamp: new Date(T0 + (ordem++) * 1000).toISOString(),
    }));
  };
  const CONVERSAS = { c800: conversa('c800', 700, 100), c950: conversa('c950', 900, 50), c1600: conversa('c1600', 1500, 100), c300: conversa('c300', 200, 100) };
  // Gravadas em ordem cronológica, com `created_at` crescente (a ordem da camada).
  const linhas = [];
  let ms = 0;
  for (const msgs of Object.values(CONVERSAS)) for (const d of msgs) linhas.push({ appId: app.id, modelName: `${SLUG}_Msg`, data: d, createdAt: new Date(T0 + (ms++) * 1000) });
  await p.modelRecord.createMany({ data: linhas });

  const vazio = { findMany: async () => [], findById: async () => null };
  let leituras = [];
  const comRegistro = { ...Msg, findMany: async (a) => { const r = await Msg.findMany(a); leituras.push({ filtro: a || {}, linhas: r.length }); return r; } };
  const rodar = async (handler, id) => {
    leituras = [];
    const conv = { id, remote_jid: '5519999990000@s.whatsapp.net', created_at: '2026-01-01T00:00:00Z' };
    const r = await handler({
      params: { id }, query: {}, body: {}, headers: {}, user: { id: 'u1' },
      secrets: { get: async () => '' }, fetch: async () => ({ status: 200, body: '{}' }),
      models: {
        Sessao: { findById: async () => null }, Profile: { findById: async () => ({ id: 'u1', role: 'support' }), findMany: async () => [] },
        WhatsAppConversation: { findById: async () => ({ ...conv }), findMany: async () => [conv] },
        SystemSettings: vazio, CompanyContact: vazio, WaConversationEvents: vazio, WhatsAppMessage: comRegistro,
      },
      reply: { status(x) { this._s = x; return this; }, send(v) { return { status: this._s || 200, body: v }; } },
    });
    return { r, leituras: leituras.slice(), ids: (r.body.data || []).map((x) => x.id), hist: r.body.historico || {}, bytes: JSON.stringify(r).length };
  };

  // ── O CENTRAL: desbalanceadas, antes × agora, na camada real ──
  for (const [id, total] of [['c800', 800], ['c950', 950]]) {
    const msgs = CONVERSAS[id];
    const nos = msgs.filter((m) => m.from_me).length;
    ok(`massa ${id}: desbalanceada (${msgs.length - nos} do cliente, ${nos} nossas) e cabe nas duas páginas`, nos > 0 && (msgs.length - nos) / nos >= 7 && total > 500 && total <= 1000, { nos, total });
    const antes = await rodar(ANTIGO, id);
    const agora = await rodar(NOVO, id);
    ok(`CONTROLE ${id} — o código de ANTES perdia mensagem e dizia que estava completo`, antes.ids.length < total && antes.hist.truncado === false, { devolveu: antes.ids.length, de: total, truncado: antes.hist.truncado });
    ok(`${id} — AGORA vem inteira (${total} de ${total}), sem duplicata, sem acusar truncamento`,
      agora.ids.length === total && new Set(agora.ids).size === total && agora.hist.truncado === false, { n: agora.ids.length, t: agora.hist.truncado });
    ok(`${id} — são exatamente as mensagens da conversa`, msgs.every((m) => agora.ids.includes(m.id)), 'faltou mensagem');
    ok(`TRAVA — ${id}: a primeira página veio CHEIA (500) e a segunda PARCIAL`, JSON.stringify(agora.leituras.map((l) => l.linhas)) === JSON.stringify([500, total - 500]), agora.leituras);
  }

  // ── acima do teto: as 1000 mais recentes, contíguas, e acusa ──
  {
    const msgs = CONVERSAS.c1600;
    const antes = await rodar(ANTIGO, 'c1600');
    const agora = await rodar(NOVO, 'c1600');
    ok('CONTROLE c1600 — o código de ANTES devolvia ~600 de 1600 e dizia que estava completo', antes.ids.length < 700 && antes.hist.truncado === false, { devolveu: antes.ids.length, truncado: antes.hist.truncado });
    ok('c1600 — AGORA devolve as 1000 MAIS RECENTES, contíguas', JSON.stringify(agora.ids.slice().sort()) === JSON.stringify(msgs.slice(-1000).map((m) => m.id).sort()), { n: agora.ids.length });
    ok('  e ACUSA que truncou (a segunda página veio cheia)', agora.hist.truncado === true && agora.leituras.length === 2, { t: agora.hist.truncado, leituras: agora.leituras.length });
    console.log(`INFO  c1600 agora: ${agora.ids.length} mensagens, ${(agora.bytes / 1024).toFixed(0)} KB de resposta (${(agora.bytes / agora.ids.length).toFixed(0)} B/mensagem, sem anexo)`);
  }

  // ── o gatilho: conversa pequena faz UMA leitura ──
  {
    const agora = await rodar(NOVO, 'c300');
    ok('c300 — UMA leitura por conversa (a segunda página não é pedida), sem truncado', agora.leituras.filter((l) => l.filtro.conversation_id === 'c300').length === 1 && agora.ids.length === 300 && agora.hist.truncado === false, agora.leituras);
  }
} finally {
  await p.modelRecord.deleteMany({ where: { appId: app.id } });
  await p.modelDef.deleteMany({ where: { appId: app.id } });
  await p.app.delete({ where: { id: app.id } });
  await p.user.deleteMany({ where: { email: EMAIL } });
  await p.$disconnect();
}
if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\ntodos os casos passaram');
