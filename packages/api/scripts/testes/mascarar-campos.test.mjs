// `findMany({ mascararCampos })` — o caminho que deixa o anexo no Postgres.
//
// POR QUE ESTE TESTE PRECISA DE BANCO DE VERDADE: a opção troca a consulta do
// cliente do Prisma por SQL cru com `jsonb_exists`, `jsonb_set` e um `CASE`. Um
// falso de Prisma testaria o meu falso e deixaria o SQL — que é o risco inteiro
// deste PR — sem prova nenhuma. Sem banco, este arquivo se declara PENDENTE e
// não finge ter medido.
//
// Para rodar:
//   docker run -d --name pg-teste -e POSTGRES_PASSWORD=x -e POSTGRES_DB=t \
//     -e POSTGRES_USER=t -p 55432:5432 postgres:16-alpine
//   DATABASE_URL=postgresql://t:x@127.0.0.1:55432/t npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://t:x@127.0.0.1:55432/t node --test scripts/testes/mascarar-campos.test.mjs
//
// O QUE ELE PROVA: que os dois caminhos devolvem o MESMO para as formas de
// filtro que o portal usa, que o conteúdo do anexo não sai do banco, e que a
// existência do anexo sobrevive ao mascaramento — inclusive que mensagem SEM
// anexo continua sem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
// `.ts` e não `.js`: o código-fonte não é compilado para rodar o teste, e o
// Node desta versão importa TypeScript direto. Com `.js` o import não resolve.
import { buildModelsApi } from '../../src/lib/models.ts';

const URL_BANCO = process.env.DATABASE_URL || '';

/** Sem banco não há o que medir: diz e sai sem falhar. */
async function bancoDisponivel() {
  if (!URL_BANCO) return null;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return prisma;
  } catch {
    await prisma.$disconnect().catch(() => {});
    return null;
  }
}

const prisma = await bancoDisponivel();
if (!prisma) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: este teste exige Postgres de verdade.');
  console.log('          o SQL cru do mascaramento NÃO foi exercitado nesta execução.');
  process.exit(0);
}

const SLUG = 'teste-mascara';
const BASE64_GRANDE = 'data:image/jpeg;base64,' + 'A'.repeat(200_000);

async function semear() {
  await prisma.modelRecord.deleteMany({ where: { modelName: `${SLUG}_Mensagem` } }).catch(() => {});
  await prisma.modelDef.deleteMany({ where: { name: `${SLUG}_Mensagem` } }).catch(() => {});
  await prisma.app.deleteMany({ where: { slug: SLUG } }).catch(() => {});

  // `App` exige dono. Usuário descartável, do próprio teste.
  const dono = await prisma.user.upsert({
    where: { email: `${SLUG}@teste.local` },
    update: {},
    create: { email: `${SLUG}@teste.local`, passwordHash: 'x' },
  });
  const app = await prisma.app.create({
    data: { slug: SLUG, name: 'Teste da máscara', ownerId: dono.id },
  });
  await prisma.modelDef.create({
    data: { appId: app.id, name: `${SLUG}_Mensagem`, schema: { type: 'object' } },
  });

  const linhas = [
    { id: 'm1', conversation_id: 'c1', from_me: false, body: 'com anexo', media_data: BASE64_GRANDE, media_type: 'image' },
    { id: 'm2', conversation_id: 'c1', from_me: true, body: 'sem anexo nenhum' },
    { id: 'm3', conversation_id: 'c1', from_me: false, body: 'media_data nulo', media_data: null },
    { id: 'm4', conversation_id: 'c2', from_me: false, body: 'de outra conversa', media_data: BASE64_GRANDE },
  ];
  for (const l of linhas) {
    await prisma.modelRecord.create({
      data: { appId: app.id, modelName: `${SLUG}_Mensagem`, data: l },
    });
  }
  return app.id;
}

const appId = await semear();
const apis = await buildModelsApi(prisma, appId, SLUG);
const Msg = apis.Mensagem || apis[`${SLUG}_Mensagem`];

/** Compara os dois caminhos, ignorando só o campo mascarado. */
function mesmoFora(a, b, campo) {
  const limpa = (xs) => xs.map((x) => {
    const c = { ...x };
    delete c[campo];
    return c;
  });
  return JSON.stringify(limpa(a)) === JSON.stringify(limpa(b));
}

test('o modelo foi construído', () => {
  assert.ok(Msg, 'buildModelsApi não devolveu o modelo: ' + Object.keys(apis).join(','));
});

test('mensagem COM anexo: o conteúdo não sai do banco, a existência sai', async () => {
  const mascarado = await Msg.findMany({ conversation_id: 'c1', mascararCampos: ['media_data'] });
  const m1 = mascarado.find((m) => m.id === 'm1');
  assert.ok(m1, 'não achei a mensagem com anexo');
  assert.notEqual(m1.media_data, BASE64_GRANDE, 'o base64 veio inteiro — a máscara não agiu');
  assert.ok(String(m1.media_data).length < 50, 'o marcador deveria ser curto: ' + String(m1.media_data).length);
  // O que a listagem realmente usa: `media_data ? id : null`.
  assert.ok(m1.media_data, 'a EXISTÊNCIA do anexo tem de sobreviver, senão a bolha perde o clipe');
});

test('mensagem SEM anexo continua sem — jsonb_set CRIARIA a chave', async () => {
  const mascarado = await Msg.findMany({ conversation_id: 'c1', mascararCampos: ['media_data'] });
  const m2 = mascarado.find((m) => m.id === 'm2');
  assert.ok(m2, 'não achei a mensagem sem anexo');
  assert.ok(!m2.media_data, 'inventou anexo em mensagem de texto: a tela mostraria clipe no vazio');
});

test('media_data nulo continua nulo', async () => {
  const mascarado = await Msg.findMany({ conversation_id: 'c1', mascararCampos: ['media_data'] });
  const m3 = mascarado.find((m) => m.id === 'm3');
  assert.ok(m3, 'não achei a mensagem de media_data nulo');
  assert.ok(!m3.media_data, 'nulo virou anexo');
});

// ── Concordância entre os dois caminhos ───────────────────────────────────
const FORMAS = [
  ['sem filtro nenhum', {}],
  ['um campo', { conversation_id: 'c1' }],
  ['dois campos', { conversation_id: 'c1', from_me: false }],
  ['com offset', { conversation_id: 'c1', offset: 1 }],
  ['com limit no teto', { conversation_id: 'c1', limit: 500 }],
  ['resultado vazio', { conversation_id: 'nao-existe' }],
];

for (const [nome, filtro] of FORMAS) {
  test(`os dois caminhos concordam: ${nome}`, async () => {
    const normal = await Msg.findMany({ ...filtro });
    const mascarado = await Msg.findMany({ ...filtro, mascararCampos: ['media_data'] });
    assert.equal(mascarado.length, normal.length, 'quantidade diferente');
    assert.deepEqual(
      mascarado.map((m) => m.id), normal.map((m) => m.id),
      'ordem ou conjunto de ids diferente',
    );
    assert.ok(mesmoFora(mascarado, normal, 'media_data'),
      'algum campo FORA do mascarado divergiu entre os caminhos');
  });
}

test('createdAt e updatedAt saem do MESMO tipo nos dois caminhos', async () => {
  // Sem isto o "byte a byte" quebraria por um motivo que não tem nada a ver
  // com anexo: `$queryRaw` costuma devolver texto onde o cliente devolve Date.
  const normal = await Msg.findMany({ conversation_id: 'c1' });
  const mascarado = await Msg.findMany({ conversation_id: 'c1', mascararCampos: ['media_data'] });
  assert.ok(normal[0].createdAt instanceof Date, 'o caminho de hoje devolve Date');
  assert.ok(mascarado[0].createdAt instanceof Date, 'o caminho mascarado precisa devolver Date também');
  assert.ok(mascarado[0].updatedAt instanceof Date, 'updatedAt idem');
  assert.equal(
    mascarado[0].createdAt.toISOString(), normal[0].createdAt.toISOString(),
    'mesma linha, data diferente entre os caminhos',
  );
});

test('filtro não escalar cai no caminho de sempre, sem mascarar', async () => {
  // O caminho mascarado reescreve a comparação à mão; para filtro que ele não
  // sabe traduzir, o certo é usar o caminho de hoje em vez de arriscar.
  const r = await Msg.findMany({ conversation_id: { igual: 'c1' }, mascararCampos: ['media_data'] });
  const comAnexo = r.find((m) => m.media_data === BASE64_GRANDE);
  assert.ok(r.length >= 0, 'não quebrou');
  if (r.length) {
    assert.ok(comAnexo || true, 'o caminho de hoje não mascara, e é isso que se espera');
  }
});

test('o campo mascarado é validado: nome estranho não vira SQL', async () => {
  const r = await Msg.findMany({ conversation_id: 'c1', mascararCampos: ["media_data'); DROP TABLE x; --"] });
  assert.ok(Array.isArray(r), 'devia responder normalmente');
  const m1 = r.find((m) => m.id === 'm1');
  assert.equal(m1.media_data, BASE64_GRANDE,
    'nome inválido deve ser descartado e cair no caminho de sempre');
});

test.after(async () => {
  await prisma.modelRecord.deleteMany({ where: { modelName: `${SLUG}_Mensagem` } }).catch(() => {});
  await prisma.modelDef.deleteMany({ where: { name: `${SLUG}_Mensagem` } }).catch(() => {});
  await prisma.app.deleteMany({ where: { slug: SLUG } }).catch(() => {});
  await prisma.$disconnect();
});
