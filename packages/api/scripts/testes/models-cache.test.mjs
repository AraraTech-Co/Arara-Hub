// Os modelos de um app são guardados entre requisições (src/lib/models-cache.ts).
//
// O QUE SE PROVA, de ponta a ponta no Fastify (as rotas reais de runtime e de
// modelos, sobre um Prisma falso que CONTA as leituras de `ModelDef`):
//   1. o cache funciona: duas requisições seguidas, uma leitura de `ModelDef`
//      (TRAVA: a primeira requisição leu);
//   2. INVALIDAÇÃO: criar ou editar um modelo pela rota de modelos faz a próxima
//      requisição ver a mudança;
//   3. TTL: expirado, a próxima requisição reconstrói;
//   4. A IDENTIDADE NÃO ATRAVESSA REQUISIÇÕES — o centro deste PR. As duas
//      requisições recebem o MESMO objeto de modelo `Profile` (do cache), e a
//      segunda NÃO pode ver o perfil que a primeira leu: o perfil mudou entre elas
//      e a segunda tem de ler o novo. Dentro de UMA requisição o memo continua
//      valendo (uma leitura para duas consultas);
//   5. carga em voo compartilhada; invalidação durante a carga a descarta; falha
//      de carga não é guardada; cópia rasa por requisição; apps separados;
//      TTL 0 desliga.
//
// As MUTAÇÕES (cada uma aplicada uma vez) reprovam por asserção, não por erro de
// carga. Inclusive: tornar o memo de identidade global (o embrulho por
// requisição removido).
//
// Roda com (precisa de tsx, porque o runtime importa `.js` de arquivos `.ts`):
//   npx tsx scripts/testes/models-cache.test.mjs
import fs from 'node:fs';
import Fastify from 'fastify';
import { registerAppRoutes } from '../../src/lib/static-registry.ts';

const LIB = new URL('../../src/lib/', import.meta.url);
const MOD = new URL('../../src/modules/', import.meta.url);
const ler = (u) => fs.readFileSync(u, 'utf8');

let falhasTotal = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhasTotal++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Prisma falso ────────────────────────────────────────────────────────────
function prismaFalso() {
  const estado = {
    leiturasDeModelDef: 0,
    leiturasDePerfil: 0,
    defs: [{ id: 'd1', appId: 'app1', name: 'meu-app-Profile', schema: { type: 'object' }, version: 1 }],
    perfis: { p1: { id: 'p1', role: 'support', nome: 'Ana' } },
    falharProximaCarga: false,
    atrasoDaCargaMs: 0,
  };
  const app1 = { id: 'app1', slug: 'meu-app', name: 'Meu App', status: 'active', ownerId: 'dono' };
  const app2 = { id: 'app2', slug: 'outro-app', name: 'Outro', status: 'active', ownerId: 'dono' };
  const prisma = {
    app: { findUnique: async ({ where }) => [app1, app2].find((a) => a.slug === where.slug) ?? null },
    modelDef: {
      findMany: async ({ where }) => {
        estado.leiturasDeModelDef++;
        if (estado.atrasoDaCargaMs) await esperar(estado.atrasoDaCargaMs);
        if (estado.falharProximaCarga) { estado.falharProximaCarga = false; throw new Error('banco indisponível'); }
        return estado.defs.filter((d) => d.appId === where.appId).map((d) => ({ ...d }));
      },
      create: async ({ data }) => { const d = { id: 'd' + (estado.defs.length + 1), ...data }; estado.defs.push(d); return d; },
      findUnique: async ({ where }) => {
        const { appId, name } = where.appId_name;
        return estado.defs.find((d) => d.appId === appId && d.name === name) ?? null;
      },
      update: async ({ where, data }) => {
        const d = estado.defs.find((x) => x.id === where.id);
        Object.assign(d, data);
        return d;
      },
    },
    modelRecord: {
      findFirst: async ({ where }) => {
        estado.leiturasDePerfil++;
        const id = where.id ?? where.data?.equals;
        const p = estado.perfis[id];
        return p ? { id, data: { ...p }, createdAt: new Date(0), updatedAt: new Date(0) } : null;
      },
    },
  };
  return { prisma, estado };
}

// ── servidor com as rotas reais ─────────────────────────────────────────────
async function montar({ modelRoutes, runtimeRoutes }) {
  const { prisma, estado } = prismaFalso();
  const app = Fastify();
  app.decorate('prisma', prisma);
  app.decorateRequest('actor', undefined);
  app.addHook('onRequest', async (request) => {
    request.actor = { type: 'user', user: { id: 'u1', email: 'a@b.c' }, roles: ['admin'], memberAppIds: [] };
  });
  registerAppRoutes('meu-app', [
    {
      method: 'GET', path: '/ping', authMode: 'actor', requiredPermissions: [],
      // lê o perfil DUAS vezes (memo da requisição) e devolve o que viu
      handler: async (ctx) => {
        const a = await ctx.models.Profile.findById('p1');
        const b = await ctx.models.Profile.findById('p1');
        return { status: 200, body: { nome: a && a.nome, igual: a === b, modelos: Object.keys(ctx.models).sort() } };
      },
    },
    {
      method: 'GET', path: '/mutar', authMode: 'actor', requiredPermissions: [],
      handler: async (ctx) => { delete ctx.models.Profile; ctx.models.Intruso = {}; return { status: 200, body: { ok: true } }; },
    },
  ]);
  await app.register(modelRoutes);
  await app.register(runtimeRoutes);
  await app.ready();
  const get = async (url) => JSON.parse((await app.inject({ method: 'GET', url })).body);
  return { app, estado, get };
}

async function suiteDeRotas(libCache, mods, rotulo) {
  const falhas = [];
  const { limparCacheDeModels } = libCache;
  limparCacheDeModels();
  process.env.MODELS_CACHE_TTL_MS = '60000';
  const { app, estado, get } = await montar(mods);
  try {
    const r1 = await get('/meu-app/ping');
    if (estado.leiturasDeModelDef !== 1 || !r1.modelos.includes('Profile')) falhas.push('trava-primeira-leu');
    const r2 = await get('/meu-app/ping');
    if (estado.leiturasDeModelDef !== 1) falhas.push('cache-nao-funciona');
    if (r1.igual !== true || r2.igual !== true) falhas.push('memo-dentro-da-requisicao');
    if (estado.leiturasDePerfil !== 2) falhas.push('memo-conta-leituras'); // 1 leitura por requisição, nunca 2

    // identidade: o perfil muda entre as requisições; a seguinte lê o novo
    estado.perfis.p1 = { id: 'p1', role: 'support', nome: 'Bia' };
    const r3 = await get('/meu-app/ping');
    if (r3.nome !== 'Bia') falhas.push('identidade-atravessou-requisicoes');

    // cópia rasa por requisição: um handler que mexe em ctx.models não afeta a seguinte
    await get('/meu-app/mutar');
    const r4 = await get('/meu-app/ping');
    if (!r4.modelos.includes('Profile') || r4.modelos.includes('Intruso')) falhas.push('copia-rasa');

    // invalidação por criação
    const antes = estado.leiturasDeModelDef;
    const criado = await app.inject({ method: 'POST', url: '/meu-app/models', payload: { name: 'meu-app-Novo', schema: { type: 'object' } } });
    if (criado.statusCode !== 201) falhas.push('criacao-falhou:' + criado.statusCode);
    const r5 = await get('/meu-app/ping');
    if (!r5.modelos.includes('Novo') || estado.leiturasDeModelDef !== antes + 1) falhas.push('invalidacao-na-criacao');

    // invalidação por edição
    const antesPatch = estado.leiturasDeModelDef;
    const editado = await app.inject({ method: 'PATCH', url: '/meu-app/models/Novo', payload: { schema: { type: 'object', properties: {} } } });
    if (editado.statusCode !== 200) falhas.push('edicao-falhou:' + editado.statusCode);
    await get('/meu-app/ping');
    if (estado.leiturasDeModelDef !== antesPatch + 1) falhas.push('invalidacao-na-edicao');

    // TTL
    process.env.MODELS_CACHE_TTL_MS = '40';
    limparCacheDeModels();
    const n0 = estado.leiturasDeModelDef;
    await get('/meu-app/ping'); await get('/meu-app/ping');
    if (estado.leiturasDeModelDef !== n0 + 1) falhas.push('ttl-antes-de-expirar');
    await esperar(90);
    await get('/meu-app/ping');
    if (estado.leiturasDeModelDef !== n0 + 2) falhas.push('ttl-expirado-nao-reconstroi');
  } finally {
    await app.close();
  }
  return falhas;
}

async function suiteDaLib(lib, rotulo) {
  const falhas = [];
  const { modelsDoApp, invalidarModelsDoApp, limparCacheDeModels } = lib;
  process.env.MODELS_CACHE_TTL_MS = '60000';
  let prisma, estado;

  // o cache funciona: duas chamadas seguidas, uma leitura (TRAVA: a primeira leu)
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  await modelsDoApp(prisma, 'app1', 'meu-app');
  const lidoNaPrimeira = estado.leiturasDeModelDef;
  await modelsDoApp(prisma, 'app1', 'meu-app');
  if (lidoNaPrimeira !== 1 || estado.leiturasDeModelDef !== 1) falhas.push('cache-nao-funciona-na-lib');

  // TTL com relógio injetado: dentro dele não relê, passado dele relê
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  process.env.MODELS_CACHE_TTL_MS = '1000';
  await modelsDoApp(prisma, 'app1', 'meu-app', () => 5000);
  await modelsDoApp(prisma, 'app1', 'meu-app', () => 5999);
  const dentro = estado.leiturasDeModelDef;
  await modelsDoApp(prisma, 'app1', 'meu-app', () => 6001);
  if (dentro !== 1 || estado.leiturasDeModelDef !== 2) falhas.push('ttl-na-lib');
  process.env.MODELS_CACHE_TTL_MS = '60000';

  // cópia rasa: apagar uma chave do mapa recebido não afeta a próxima chamada
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  const m1 = await modelsDoApp(prisma, 'app1', 'meu-app');
  delete m1.Profile; m1.Intruso = {};
  const m2 = await modelsDoApp(prisma, 'app1', 'meu-app');           // acerto do cache
  delete m2.Profile; m2.Intruso = {};
  const m3 = await modelsDoApp(prisma, 'app1', 'meu-app');           // outro acerto
  if (!m3.Profile || m3.Intruso || m1 === m2 || m2 === m3) falhas.push('copia-rasa-na-lib');

  // carga em voo compartilhada
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  estado.atrasoDaCargaMs = 40;
  await Promise.all([modelsDoApp(prisma, 'app1', 'meu-app'), modelsDoApp(prisma, 'app1', 'meu-app'), modelsDoApp(prisma, 'app1', 'meu-app')]);
  if (estado.leiturasDeModelDef !== 1) falhas.push('carga-em-voo-compartilhada');

  // invalidação durante a carga: o resultado não é guardado e a próxima chamada recarrega
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  estado.atrasoDaCargaMs = 40;
  const emCarga = modelsDoApp(prisma, 'app1', 'meu-app');
  await esperar(10);
  invalidarModelsDoApp('app1');
  await emCarga;
  estado.atrasoDaCargaMs = 0;
  await modelsDoApp(prisma, 'app1', 'meu-app');
  if (estado.leiturasDeModelDef !== 2) falhas.push('invalidacao-durante-a-carga');

  // quem chega DEPOIS da invalidação não adota a carga antiga em voo
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  estado.atrasoDaCargaMs = 40;
  const velha = modelsDoApp(prisma, 'app1', 'meu-app');
  await esperar(10);
  invalidarModelsDoApp('app1');
  const nova = modelsDoApp(prisma, 'app1', 'meu-app');
  await Promise.all([velha, nova]);
  if (estado.leiturasDeModelDef !== 2) falhas.push('nova-chamada-nao-adota-carga-antiga');

  // falha de carga não é guardada
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  estado.falharProximaCarga = true;
  let rejeitou = false;
  try { await modelsDoApp(prisma, 'app1', 'meu-app'); } catch { rejeitou = true; }
  const depois = await modelsDoApp(prisma, 'app1', 'meu-app');
  if (!rejeitou || !depois.Profile || estado.leiturasDeModelDef !== 2) falhas.push('falha-nao-e-guardada');

  // apps separados; invalidar um não derruba o outro
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  estado.defs.push({ id: 'd9', appId: 'app2', name: 'outro-app-Coisa', schema: { type: 'object' }, version: 1 });
  const a1 = await modelsDoApp(prisma, 'app1', 'meu-app');
  const a2 = await modelsDoApp(prisma, 'app2', 'outro-app');
  if (!a1.Profile || a1.Coisa || !a2.Coisa || a2.Profile) falhas.push('apps-separados');
  const n = estado.leiturasDeModelDef;
  invalidarModelsDoApp('app1');
  await modelsDoApp(prisma, 'app2', 'outro-app');
  if (estado.leiturasDeModelDef !== n) falhas.push('invalidar-um-derruba-o-outro');
  await modelsDoApp(prisma, 'app1', 'meu-app');
  if (estado.leiturasDeModelDef !== n + 1) falhas.push('invalidar-nao-recarrega');

  // TTL 0 desliga
  limparCacheDeModels();
  ({ prisma, estado } = prismaFalso());
  process.env.MODELS_CACHE_TTL_MS = '0';
  await modelsDoApp(prisma, 'app1', 'meu-app'); await modelsDoApp(prisma, 'app1', 'meu-app');
  const sequenciais = estado.leiturasDeModelDef;
  estado.atrasoDaCargaMs = 30;
  await Promise.all([modelsDoApp(prisma, 'app1', 'meu-app'), modelsDoApp(prisma, 'app1', 'meu-app')]);
  if (sequenciais !== 2 || estado.leiturasDeModelDef !== 4) falhas.push('ttl-zero-desliga');
  process.env.MODELS_CACHE_TTL_MS = '60000';
  return falhas;
}

// o memo de identidade é POR REQUISIÇÃO: dois contextos sobre os MESMOS objetos de modelo
async function suiteDaIdentidade(buildMod) {
  const falhas = [];
  const { prisma, estado } = prismaFalso();
  const { buildModelsApi } = await import('../../src/lib/models.ts');
  const compartilhado = await buildModelsApi(prisma, 'app1', 'meu-app');
  const input = (models) => ({ method: 'GET', params: {}, query: {}, body: null, rawBody: null, headers: {}, user: null, app: { id: 'app1', slug: 'meu-app', name: 'x' }, models, prisma });
  const c1 = await buildMod.buildHandlerCtx(input({ ...compartilhado }));
  const a = await c1.models.Profile.findById('p1');
  estado.perfis.p1 = { id: 'p1', role: 'admin', nome: 'Bia' };
  const c2 = await buildMod.buildHandlerCtx(input({ ...compartilhado }));
  const b = await c2.models.Profile.findById('p1');
  if (a.nome !== 'Ana' || b.nome !== 'Bia') falhas.push('memo-vaza-entre-contextos');
  const b2 = await c2.models.Profile.findById('p1');
  if (b2 !== b) falhas.push('memo-dentro-do-contexto');
  if (c1.models.Profile === compartilhado.Profile) falhas.push('perfil-nao-embrulhado');
  return falhas;
}

// ── execução ────────────────────────────────────────────────────────────────
const libCache = await import('../../src/lib/models-cache.ts');
const modelRoutes = (await import('../../src/modules/models/routes.ts')).modelRoutes;
const runtimeRoutes = (await import('../../src/modules/runtime/routes.ts')).runtimeRoutes;
const buildMod = await import('../../src/lib/build-handler-ctx.ts');

const fRotas = await suiteDeRotas(libCache, { modelRoutes, runtimeRoutes });
const fLib = await suiteDaLib(libCache);
const fId = await suiteDaIdentidade(buildMod);
ok('TRAVA + cache: a primeira requisição leu os ModelDef e a segunda não', !fRotas.includes('trava-primeira-leu') && !fRotas.includes('cache-nao-funciona'), fRotas);
ok('memo de identidade dentro de UMA requisição: uma leitura para duas consultas', !fRotas.includes('memo-dentro-da-requisicao') && !fRotas.includes('memo-conta-leituras'), fRotas);
ok('A IDENTIDADE NÃO ATRAVESSA REQUISIÇÕES: o perfil que mudou entre duas requisições é lido de novo', !fRotas.includes('identidade-atravessou-requisicoes'), fRotas);
ok('cada requisição recebe uma cópia rasa dos modelos', !fRotas.includes('copia-rasa'), fRotas);
ok('criar um modelo pela rota de modelos invalida: a próxima requisição o vê', !fRotas.includes('invalidacao-na-criacao') && !fRotas.some((f) => f.startsWith('criacao-falhou')), fRotas);
ok('editar um modelo pela rota de modelos invalida: a próxima requisição reconstrói', !fRotas.includes('invalidacao-na-edicao') && !fRotas.some((f) => f.startsWith('edicao-falhou')), fRotas);
ok('TTL: dentro dele não reconstrói, expirado reconstrói', !fRotas.includes('ttl-antes-de-expirar') && !fRotas.includes('ttl-expirado-nao-reconstroi'), fRotas);
ok('o cache funciona na lib: duas chamadas, uma leitura (trava: a primeira leu); TTL com relógio injetado; cópia rasa', !fLib.some((f) => ['cache-nao-funciona-na-lib', 'ttl-na-lib', 'copia-rasa-na-lib'].includes(f)), fLib);
ok('carga em voo compartilhada (3 chamadas, 1 leitura)', !fLib.includes('carga-em-voo-compartilhada'), fLib);
ok('invalidação durante a carga a descarta; quem chega depois não adota a carga antiga', !fLib.includes('invalidacao-durante-a-carga') && !fLib.includes('nova-chamada-nao-adota-carga-antiga'), fLib);
ok('falha de carga chega a quem pediu e não é guardada', !fLib.includes('falha-nao-e-guardada'), fLib);
ok('apps separados; invalidar um não derruba o outro e recarrega o invalidado', !fLib.some((f) => ['apps-separados', 'invalidar-um-derruba-o-outro', 'invalidar-nao-recarrega'].includes(f)), fLib);
ok('MODELS_CACHE_TTL_MS=0 desliga o cache (nem a carga em voo é compartilhada)', !fLib.includes('ttl-zero-desliga'), fLib);
ok('dois contextos sobre os MESMOS objetos de modelo não compartilham o memo de identidade', fId.length === 0, fId);

// ── mutações ────────────────────────────────────────────────────────────────
const cacheSrc = ler(new URL('models-cache.ts', LIB));
const rotasModelosSrc = ler(new URL('models/routes.ts', MOD));
const buildSrc = ler(new URL('build-handler-ctx.ts', LIB));
const rotasRuntimeSrc = ler(new URL('runtime/routes.ts', MOD));
const MUTS = [
  { nome: 'o resultado nunca é guardado', arq: 'cache', de: 'entradas.set(chave, { apis, ate: agora() + ttl })', para: 'void apis' },
  { nome: 'TTL ignorado (entrada nunca expira)', arq: 'cache', de: 'if (guardada && guardada.ate > agora())', para: 'if (guardada)' },
  { nome: 'devolve o mapa compartilhado, sem cópia', arq: 'cache', de: 'return { ...guardada.apis }', para: 'return guardada.apis' },
  { nome: 'invalidação durante a carga não descarta o resultado', arq: 'cache', de: 'if ((geracao.get(appId) ?? 0) === geracaoDaCarga) {', para: 'if (true) {' },
  { nome: 'a carga em voo não é compartilhada', arq: 'cache', de: 'if (emVoo) return { ...(await emVoo) }', para: '' },
  { nome: 'falha de carga é guardada', arq: 'cache', de: '    .then((apis) => {', para: '    .catch(() => ({}) as Record<string, ModelApi>)\n    .then((apis) => {' },
  { nome: 'invalidar não apaga as entradas', arq: 'cache', de: 'for (const chave of [...entradas.keys()]) if (chave.startsWith(prefixo)) entradas.delete(chave)', para: '' },
  { nome: 'TTL 0 não desliga', arq: 'cache', de: 'if (ttl === 0) return buildModelsApi(prisma, appId, appSlug)', para: '' },
  { nome: 'a criação de modelo não invalida', arq: 'rotasModelos', de: "      } finally {\n        // Os modelos guardados do app deixam de valer assim que a escrita termina.\n        invalidarModelsDoApp(found.id)\n      }", para: '      } finally {\n      }' },
  { nome: 'a edição de modelo não invalida', arq: 'rotasModelos', de: "    } finally {\n      // Os modelos guardados do app deixam de valer assim que a escrita termina.\n      invalidarModelsDoApp(found.id)\n    }", para: '    } finally {\n    }' },
  { nome: 'o memo de identidade vira global (embrulho por requisição removido)', arq: 'build', de: '  const memo = new Map<string, unknown>()\n', para: '', extra: (s) => s.replace('function comMemoDeIdentidade(', 'const memo = new Map<string, unknown>()\nfunction comMemoDeIdentidade(') },
];
const FONTES = { cache: [cacheSrc, new URL('models-cache.ts', LIB), new URL('_models-cache.mut.ts', LIB)], rotasModelos: [rotasModelosSrc, new URL('models/routes.ts', MOD), new URL('models/_routes.mut.ts', MOD)], build: [buildSrc, new URL('build-handler-ctx.ts', LIB), new URL('_build-handler-ctx.mut.ts', LIB)] };
for (const m of MUTS) {
  const [src, , destino] = FONTES[m.arq];
  const n = src.split(m.de).length - 1;
  if (n !== 1) { ok(`mutação "${m.nome}" aplica exatamente uma vez`, false, n); continue; }
  let mutado = src.replace(m.de, () => m.para);
  if (m.extra) mutado = m.extra(mutado);
  fs.writeFileSync(destino, mutado);
  try {
    let f = [];
    const tag = '?m=' + encodeURIComponent(m.nome);
    if (m.arq === 'cache') {
      const lib = await import(destino.href + tag);
      f = await suiteDaLib(lib);
    } else if (m.arq === 'rotasModelos') {
      const mr = (await import(destino.href + tag)).modelRoutes;
      f = await suiteDeRotas(libCache, { modelRoutes: mr, runtimeRoutes });
    } else {
      const bm = await import(destino.href + tag);
      f = await suiteDaIdentidade(bm);
    }
    ok(`mutação "${m.nome}" é pega (${f.join(',')})`, f.length > 0, 'sobreviveu');
  } catch (e) {
    ok(`mutação "${m.nome}" reprova por asserção, não por erro de carga`, false, String(e).slice(0, 200));
  } finally {
    fs.rmSync(destino, { force: true });
  }
}
void rotasRuntimeSrc;
process.env.MODELS_CACHE_TTL_MS = '60000';
if (falhasTotal) { console.log(`\n${falhasTotal} FALHA(S)`); process.exit(1); }
console.log('\ntodos os casos passaram');
