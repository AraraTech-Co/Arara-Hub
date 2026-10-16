// A identidade é resolvida uma vez por requisição — e continua sendo negada
// quando não existe.
//
// Duas coisas neste PR:
//  1. `requireActor` reaproveita `request.actor`, que o plugin de autenticação
//     já resolveu no `preHandler`. Eram duas resoluções por requisição em 37
//     pontos de chamada, e com chave de API cada resolução custa uma leitura
//     (`apiKey.findFirst`) MAIS uma escrita (`apiKey.update` do `lastUsedAt`).
//  2. `buildHandlerCtx` passa a memorizar `Profile.findById` por REQUISIÇÃO,
//     porque as guardas empilhadas dentro dos handlers leem o perfil 2 a 3
//     vezes.
//
// O CASO QUE MAIS IMPORTA AQUI É O DE NEGAR. `request.actor` fica `undefined`
// tanto quando não há credencial quanto quando a credencial é INVÁLIDA — o
// preHandler faz `?? undefined` sobre um `resolveActor` que devolve `null`.
// Reaproveitar um valor ausente transformaria "não identificado" em "siga". Os
// dois casos têm teste.
//
// Roda com: node --test scripts/testes/identidade-uma-vez.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

// O código-fonte importa os vizinhos com extensão `.js` — é o que o `tsc`
// exige para a saída NodeNext —, mas aqui não há build: existe só o `.ts`. O
// Node não reescreve a extensão sozinho, então um gancho de resolução aponta
// cada `./algo.js` local para o `./algo.ts` quando ele existe.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && spec.endsWith('.js') && ctx.parentURL?.startsWith('file:')) {
      const base = path.dirname(fileURLToPath(ctx.parentURL));
      const comTs = path.resolve(base, spec.replace(/\.js$/, '.ts'));
      if (fs.existsSync(comTs)) {
        return { url: pathToFileURL(comTs).href, shortCircuit: true };
      }
    }
    return next(spec, ctx);
  },
});

const { requireActor } = await import('../../src/lib/auth.ts');
const { buildHandlerCtx } = await import('../../src/lib/build-handler-ctx.ts');

const CHAVE_BOA = 'chave-valida';

/** Prisma mínimo, contando o que cada caminho custa. */
function prismaFalso(estado) {
  return {
    apiKey: {
      findFirst: async () => {
        estado.leiturasDeChave++;
        return {
          id: 'k1', appId: 'a1', scopes: ['*'], keyHash: 'h',
          app: { id: 'a1', slug: 'portal', ownerId: 'u0', status: 'active' },
        };
      },
      update: async () => { estado.escritasDeChave++; return {}; },
    },
    user: { findUnique: async () => null },
    appMembership: { findMany: async () => [] },
    userRole: { findMany: async () => [] },
  };
}

const pedido = (headers, ator) => ({ headers, actor: ator });
const resposta = () => {
  const r = { _status: 200, _body: null };
  r.status = (s) => { r._status = s; return r };
  r.send = (b) => { r._body = b; return r };
  return r;
};

test('ator já resolvido: NÃO resolve de novo', async () => {
  const estado = { leiturasDeChave: 0, escritasDeChave: 0 };
  const req = pedido({ 'x-api-key': CHAVE_BOA }, { type: 'apiKey', apiKeyId: 'k1', appId: 'a1', appSlug: 'portal', ownerId: 'u0', scopes: ['*'] });
  const ator = await requireActor(req, resposta(), prismaFalso(estado));
  assert.ok(ator, 'devia devolver o ator');
  assert.equal(estado.leiturasDeChave, 0, 'leu a chave de novo');
  assert.equal(estado.escritasDeChave, 0, 'escreveu lastUsedAt de novo');
});

test('sem ator pronto: resolve, e cobra uma leitura e uma escrita', async () => {
  const estado = { leiturasDeChave: 0, escritasDeChave: 0 };
  const req = pedido({ 'x-api-key': CHAVE_BOA }, undefined);
  const ator = await requireActor(req, resposta(), prismaFalso(estado));
  assert.ok(ator, 'devia resolver');
  assert.equal(estado.leiturasDeChave, 1);
  assert.equal(estado.escritasDeChave, 1);
  assert.equal(req.actor, ator, 'e guarda para o resto da requisição');
});

test('CREDENCIAL INVÁLIDA: nega com 401', async () => {
  // O buraco por onde esse tipo de mudança vaza: `request.actor` undefined
  // porque a credencial é RUIM, não porque não foi tentada.
  const estado = { leiturasDeChave: 0, escritasDeChave: 0 };
  const prisma = prismaFalso(estado);
  prisma.apiKey.findFirst = async () => { estado.leiturasDeChave++; return null };
  const req = pedido({ 'x-api-key': 'chave-que-nao-existe' }, undefined);
  const res = resposta();
  const ator = await requireActor(req, res, prisma);
  assert.equal(ator, null, 'não pode devolver ator');
  assert.equal(res._status, 401, 'tem de negar com 401');
  assert.equal(estado.escritasDeChave, 0, 'chave inválida não atualiza lastUsedAt');
});

test('sem credencial nenhuma: nega com 401', async () => {
  const estado = { leiturasDeChave: 0, escritasDeChave: 0 };
  const req = pedido({}, undefined);
  const res = resposta();
  const ator = await requireActor(req, res, prismaFalso(estado));
  assert.equal(ator, null);
  assert.equal(res._status, 401);
});

test('ator FALSO-POSITIVO não existe: valor vazio não é reaproveitado', async () => {
  // `null` e `undefined` são os dois jeitos de "não tem"; nenhum pode passar.
  for (const vazio of [undefined, null]) {
    const estado = { leiturasDeChave: 0, escritasDeChave: 0 };
    const prisma = prismaFalso(estado);
    prisma.apiKey.findFirst = async () => null;
    const res = resposta();
    const ator = await requireActor(pedido({}, vazio), res, prisma);
    assert.equal(ator, null, `ator ${String(vazio)} não pode virar acesso`);
    assert.equal(res._status, 401);
  }
});

// ── O memo de perfil, por requisição ──────────────────────────────────────
function modelsFalsos(estado, perfil) {
  const atual = { ...perfil };
  return {
    Profile: {
      findById: async (id) => { estado.leiturasDePerfil++; return id === atual.id ? { ...atual } : null },
      findMany: async () => [{ ...atual }],
      create: async (d) => d,
      update: async (id, p) => { Object.assign(atual, p); return { ...atual } },
      delete: async () => ({ ok: true }),
    },
  };
}

async function ctxDe(models) {
  return buildHandlerCtx({
    method: 'GET', params: {}, query: {}, body: {}, headers: {},
    user: { id: 'u1' },
    app: { id: 'a1', slug: 'portal', name: 'Portal' },
    models,
    prisma: { $queryRaw: async () => [] },
  });
}

test('três leituras do MESMO perfil numa requisição: uma no banco', async () => {
  const estado = { leiturasDePerfil: 0 };
  const ctx = await ctxDe(modelsFalsos(estado, { id: 'u1', role: 'support' }));
  const a = await ctx.models.Profile.findById('u1');
  const b = await ctx.models.Profile.findById('u1');
  const c = await ctx.models.Profile.findById('u1');
  assert.equal(estado.leiturasDePerfil, 1, 'leu o banco mais de uma vez');
  assert.equal(a.role, 'support');
  assert.equal(b.role, 'support');
  assert.equal(c.role, 'support');
});

test('perfis diferentes não se confundem', async () => {
  const estado = { leiturasDePerfil: 0 };
  const ctx = await ctxDe(modelsFalsos(estado, { id: 'u1', role: 'support' }));
  const eu = await ctx.models.Profile.findById('u1');
  const outro = await ctx.models.Profile.findById('u2');
  assert.equal(eu.role, 'support');
  assert.equal(outro, null, 'id desconhecido não pode devolver o perfil do memo');
  assert.equal(estado.leiturasDePerfil, 2, 'cada id é uma leitura');
});

test('escrita no perfil invalida o memo DENTRO da requisição', async () => {
  const estado = { leiturasDePerfil: 0 };
  const ctx = await ctxDe(modelsFalsos(estado, { id: 'u1', role: 'admin' }));
  const antes = await ctx.models.Profile.findById('u1');
  assert.equal(antes.role, 'admin');
  await ctx.models.Profile.update('u1', { role: 'user' });
  const depois = await ctx.models.Profile.findById('u1');
  assert.equal(depois.role, 'user', 'releu o valor velho depois de rebaixar no mesmo pedido');
  assert.equal(estado.leiturasDePerfil, 2, 'a segunda leitura tem de ir ao banco');
});

test('o memo NÃO cruza requisições: nível rebaixado vale no pedido seguinte', async () => {
  // É o ponto inegociável: mudança de nível de acesso tem de valer na hora.
  const estado = { leiturasDePerfil: 0 };
  const models = modelsFalsos(estado, { id: 'u1', role: 'admin' });

  const req1 = await ctxDe(models);
  assert.equal((await req1.models.Profile.findById('u1')).role, 'admin');

  // Fora da requisição, alguém rebaixa o nível.
  await models.Profile.update('u1', { role: 'user' });

  const req2 = await ctxDe(models);
  assert.equal((await req2.models.Profile.findById('u1')).role, 'user',
    'a requisição seguinte viu o nível ANTIGO: o memo cruzou requisições');
});

test('sem o model de perfil, nada quebra', async () => {
  const ctx = await ctxDe({});
  assert.ok(ctx.models, 'ctx continua montado');
  assert.equal(ctx.models.Profile, undefined);
});

// ── As duas invariantes de invalidação ────────────────────────────────────
// Acrescentadas depois da revisão do PR, que apontou os dois pontos.
const { ESCRITAS_DO_MODELO } = await import('../../src/lib/build-handler-ctx.ts');

/** Igual ao de cima, mas a escrita demora: dá para correr leitura junto. */
function modelsLentos(estado, perfil, atrasoMs = 10) {
  const atual = { ...perfil };
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = {
    findById: async (id) => { estado.leiturasDePerfil++; return id === atual.id ? { ...atual } : null },
    findMany: async () => [{ ...atual }],
    create: async (d) => d,
    update: async (id, p) => { await espera(atrasoMs); Object.assign(atual, p); return { ...atual } },
    delete: async () => ({ ok: true }),
  };
  // Como o `buildModelsApi` faz: o MESMO objeto sob o nome curto e o completo.
  return { Profile: api, 'portal-suporte.Profile': api, _cru: api };
}

test('leitura CONCORRENTE com escrita não deixa valor velho no memo', async () => {
  // A limpeza cerca a escrita pelos dois lados; o `await` no `try` é o que
  // garante que o `finally` só corre depois de a escrita ter terminado.
  const estado = { leiturasDePerfil: 0 };
  const ctx = await ctxDe(modelsLentos(estado, { id: 'u1', role: 'admin' }));
  const escrita = ctx.models.Profile.update('u1', { role: 'user' });
  const leitura = ctx.models.Profile.findById('u1');
  await Promise.all([escrita, leitura]);
  const depois = await ctx.models.Profile.findById('u1');
  assert.equal(depois.role, 'user',
    'o memo ficou com o valor de antes da escrita pelo resto da requisição');
});

test('escrita por um nome invalida a leitura pelo OUTRO nome', async () => {
  // A ordem importa: LER pelo nome que tem memo, ESCREVER pelo outro, e ler de
  // novo pelo primeiro. Ao contrário — ler por um nome sem memo — a leitura vai
  // ao banco de qualquer forma e o caso não prova nada.
  const estado = { leiturasDePerfil: 0 };
  const ctx = await ctxDe(modelsLentos(estado, { id: 'u1', role: 'admin' }));
  const curto = ctx.models.Profile;
  const completo = ctx.models['portal-suporte.Profile'];
  assert.equal((await curto.findById('u1')).role, 'admin');
  await completo.update('u1', { role: 'user' });
  assert.equal((await curto.findById('u1')).role, 'user',
    'leu perfil velho pelo nome curto depois de escrever pelo nome completo');
});

test('todo nome do MESMO objeto recebe o embrulho', async () => {
  const estado = { leiturasDePerfil: 0 };
  const models = modelsLentos(estado, { id: 'u1', role: 'support' });
  const ctx = await ctxDe(models);
  for (const nome of ['Profile', 'portal-suporte.Profile', '_cru']) {
    assert.notEqual(ctx.models[nome], models._cru, `a chave ${nome} ficou com o objeto cru`);
  }
  // E o memo é um só: três leituras por nomes diferentes, uma no banco.
  await ctx.models.Profile.findById('u1');
  await ctx.models['portal-suporte.Profile'].findById('u1');
  await ctx.models._cru.findById('u1');
  assert.equal(estado.leiturasDePerfil, 1, 'cada nome criou o seu próprio memo');
});

test('a lista de escritas cobre a superfície INTEIRA do ModelApi', async () => {
  // Reprova no dia em que o tipo ganhar `upsert`, `createMany` ou qualquer
  // outro método que escreva e não esteja na lista de invalidação.
  const fonte = fs.readFileSync(
    new URL('../../src/lib/models.ts', import.meta.url), 'utf8',
  );
  const bloco = fonte.match(/export type ModelApi = \{([\s\S]*?)\n\}/);
  assert.ok(bloco, 'não achei a declaração do ModelApi');
  const metodos = [...bloco[1].matchAll(/^\s{2}(\w+)\s*:/gm)].map((m) => m[1]);
  assert.ok(metodos.length >= 5, `achei poucos métodos: ${metodos.join(',')}`);
  const LEITURAS = ['findMany', 'findById'];
  const fora = metodos.filter(
    (n) => !LEITURAS.includes(n) && !ESCRITAS_DO_MODELO.includes(n),
  );
  assert.deepEqual(fora, [],
    `método novo no ModelApi fora da lista de invalidação: ${fora.join(', ')}`);
});
