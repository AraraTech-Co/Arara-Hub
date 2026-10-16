// A rota 432 (lista de conversas) sobre a camada de modelos REAL.
//
// O teste de handlers (apps/portal-suporte/scripts/testes-handlers/mascara-na-432)
// roda a rota contra um mascaramento EMULADO. Este arquivo roda a MESMA rota
// contra o `buildModelsApi` e um Postgres de verdade, e responde o que o
// emulador não pode: a resposta é idêntica com e sem o mascaramento e quantos
// bytes deixam de sair do banco.
//
// "Sem o mascaramento" é a MESMA rota com os dois pedidos de `mascararCampos`
// retirados do texto do handler.
//
// TRAVAS CONTRA "DOIS NADAS": a comparação só significa algo se as mensagens
// lidas TÊM anexo e se o caminho das prévias (leitura por conversa) ACONTECEU.
// Por isso este arquivo afirma, olhando a massa devolvida pelo banco, que a
// leitura sem filtro e a leitura por conversa trouxeram anexos de verdade.
//
// Sem banco, o arquivo se declara PENDENTE e sai: nunca passa por verde sem ter
// rodado.
//
// Roda com:
//   DATABASE_URL=postgresql://... npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://... node scripts/testes/rota-432-mascara-real.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import { buildModelsApi } from '../../src/lib/models.ts';

const p = process.env.DATABASE_URL ? new PrismaClient() : null;
let vivo = false;
if (p) { try { await p.$queryRaw`SELECT 1`; vivo = true; } catch { /* sem banco */ } }
if (!vivo) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: a rota 432 NÃO foi exercitada sobre a camada real.');
  process.exit(0);
}

let falhas = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhas++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};

// ── a rota, com e sem os pedidos de mascaramento ────────────────────────────
const fonte = fs.readFileSync(new URL('../../src/apps/portal-suporte/routes.generated.ts', import.meta.url), 'utf8');
const at = fonte.indexOf('432 whatsapp GET /whatsapp');
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
  ['findMany({ mascararCampos: _MASCARAR_MIDIA })', 'findMany({})'],
  ['findMany({ conversation_id: _faltam[_q], mascararCampos: _MASCARAR_MIDIA })', 'findMany({ conversation_id: _faltam[_q] })'],
];
const ausentes = [];
let antigo = cod;
for (const [n, a] of PEDIDOS) {
  if (!antigo.includes(n)) { ausentes.push(n); continue; }
  antigo = antigo.replace(n, () => a);
}
ok('a 432 contém os dois pedidos de mascaramento', ausentes.length === 0, ausentes);
const NOVO = compilar(cod);
const ANTIGO = compilar(antigo);

// ── massa ───────────────────────────────────────────────────────────────────
const SLUG = 'real-432';
const EMAIL = `${SLUG}@teste.local`;
const GRANDE = (kb) => 'data:image/jpeg;base64,' + 'A'.repeat(kb * 1024);
const T0 = Date.now() - 3 * 3600_000;
const agoraMenos = (h) => new Date(Date.now() - h * 3600_000).toISOString();

await p.app.deleteMany({ where: { slug: SLUG } });
const dono = await p.user.upsert({ where: { email: EMAIL }, update: {}, create: { email: EMAIL, passwordHash: 'x' } });
const app = await p.app.create({ data: { slug: SLUG, name: 'rota 432', ownerId: dono.id } });
try {
  await p.modelDef.create({ data: { appId: app.id, name: `${SLUG}_Msg`, schema: { type: 'object' } } });
  const apis = await buildModelsApi(p, app.id, SLUG);
  const Msg = apis[`${SLUG}_Msg`];

  // 'a3': aberta, com as mensagens mais ANTIGAS (criadas primeiro) e anexos; 520 de
  // ruído criadas depois as empurram para fora das 500 mais recentes, então a
  // prévia de 'a3' só aparece pela leitura por conversa. 'a1' e 'a2', as últimas.
  const linhas = [];
  let ms = 0;
  const add = (d, anexoKb) => {
    linhas.push({ appId: app.id, modelName: `${SLUG}_Msg`, createdAt: new Date(T0 + ms++ * 1000),
      data: { ...d, ...(anexoKb ? { media_data: GRANDE(anexoKb), media_type: 'image' } : {}) } });
  };
  add({ id: 'm_a3_1', conversation_id: 'a3', from_me: false, sender_name: 'Tres', sender_jid: '5519333@s.whatsapp.net', body: 'fotinho', timestamp: agoraMenos(120) }, 200);
  add({ id: 'm_a3_2', conversation_id: 'a3', from_me: false, sender_name: 'Tres', sender_jid: '5519333@s.whatsapp.net', body: 'preciso de ajuda', timestamp: agoraMenos(110) }, 300);
  for (let i = 0; i < 520; i++) {
    add({ id: 'r' + i, conversation_id: 'ruido', from_me: i % 2 === 0, sender_name: 'Ruido', sender_jid: '5519999@s.whatsapp.net', body: 'r' + i, timestamp: agoraMenos(2 - i / 1000) }, i % 4 === 0 ? 20 : 0);
  }
  add({ id: 'm_a1', conversation_id: 'a1', from_me: false, sender_name: 'Um', sender_jid: '5519111@s.whatsapp.net', body: 'oi, sou o um', timestamp: agoraMenos(0.05) }, 250);
  add({ id: 'm_a2', conversation_id: 'a2', from_me: true, sender_name: 'Atendente', sender_jid: '', body: 'respondido', timestamp: agoraMenos(0.04) }, 0);
  await p.modelRecord.createMany({ data: linhas });

  const conversas = [
    { id: 'a1', status: 'open', remote_jid: '5519111@s.whatsapp.net', contact_name: 'Um', updated_at: agoraMenos(0.2), created_at: agoraMenos(5) },
    { id: 'a2', status: 'open', remote_jid: '5519222@s.whatsapp.net', contact_name: 'Dois', updated_at: agoraMenos(0.3), created_at: agoraMenos(5) },
    { id: 'a3', status: 'open', remote_jid: '5519333@s.whatsapp.net', contact_name: 'Tres', updated_at: agoraMenos(100), created_at: agoraMenos(150) },
    { id: 'f1', status: 'closed', remote_jid: '5519444@s.whatsapp.net', contact_name: 'Fechada', updated_at: agoraMenos(10), created_at: agoraMenos(20) },
  ];
  const leituras = [];
  const comRegistro = {
    ...Msg,
    findMany: async (a) => {
      const r = await Msg.findMany(a);
      leituras.push({
        filtro: a || {},
        linhas: r.length,
        comConteudoIntacto: r.filter((m) => typeof m.media_data === 'string' && m.media_data.length > 1000).length,
        comMarcador: r.filter((m) => m.media_data === '1').length,
        bytes: JSON.stringify(r).length,
        // bytes de CONTEÚDO de anexo que esta leitura devolveu (o marcador "1" não conta)
        bytesDeAnexo: r.reduce((t, m) => t + (typeof m.media_data === 'string' && m.media_data.length > 1 ? m.media_data.length : 0), 0),
      });
      return r;
    },
  };
  const vazio = { findMany: async () => [], findById: async () => null };
  const Conv = {
    findMany: async (a) => {
      const ch = Object.keys(a || {});
      return conversas.filter((c) => ch.every((k) => String(c[k] ?? '') === String(a[k])));
    },
    update: async () => ({}),
  };
  const ctx = () => ({
    params: {}, query: {}, body: {}, headers: {}, user: { id: 'u1' },
    models: {
      Sessao: { findById: async () => null },
      Profile: { findById: async () => ({ id: 'u1', role: 'admin' }), findMany: async () => [] },
      WhatsAppConversation: Conv, WhatsAppMessage: comRegistro,
      SystemSettings: vazio, WaDepartment: vazio, Company: vazio, CompanyContact: vazio,
      Ticket: vazio, WaCloseReason: vazio, WaTag: vazio, WaConversationTag: vazio, WaConversationEvents: vazio,
    },
    reply: { status(x) { this._s = x; return this; }, send(v) { return { status: this._s || 200, body: v }; } },
  });

  leituras.length = 0; const rn = await NOVO(ctx()); const lidasNovo = leituras.slice();
  leituras.length = 0; const ra = await ANTIGO(ctx()); const lidasAntigo = leituras.slice();

  // ── TRAVAS: o caminho aconteceu e a massa tem anexo ──
  const semFiltro = (l) => !('conversation_id' in l.filtro);
  const A = lidasAntigo.find(semFiltro);
  const AC = lidasAntigo.find((l) => l.filtro.conversation_id === 'a3');
  ok('TRAVA — a leitura sem filtro trouxe 500 linhas, com anexos de verdade', A && A.linhas === 500 && A.comConteudoIntacto >= 100, A);
  ok('TRAVA — a prévia de a3 veio pela leitura por conversa, com anexo de verdade', AC && AC.linhas === 2 && AC.comConteudoIntacto === 2, AC);
  ok('TRAVA — a resposta é real: 200, 4 conversas, prévia de a3 presente',
    ra.status === 200 && ra.body.data.length === 4 && /preciso de ajuda/.test((ra.body.data.find((c) => c.id === 'a3').last_message || {}).body || ''),
    ra.body && ra.body.data && ra.body.data.length);

  // ── a comparação ──
  ok('resposta da 432 IDÊNTICA, byte a byte, com e sem o mascaramento (Postgres de verdade)', JSON.stringify(rn) === JSON.stringify(ra), 'divergiu');
  ok('nenhum conteúdo de anexo aparece na resposta', !JSON.stringify(rn).includes('AAAAAAAAAA'), 'base64 vazou');

  // ── o pedido chega à camada e o anexo não sai do banco ──
  ok('no código novo NENHUMA leitura trouxe conteúdo de anexo (só o marcador)',
    lidasNovo.length >= 2 && lidasNovo.every((l) => l.comConteudoIntacto === 0) && lidasNovo.some((l) => l.comMarcador > 0), lidasNovo);
  const bytesAntigo = lidasAntigo.reduce((t, l) => t + l.bytes, 0);
  const bytesNovo = lidasNovo.reduce((t, l) => t + l.bytes, 0);
  // O critério vem da MASSA, não de um número escolhido: o que deixa de sair do
  // banco é (quase) todo o anexo que a leitura antiga devolveu.
  const anexoDoAntigo = lidasAntigo.reduce((t, l) => t + l.bytesDeAnexo, 0);
  ok('o que sai do banco encolhe pelo tamanho do anexo que ele tinha (>= 90% dele)',
    anexoDoAntigo > 0 && (bytesAntigo - bytesNovo) >= 0.9 * anexoDoAntigo, { bytesAntigo, bytesNovo, anexoDoAntigo });
  console.log(`INFO  bytes que saem do banco para o Node numa consulta da lista: sem mascarar ${(bytesAntigo / 1048576).toFixed(2)} MB | mascarado ${(bytesNovo / 1024).toFixed(1)} KB | -${(100 - 100 * bytesNovo / bytesAntigo).toFixed(2)}%`);
} finally {
  await p.modelRecord.deleteMany({ where: { appId: app.id } });
  await p.modelDef.deleteMany({ where: { appId: app.id } });
  await p.app.delete({ where: { id: app.id } });
  await p.user.deleteMany({ where: { email: EMAIL } });
  await p.$disconnect();
}
if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\ntodos os casos passaram');
