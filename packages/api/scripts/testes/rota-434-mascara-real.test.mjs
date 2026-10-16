// A rota 434 (mensagens da conversa aberta) sobre a camada de modelos REAL.
//
// O teste de handlers (apps/portal-suporte/scripts/testes-handlers/mascara-na-434)
// roda a rota contra um mascaramento EMULADO. Este arquivo roda a MESMA rota
// contra o `buildModelsApi` e um Postgres de verdade, e responde o que o
// emulador não pode: a resposta é idêntica com e sem o mascaramento, o clipe de
// cada forma de `media_data` é o de sempre, e quantos bytes deixam de sair do
// banco.
//
// "Sem o mascaramento" é a MESMA rota com os três pedidos de `mascararCampos`
// retirados do texto do handler.
//
// Sem banco, o arquivo se declara PENDENTE e sai: nunca passa por verde sem ter
// rodado.
//
// Roda com:
//   DATABASE_URL=postgresql://... npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://... node scripts/testes/rota-434-mascara-real.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import { buildModelsApi } from '../../src/lib/models.ts';

const p = process.env.DATABASE_URL ? new PrismaClient() : null;
let vivo = false;
if (p) { try { await p.$queryRaw`SELECT 1`; vivo = true; } catch { /* sem banco */ } }
if (!vivo) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: a rota 434 NÃO foi exercitada sobre a camada real.');
  process.exit(0);
}

let falhas = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhas++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};

// ── a rota, com e sem o pedido de mascaramento ──────────────────────────────
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
const PEDIDOS = [
  ['{ conversation_id: id, mascararCampos: _MASCARAR_MIDIA }', '{ conversation_id: id }'],
  ['{ conversation_id: id, from_me: _lados[_l], mascararCampos: _MASCARAR_MIDIA }', '{ conversation_id: id, from_me: _lados[_l] }'],
  ['findMany({ mascararCampos: _MASCARAR_MIDIA })', 'findMany({})'],
];
const ausentes = [];
let antigo = cod;
for (const [n, a] of PEDIDOS) {
  if (!antigo.includes(n)) { ausentes.push(n); continue; }
  antigo = antigo.replace(n, () => a);
}
ok('a 434 contém os três pedidos de mascaramento', ausentes.length === 0, ausentes);
const NOVO = compilar(cod);
const ANTIGO = compilar(antigo);

// ── massa: 60 mensagens, 10 formas de media_data, anexos de 150 a 400 KB ────
const SLUG = 'real-434';
const EMAIL = `${SLUG}@teste.local`;
const GRANDE = (kb) => 'data:image/jpeg;base64,' + 'A'.repeat(kb * 1024);
// [rótulo, valor (undefined = chave ausente), tem clipe?]
const FORMAS = [
  ['imagem', GRANDE(300), true], ['documento', GRANDE(150), true], ['áudio', GRANDE(400), true],
  ['texto', undefined, false], ['nulo', null, false], ['string vazia', '', false], ['zero', 0, false],
  ['false', false, false], ['a string "0"', '0', true], ['a string "false"', 'false', true],
];

await p.app.deleteMany({ where: { slug: SLUG } });
const dono = await p.user.upsert({ where: { email: EMAIL }, update: {}, create: { email: EMAIL, passwordHash: 'x' } });
const app = await p.app.create({ data: { slug: SLUG, name: 'rota 434', ownerId: dono.id } });
try {
  await p.modelDef.create({ data: { appId: app.id, name: `${SLUG}_Msg`, schema: { type: 'object' } } });
  const apis = await buildModelsApi(p, app.id, SLUG);
  const Msg = apis[`${SLUG}_Msg`];
  const linhas = [];
  for (let n = 0; n < 60; n++) {
    const [, val, tem] = FORMAS[n % FORMAS.length];
    const d = {
      id: 'm' + n, conversation_id: 'c1', from_me: n % 2 === 0, message_id: 'WAID' + n,
      sender_jid: n % 2 ? '5519999990001@s.whatsapp.net' : '', sender_name: n % 2 ? 'Cliente' : 'Atendente',
      body: 'mensagem ' + n, timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
    };
    if (val !== undefined) { d.media_data = val; if (tem && typeof val === 'string' && val.startsWith('data:')) d.media_type = 'image'; }
    linhas.push({ appId: app.id, modelName: `${SLUG}_Msg`, data: d });
  }
  await p.modelRecord.createMany({ data: linhas });

  let bytes = 0;
  const comContagem = { ...Msg, findMany: async (a) => { const r = await Msg.findMany(a); bytes += JSON.stringify(r).length; return r; } };
  const vazio = { findMany: async () => [], findById: async () => null };
  const conv = { id: 'c1', remote_jid: '5519999990001@s.whatsapp.net', created_at: '2026-01-01T00:00:00Z', unread_count: 0 };
  const ctx = () => ({
    params: { id: 'c1' }, query: {}, body: {}, headers: {}, user: { id: 'u1' },
    secrets: { get: async () => '' }, fetch: async () => ({ status: 200, body: '{}' }),
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'support' }), findMany: async () => [] },
      WhatsAppConversation: { findById: async () => ({ ...conv }), findMany: async () => [conv] },
      SystemSettings: vazio, CompanyContact: vazio, WaConversationEvents: vazio,
      WhatsAppMessage: comContagem,
    },
    reply: { status(x) { this._s = x; return this; }, send(v) { return { status: this._s || 200, body: v }; } },
  });

  bytes = 0; const rn = await NOVO(ctx()); const bytesNovo = bytes;
  bytes = 0; const ra = await ANTIGO(ctx()); const bytesAntigo = bytes;

  ok('a rota responde 200 com as 60 mensagens', rn.status === 200 && rn.body.data.length === 60 && ra.body.data.length === 60,
    [rn.status, rn.body && rn.body.data && rn.body.data.length]);
  ok('resposta da 434 IDÊNTICA, byte a byte, com e sem o mascaramento', JSON.stringify(rn) === JSON.stringify(ra), 'divergiu');
  const erradas = [];
  for (let n = 0; n < 60; n++) {
    const [rotulo, , tem] = FORMAS[n % FORMAS.length];
    const l = rn.body.data.find((x) => x.id === 'm' + n);
    if ((l.media_ref === 'm' + n) !== tem || (!tem && l.media_ref !== null)) erradas.push(`${rotulo} (m${n}): ${l.media_ref}`);
  }
  ok('o clipe de cada forma é o de sempre: "", 0, false e nulo sem clipe; "0" e "false" com clipe', erradas.length === 0, erradas);
  ok('nenhum conteúdo de anexo aparece na resposta', !JSON.stringify(rn).includes('AAAAAAAAAA'), 'base64 vazou');
  ok('o mascaramento reduz o que sai do banco (o pedido chega à camada)', bytesNovo * 20 < bytesAntigo, { bytesNovo, bytesAntigo });
  console.log(`INFO  bytes que saem do banco para o Node, uma abertura de 60 mensagens: sem mascarar ${(bytesAntigo / 1048576).toFixed(2)} MB | mascarado ${(bytesNovo / 1024).toFixed(1)} KB | -${(100 - 100 * bytesNovo / bytesAntigo).toFixed(2)}%`);
} finally {
  await p.modelRecord.deleteMany({ where: { appId: app.id } });
  await p.modelDef.deleteMany({ where: { appId: app.id } });
  await p.app.delete({ where: { id: app.id } });
  await p.user.deleteMany({ where: { email: EMAIL } });
  await p.$disconnect();
}
if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\ntodos os casos passaram');
