// A reação do cliente (rota 485) sobre a camada de modelos REAL e um Postgres.
//
// O teste de handlers roda a reserva da reação contra uma camada EMULADA. Este
// arquivo roda a MESMA rota contra `buildModelsApi` e responde o que o emulador
// não pode: a leitura mascarada sai do banco encolhida, a reação grava SÓ
// `reacoes`, e o anexo do alvo continua intacto NO BANCO depois da reação (a
// máscara "1" nunca é persistida).
//
// "Sem a máscara" é a MESMA rota com o pedido de `mascararCampos` retirado.
//
// Sem banco, o arquivo se declara PENDENTE e sai: nunca passa por verde sem ter
// rodado.
//
// Roda com:
//   DATABASE_URL=postgresql://... npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://... node scripts/testes/rota-485-reacao-real.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import { buildModelsApi } from '../../src/lib/models.ts';

const p = process.env.DATABASE_URL ? new PrismaClient() : null;
let vivo = false;
if (p) { try { await p.$queryRaw`SELECT 1`; vivo = true; } catch { /* sem banco */ } }
if (!vivo) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: a rota 485 NÃO foi exercitada sobre a camada real.');
  process.exit(0);
}

let falhas = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhas++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};

const fonte = fs.readFileSync(new URL('../../src/apps/portal-suporte/routes.generated.ts', import.meta.url), 'utf8');
const at = fonte.indexOf('485 whatsapp POST /whatsapp/inbound');
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
const PEDIDO = 'findMany({ mascararCampos: ["media_data"] })';
ok('a 485 contém o pedido de máscara da reserva, uma vez', cod.split(PEDIDO).length - 1 === 1, cod.split(PEDIDO).length - 1);
const NOVO = compilar(cod);
const PEDIDO_FILTRO = 'findMany({ message_id: _alvoId, mascararCampos: ["media_data"] })';
ok('a 485 contém o pedido de máscara da leitura filtrada, uma vez', cod.split(PEDIDO_FILTRO).length - 1 === 1, cod.split(PEDIDO_FILTRO).length - 1);
const ANTIGO = compilar(cod.replace(PEDIDO, 'findMany({})').replace(PEDIDO_FILTRO, 'findMany({ message_id: _alvoId })'));

const SLUG = 'real-485r';
const EMAIL = `${SLUG}@teste.local`;
const JID = '5519999990001@s.whatsapp.net';
const SEGREDO = 'segredo-da-rota';
const ANEXO = 'data:image/jpeg;base64,' + 'A'.repeat(200 * 1024);

await p.app.deleteMany({ where: { slug: SLUG } });
const dono = await p.user.upsert({ where: { email: EMAIL }, update: {}, create: { email: EMAIL, passwordHash: 'x' } });
const app = await p.app.create({ data: { slug: SLUG, name: 'rota 485 reacao', ownerId: dono.id } });
try {
  for (const n of ['Msg', 'Conv', 'Perfil']) await p.modelDef.create({ data: { appId: app.id, name: `${SLUG}_${n}`, schema: { type: 'object' } } });
  const apis = await buildModelsApi(p, app.id, SLUG);
  const Msg = apis[`${SLUG}_Msg`]; const Conv = apis[`${SLUG}_Conv`]; const Perfil = apis[`${SLUG}_Perfil`];
  await Conv.create({ id: 'c1', remote_jid: JID, conta_id: 'default', phase: 'em_atendimento', assigned_to_id: 'u1', status: 'open' });
  await Perfil.create({ id: 'u1', role: 'support', full_name: 'Ana' });

  // 120 mensagens gravadas com `messageId` (o filtro por `message_id` não acha); metade com anexo
  const linhas = [];
  for (let i = 0; i < 120; i++) {
    const d = { id: 'm' + i, conversation_id: 'c1', messageId: 'WA_' + i, from_me: false, body: 'msg ' + i, sender_jid: JID,
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() };
    if (i % 2 === 0) { d.media_data = ANEXO; d.media_type = 'image'; }
    linhas.push({ appId: app.id, modelName: `${SLUG}_Msg`, data: d });
  }
  for (let i = 0; i < 20; i++) {
    linhas.push({ appId: app.id, modelName: `${SLUG}_Msg`, data: { id: 'f' + i, conversation_id: 'c1', message_id: 'WF_' + i, from_me: false, body: 'filtravel ' + i,
      sender_jid: JID, timestamp: new Date(Date.UTC(2026, 1, 1, 0, 0, i)).toISOString(), media_data: ANEXO, media_type: 'image' } });
  }
  await p.modelRecord.createMany({ data: linhas });

  let bytes = 0; let chamadas = [];
  const MsgContado = { ...Msg, findMany: async (a) => { const r = await Msg.findMany(a); chamadas.push({ filtro: a || {}, linhas: r.length }); bytes += JSON.stringify(r).length; return r; } };
  const vazio = { findMany: async () => [], findById: async () => null };
  const ctx = (idAlvo) => ({
    params: {}, headers: {}, query: { token: SEGREDO },
    body: { jsonData: JSON.stringify({ event: { Info: { Chat: JID, Sender: JID, PushName: 'Cliente', ID: 'WA_REAC', IsFromMe: false }, Message: { reactionMessage: { key: { ID: idAlvo }, text: '👍' } } } }) },
    secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
    fetch: async () => ({ status: 200, body: '{}' }),
    models: {
      WhatsAppConversation: Conv, WhatsAppMessage: MsgContado, Profile: Perfil, Sessao: vazio,
      SystemSettings: { findMany: async () => [{ waMenuEnabled: false }] }, WaConversationEvents: vazio,
      SupportSchedule: vazio, WaFlows: vazio, Company: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio,
    },
    reply: { status(x) { this._s = x; return this; }, send(v) { return { status: this._s || 200, body: v }; } },
  });
  const lerDoBanco = async (id) => (await p.modelRecord.findFirst({ where: { appId: app.id, modelName: `${SLUG}_Msg`, data: { path: ['id'], equals: id } } })).data;

  // sem a máscara primeiro (alvo m20, com anexo): mede e depois restaura as reações
  bytes = 0; chamadas = [];
  const ra = await ANTIGO(ctx('WA_20')); const bytesAntigo = bytes;
  const depoisAntigo = await lerDoBanco('m20');
  await p.modelRecord.updateMany({ where: { appId: app.id, modelName: `${SLUG}_Msg`, data: { path: ['id'], equals: 'm20' } }, data: { data: { ...depoisAntigo, reacoes: undefined } } });

  bytes = 0; chamadas = [];
  const rn = await NOVO(ctx('WA_20')); const bytesNovo = bytes; const chamadasNovo = chamadas;
  ok('TRAVA: a reserva rodou sobre a camada real (por message_id veio vazio, depois 140 linhas mascaradas)',
    chamadasNovo.length === 2 && chamadasNovo[0].linhas === 0 && chamadasNovo[1].linhas === 140, chamadasNovo);
  ok('a rota responde 200 com e sem a máscara', rn.status === 200 && ra.status === 200, [rn.status, ra.status]);
  const depois = await lerDoBanco('m20');
  ok('a reação foi gravada na mensagem alvo, com o emoji', Array.isArray(depois.reacoes) && depois.reacoes.some((x) => x.emoji === '👍'), depois.reacoes);
  ok('O ANEXO DO ALVO CONTINUA INTACTO NO BANCO (nada de "1" persistido)', depois.media_data === ANEXO, String(depois.media_data).slice(0, 20));
  const todos = await p.modelRecord.findMany({ where: { appId: app.id, modelName: `${SLUG}_Msg` } });
  ok('nenhum anexo de nenhuma mensagem foi alterado', todos.every((r) => r.data.media_data === undefined || r.data.media_data === ANEXO), todos.filter((r) => r.data.media_data && r.data.media_data !== ANEXO).length);
  ok('os outros campos do alvo ficaram como estavam', depois.body === 'msg 20' && depois.messageId === 'WA_20' && depois.media_type === 'image', depois);
  ok('a reação gravada é a mesma com e sem a máscara', JSON.stringify(depois.reacoes.map((x) => x.emoji)) === JSON.stringify(depoisAntigo.reacoes.map((x) => x.emoji)), 'divergiu');
  ok('a máscara reduz o que sai do banco (o pedido chega à camada)', bytesNovo * 20 < bytesAntigo, { bytesNovo, bytesAntigo });
  console.log(`INFO  bytes da reserva da reação, 140 mensagens: sem máscara ${(bytesAntigo / 1048576).toFixed(2)} MB | com máscara ${(bytesNovo / 1024).toFixed(1)} KB | -${(100 - 100 * bytesNovo / bytesAntigo).toFixed(2)}%`);

  // ── leitura COMUM: o filtro por message_id ACHA a mensagem, que tem anexo de 200 KB ──
  chamadas = []; bytes = 0;
  const fa = await ANTIGO(ctx('WF_3')); const bytesFiltAntigo = bytes;
  const f0 = await lerDoBanco('f3');
  await p.modelRecord.updateMany({ where: { appId: app.id, modelName: `${SLUG}_Msg`, data: { path: ['id'], equals: 'f3' } }, data: { data: { ...f0, reacoes: undefined } } });
  chamadas = []; bytes = 0;
  const fn = await NOVO(ctx('WF_3')); const bytesFiltNovo = bytes; const chamadasFilt = chamadas;
  ok('TRAVA: a leitura filtrada ACHOU a mensagem na camada real e a reserva não rodou (1 leitura, 1 linha)', chamadasFilt.length === 1 && chamadasFilt[0].linhas === 1, chamadasFilt);
  ok('a rota responde 200 com e sem a máscara na leitura filtrada', fn.status === 200 && fa.status === 200, [fn.status, fa.status]);
  const f3 = await lerDoBanco('f3');
  ok('reação gravada na mensagem achada pelo filtro, com o emoji', Array.isArray(f3.reacoes) && f3.reacoes.some((x) => x.emoji === '👍'), f3.reacoes);
  ok('O ANEXO CONTINUA INTACTO NO BANCO depois da reação achada pelo filtro', f3.media_data === ANEXO, String(f3.media_data).slice(0, 20));
  ok('a leitura filtrada mascarada não traz o base64 (bytes < 5 KB) e a de antes trazia (>= 200 KB)', bytesFiltNovo < 5 * 1024 && bytesFiltAntigo >= 200 * 1024, { bytesFiltNovo, bytesFiltAntigo });
  console.log(`INFO  bytes da leitura filtrada da reação, 1 mensagem com anexo: sem máscara ${(bytesFiltAntigo / 1024).toFixed(1)} KB | com máscara ${(bytesFiltNovo / 1024).toFixed(2)} KB`);
} finally {
  await p.modelRecord.deleteMany({ where: { appId: app.id } });
  await p.modelDef.deleteMany({ where: { appId: app.id } });
  await p.app.delete({ where: { id: app.id } });
  await p.user.deleteMany({ where: { email: EMAIL } });
  await p.$disconnect();
}
if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\ntodos os casos passaram');
