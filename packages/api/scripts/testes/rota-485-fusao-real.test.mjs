// A fusão de conversas duplicadas no webhook de entrada (485), sobre a camada de
// modelos REAL.
//
// O teste de handlers (apps/portal-suporte/scripts/testes-handlers/
// fusao-por-lid-sem-perder-mensagem) usa um emulador da camada. Este arquivo roda
// a MESMA fusão contra o `buildModelsApi` e um Postgres de verdade, onde a janela
// das 500 mais recentes da TABELA e o filtro por conversa moram de fato, e mostra:
//   - o que o código de ANTES fazia: a duplicada com mensagens fora dessa janela era
//     APAGADA com as mensagens ainda apontando para ela;
//   - o que o código novo garante: as mensagens são movidas (em quantas rodadas for
//     preciso) e a duplicada só é apagada depois de a leitura filtrada voltar vazia.
//
// Só as mensagens são reais; as conversas e o resto do contexto são em memória.
//
// Sem banco, o arquivo se declara PENDENTE e sai: nunca passa por verde sem ter
// rodado.
//
// Roda com:
//   DATABASE_URL=postgresql://... npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://... node scripts/testes/rota-485-fusao-real.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import { buildModelsApi } from '../../src/lib/models.ts';

const p = process.env.DATABASE_URL ? new PrismaClient() : null;
let vivo = false;
if (p) { try { await p.$queryRaw`SELECT 1`; vivo = true; } catch { /* sem banco */ } }
if (!vivo) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: a fusão da 485 NÃO foi exercitada sobre a camada real.');
  process.exit(0);
}

let falhas = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhas++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};

// ── a rota nova e a de ANTES ────────────────────────────────────────────────
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
const BLOCO_ANTIGO = `        try {
          if (Msg) {
            var _msgs = (await Msg.findMany({})) || [];
            for (var mm = 0; mm < _msgs.length; mm++) {
              var _cid = _msgs[mm].conversation_id || _msgs[mm].conversationId;
              if (String(_cid) === String(dup.id)) await Msg.update(_msgs[mm].id, { conversation_id: open.id });
            }
          }
          if (typeof Conv.delete === "function") await Conv.delete(dup.id);
          else await Conv.update(dup.id, { status: "closed", phase: "resolvido", unida_em: open.id, updated_at: ts });
`;
const INI = '        try {\n          // A conversa duplicada só é APAGADA depois de PROVAR';
const FIM = '        } catch (e) {}\n      }\n    }\n    // Re-identify if still blank';
const a = cod.indexOf(INI), b = cod.indexOf(FIM);
ok('o bloco novo da fusão foi localizado e o de antes pôde ser reconstituído', a >= 0 && b > a, { a, b });
const NOVO = compilar(cod);
const ANTIGO = compilar(cod.slice(0, a) + BLOCO_ANTIGO + cod.slice(b));

// ── cenário ─────────────────────────────────────────────────────────────────
const SLUG = 'real-fusao';
const EMAIL = `${SLUG}@teste.local`;
const SEGREDO = 'segredo-da-rota';
const FONE = '5519999990001@s.whatsapp.net';
const LID = '123456789012345';

await p.app.deleteMany({ where: { slug: SLUG } });
const dono = await p.user.upsert({ where: { email: EMAIL }, update: {}, create: { email: EMAIL, passwordHash: 'x' } });
const app = await p.app.create({ data: { slug: SLUG, name: 'fusao', ownerId: dono.id } });
try {
  await p.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS model_records_app_model_created_idx ON model_records (app_id, model_name, created_at DESC)');
  await p.modelDef.create({ data: { appId: app.id, name: `${SLUG}_Msg`, schema: { type: 'object' } } });
  await p.modelDef.create({ data: { appId: app.id, name: `${SLUG}_Ev`, schema: { type: 'object' } } });
  const apis = await buildModelsApi(p, app.id, SLUG);
  const Msg = apis[`${SLUG}_Msg`];
  const Ev = apis[`${SLUG}_Ev`];
  const T0 = Date.UTC(2026, 0, 1);
  const modelName = `${SLUG}_Msg`;
  const modelEv = `${SLUG}_Ev`;

  /** Planta `dup` mensagens ANTIGAS em 'cvB' (snake) + `camel` (camelCase) e `ruido` MAIS NOVAS em 'cvZ'. */
  async function plantar({ dup, camel = 0, ruido, eventos = 0, ruidoEv = 0 }) {
    await p.modelRecord.deleteMany({ where: { appId: app.id } });
    const linhas = [];
    let ms = 0;
    // Eventos: os da duplicada são ANTIGOS e os de ruído, MAIS NOVOS (a janela de 500 da
    // tabela de eventos não os enxerga).
    for (let i = 0; i < eventos; i++) linhas.push({ appId: app.id, modelName: modelEv, createdAt: new Date(T0 + (ms++) * 1000), data: { id: 'ev_' + i, conversation_id: 'cvB', type: 'x' } });
    for (let i = 0; i < ruidoEv; i++) linhas.push({ appId: app.id, modelName: modelEv, createdAt: new Date(T0 + (ms++) * 1000), data: { id: 'evz_' + i, conversation_id: 'cvZ', type: 'x' } });
    const add = (data) => linhas.push({ appId: app.id, modelName, createdAt: new Date(T0 + (ms++) * 1000), data: { from_me: false, body: 'm', timestamp: new Date(T0 + ms * 1000).toISOString(), ...data } });
    for (let i = 0; i < dup; i++) add({ id: 'dup_' + i, conversation_id: 'cvB' });
    for (let i = 0; i < camel; i++) add({ id: 'camel_' + i, conversationId: 'cvB' });
    for (let i = 0; i < ruido; i++) add({ id: 'ruido_' + i, conversation_id: 'cvZ' });
    await p.modelRecord.createMany({ data: linhas });
  }
  // CONTAGENS EM SQL, nunca por `findMany`: a camada devolve no máximo 500 linhas, e uma
  // contagem capada em 500 mentiria justamente nas massas grandes que importam aqui.
  const contarSql = async (conv, regexId, modelo = modelName) => Number((await p.$queryRaw`
    SELECT count(*)::int AS n FROM model_records
     WHERE app_id = ${app.id} AND model_name = ${modelo}
       AND (data->>'conversation_id' = ${conv} OR data->>'conversationId' = ${conv})
       AND data->>'id' ~ ${regexId}`)[0].n);

  async function rodar(handler, opcoes = {}) {
    const convs = [
      { id: 'cvA', status: 'open', remote_jid: FONE, phase: 'novo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'cvB', status: 'open', remote_jid: LID + '@lid', remote_lid: LID, phase: 'novo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ];
    const apagadas = []; let leiturasDeB = 0;
    const vazio = { findMany: async () => [], findById: async () => null };
    const MsgInst = {
      ...Msg,
      findMany: async (a) => { if (a && (a.conversation_id === 'cvB' || a.conversationId === 'cvB')) leiturasDeB++; return Msg.findMany(a); },
      update: async (id, pt) => { if (opcoes.updateFalha) throw new Error('falha de gravação'); return Msg.update(id, pt); },
    };
    const r = await handler({
      params: {}, headers: {}, query: { token: SEGREDO },
      body: { phone: FONE, lid: LID, message: 'oi, sou eu', name: 'Cliente', message_id: 'WA_NOVA_1' },
      secrets: { get: async (n) => (n === 'avisa_webhook_secret' ? SEGREDO : 'tok') },
      fetch: async () => ({ status: 200, body: '{}' }), notify: async () => ({}),
      models: {
        WhatsAppConversation: {
          findById: async (id) => { const c = convs.find((x) => x.id === id); return c ? { ...c } : null },
          findMany: async (a) => { const ch = Object.keys(a || {}); return convs.filter((c) => ch.every((k) => String(c[k] ?? '') === String(a[k]))).map((c) => ({ ...c })) },
          create: async (c) => { convs.push({ ...c }); return c },
          update: async (id, pt) => { const c = convs.find((x) => x.id === id); Object.assign(c, pt); return { ...c } },
          delete: async (id) => { apagadas.push(id); const i = convs.findIndex((x) => x.id === id); if (i >= 0) convs.splice(i, 1); return { ok: true } },
        },
        WhatsAppMessage: MsgInst,
        WaConversationEvents: Ev,
        Profile: { findById: async () => ({ id: 'u9', role: 'support' }), findMany: async () => [] }, Sessao: { findById: async () => null },
        SystemSettings: { findMany: async () => [{ id: 's1', waMenuEnabled: false }], update: async () => ({}) },
        PushInscricao: vazio, PushNaFila: { create: async (x) => x },
        SupportSchedule: vazio, WaFlows: vazio, Company: vazio, CompanyContact: vazio, Contact: vazio, Ticket: vazio, Unit: vazio, ClientUser: vazio, WaConta: vazio, WaTags: vazio, WaConversationTags: vazio,
      },
      reply: { status(x) { this._s = x; return this; }, send(v) { return { status: this._s || 200, body: v }; } },
    });
    await new Promise((res) => setTimeout(res, 40));
    return { r, apagadas, leiturasDeB, convB: convs.find((c) => c.id === 'cvB') };
  }
  const apontamParaB = () => contarSql('cvB', '.*');
  const movidasParaA = () => contarSql('cvA', '^(dup|camel)_');

  // ═══ 1. CONTROLE × AGORA: 6 mensagens antigas da duplicada, 600 mais novas de outra conversa ═══
  {
    await plantar({ dup: 6, ruido: 600 });
    const janela = await Msg.findMany({});
    ok('TRAVA DE MASSA — a janela das 500 mais recentes da TABELA (camada real) não contém nenhuma mensagem da duplicada',
      janela.length === 500 && janela.filter((m) => m.conversation_id === 'cvB').length === 0 && (await apontamParaB()) === 6, { janela: janela.length });
    const antes = await rodar(ANTIGO);
    ok('CONTROLE (camada real) — o código de ANTES apagava a duplicada com as 6 mensagens dentro e nenhuma movida',
      antes.r.status === 200 && antes.apagadas.includes('cvB') && (await movidasParaA()) === 0 && (await apontamParaB()) === 6, { apagadas: antes.apagadas, orfas: await apontamParaB() });
    await plantar({ dup: 6, ruido: 600 });
    const agora = await rodar(NOVO);
    ok('AGORA — as 6 mensagens vão para a conversa que fica, sem órfã, e só então a duplicada é apagada',
      agora.r.status === 200 && (await movidasParaA()) === 6 && (await apontamParaB()) === 0 && agora.apagadas.join() === 'cvB', { movidas: await movidasParaA(), orfas: await apontamParaB(), apagadas: agora.apagadas });
  }

  // ═══ 2. 1300 mensagens: 3 rodadas + a leitura que PROVA ═══
  {
    await plantar({ dup: 1300, ruido: 50 });
    const agora = await rodar(NOVO);
    ok('1300 mensagens na duplicada: todas movidas, nenhuma órfã, apagada depois', (await movidasParaA()) === 1300 && (await apontamParaB()) === 0 && agora.apagadas.join() === 'cvB', { movidas: await movidasParaA(), orfas: await apontamParaB() });
    ok('  4 leituras filtradas da duplicada (500, 500, 300 e a que prova) + 1 da grafia camelCase', agora.leiturasDeB >= 4, agora.leiturasDeB);
  }

  // ═══ 3. grafia camelCase ═══
  {
    await plantar({ dup: 2, camel: 3, ruido: 600 });
    const agora = await rodar(NOVO);
    ok('mensagens em camelCase (`conversationId`) também são movidas, e nada aponta para a duplicada', (await movidasParaA()) === 5 && (await apontamParaB()) === 0 && agora.apagadas.join() === 'cvB', { movidas: await movidasParaA(), orfas: await apontamParaB() });
  }

  // ═══ 3b. os EVENTOS, na camada real: a janela de 500 da tabela de eventos não os vê ═══
  {
    await plantar({ dup: 6, ruido: 20, eventos: 650, ruidoEv: 600 });
    const janelaEv = await Ev.findMany({});
    ok('TRAVA DE MASSA — a janela das 500 mais recentes da tabela de EVENTOS não contém nenhum evento da duplicada',
      janelaEv.length === 500 && janelaEv.filter((e) => e.conversation_id === 'cvB').length === 0 && (await contarSql('cvB', '^ev_', modelEv)) === 650, { janela: janelaEv.length });
    const antes = await rodar(ANTIGO);
    ok('CONTROLE (camada real) — o código de ANTES movia só mensagens: os 650 eventos ficavam apontando para a conversa apagada',
      antes.apagadas.includes('cvB') && (await contarSql('cvB', '^ev_', modelEv)) === 650, { orfas: await contarSql('cvB', '^ev_', modelEv) });
    await plantar({ dup: 6, ruido: 20, eventos: 650, ruidoEv: 600 });
    const agora = await rodar(NOVO);
    ok('AGORA — os 650 eventos (acima de 500) vão para a conversa que fica, sem órfão, e só então apaga',
      (await contarSql('cvA', '^ev_', modelEv)) === 650 && (await contarSql('cvB', '.*', modelEv)) === 0 && agora.apagadas.join() === 'cvB', { movidos: await contarSql('cvA', '^ev_', modelEv), orfaos: await contarSql('cvB', '.*', modelEv) });
  }

  // ═══ 4. sem a prova, NÃO apaga ═══
  {
    await plantar({ dup: 6, ruido: 600 });
    const agora = await rodar(NOVO, { updateFalha: true });
    ok('toda atualização falha: a duplicada NÃO é apagada, fica FECHADA e marcada como unida, e as 6 mensagens continuam nela',
      agora.apagadas.length === 0 && agora.convB && agora.convB.status === 'closed' && agora.convB.unida_em === 'cvA' && (await apontamParaB()) === 6, { apagadas: agora.apagadas, convB: agora.convB });
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
