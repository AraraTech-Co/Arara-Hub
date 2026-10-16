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

// ── As formas de valor que a máscara precisa tratar ────────────────────────
// A regra do contrato é a de VERDADE do JavaScript, porque o consumidor é
// `media_data ? m.id : null`. Falsas: null, false, 0, "". Todo o resto é
// verdadeiro, inclusive "0", "false", [] e {}.
const FALSAS = [
  ['JSON null', null],
  ['false', false],
  ['zero', 0],
  ['string vazia', ''],
];
const VERDADEIRAS = [
  ['true', true],
  ['um', 1],
  ['menos um', -1],
  ['meio', 0.5],
  ['texto', 'x'],
  ['espaço', ' '],
  ['a string "0" (verdadeira em JS)', '0'],
  ['a string "false" (verdadeira em JS)', 'false'],
  ['array vazio (verdadeiro em JS)', []],
  ['objeto vazio (verdadeiro em JS)', {}],
  ['objeto com conteúdo', { a: 1 }],
  ['data URI de verdade', BASE64_GRANDE],
  ['a string "1" (a máscara aplicada duas vezes)', '1'],
];
// Formas de zero que o JS NUNCA grava, mas o JSONB aceita: só dá para plantá-las
// por SQL cru. Para o JS, todas parseiam para 0 (falso).
const ZEROS_DE_SQL = [
  ['0.0 gravado por SQL', '0.0'],
  ['-0 gravado por SQL', '-0'],
  ['0e5 gravado por SQL', '0e5'],
];
const modeloFormas = `${SLUG}_Mensagem`;
const idDe = (rotulo) => 'forma_' + rotulo.replace(/\W+/g, '_');
for (const [rotulo, valor] of [...FALSAS, ...VERDADEIRAS]) {
  await prisma.modelRecord.create({
    data: { appId, modelName: modeloFormas, data: { id: idDe(rotulo), conversation_id: 'formas', media_data: valor } },
  });
}
for (const [rotulo, literal] of ZEROS_DE_SQL) {
  await prisma.modelRecord.create({
    data: { appId, modelName: modeloFormas, data: { id: idDe(rotulo), conversation_id: 'formas', media_data: 'placeholder' } },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE model_records SET data = jsonb_set(data, '{media_data}', '${literal}'::jsonb)
      WHERE app_id = $1 AND model_name = $2 AND data->>'id' = $3`,
    appId, modeloFormas, idDe(rotulo),
  );
}
await prisma.modelRecord.create({
  data: { appId, modelName: modeloFormas, data: { id: idDe('chave ausente'), conversation_id: 'formas' } },
});
// Linha com um campo NÃO ESCALAR (array), para o caso do filtro não escalar:
// só filtrando por esse array a linha casa, e ela tem anexo para ser (ou não)
// mascarado.
await prisma.modelRecord.create({
  data: { appId, modelName: modeloFormas, data: { id: 'nao_escalar_1', conversation_id: 'nao-escalar', etiquetas: ['a', 'b'], media_data: BASE64_GRANDE } },
});

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

test('filtro não escalar cai no caminho de sempre: acha a linha e NÃO mascara', async () => {
  // O caminho mascarado reescreve a comparação à mão e só sabe traduzir valor
  // escalar; para um filtro com array ou objeto o certo é usar o caminho de
  // sempre, que o Prisma sabe comparar. "Sem mascarar" significa que o anexo
  // volta INTEIRO.
  //
  // O filtro é por um campo-ARRAY de uma linha que existe e tem anexo. (Um
  // filtro que não casa nada, como `{ igual: 'c1' }`, devolveria lista vazia e
  // não provaria nada sobre mascarar ou não.)
  const filtro = { etiquetas: ['a', 'b'] };

  // Controle: o próprio filtro funciona no caminho de sempre.
  const semMascara = await Msg.findMany({ ...filtro });
  assert.equal(semMascara.length, 1, 'o filtro por array deveria achar a linha no caminho de sempre');
  assert.equal(semMascara[0].id, 'nao_escalar_1');

  // Com a opção ligada, o filtro não escalar NÃO entra no caminho mascarado.
  const r = await Msg.findMany({ ...filtro, mascararCampos: ['media_data'] });
  assert.equal(r.length, 1, 'com mascararCampos o filtro não escalar deveria achar a mesma linha');
  assert.equal(r[0].id, 'nao_escalar_1');
  assert.equal(r[0].media_data, BASE64_GRANDE,
    'o filtro não escalar caiu no caminho mascarado: o anexo deveria voltar inteiro');
});

test('contraste: a MESMA linha, com filtro escalar, é mascarada', async () => {
  // Sem este contraste, "não mascarou" no caso acima poderia ser só a opção não
  // fazer nada. Aqui o filtro é escalar e a opção age sobre a mesma linha.
  const r = await Msg.findMany({ conversation_id: 'nao-escalar', mascararCampos: ['media_data'] });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'nao_escalar_1');
  assert.equal(r[0].media_data, '1', 'com filtro escalar a opção deveria mascarar');
});

// ── A máscara PRESERVA A FALSIDADE ─────────────────────────────────────────
//
// O consumidor testa `media_data ? m.id : null`. "1" é verdadeiro, então
// mascarar um valor FALSO faria um campo vazio parecer preenchido (a listagem
// mostraria clipe de anexo em mensagem que não tem anexo). Cada forma tem o seu
// teste, para a falha dizer QUAL forma quebrou.
async function lerAmbos() {
  const normal = await Msg.findMany({ conversation_id: 'formas' });
  const mascarado = await Msg.findMany({ conversation_id: 'formas', mascararCampos: ['media_data'] });
  const par = (rotulo) => ({
    original: normal.find((m) => m.id === idDe(rotulo)),
    mascarado: mascarado.find((m) => m.id === idDe(rotulo)),
  });
  return { normal, mascarado, par };
}

for (const [rotulo] of [...FALSAS, ...ZEROS_DE_SQL]) {
  test(`valor FALSO preservado, não mascarado: ${rotulo}`, async () => {
    const { par } = await lerAmbos();
    const { original, mascarado } = par(rotulo);
    assert.ok(original && mascarado, 'a linha da forma não veio: ' + rotulo);
    assert.ok(!original.media_data, 'pré-condição: o valor original é falso em JS');
    assert.ok(!mascarado.media_data,
      `a máscara tornou VERDADEIRO um valor falso (${rotulo}): ${JSON.stringify(mascarado.media_data)}`);
    // `===` e não `Object.is`: o contrato é de verdade, e -0 === 0 em JS.
    assert.ok(mascarado.media_data === original.media_data,
      `o valor falso deveria sair idêntico, saiu ${JSON.stringify(mascarado.media_data)} em vez de ${JSON.stringify(original.media_data)}`);
  });
}

for (const [rotulo] of VERDADEIRAS) {
  test(`valor VERDADEIRO mascarado para "1": ${rotulo}`, async () => {
    const { par } = await lerAmbos();
    const { original, mascarado } = par(rotulo);
    assert.ok(original && mascarado, 'a linha da forma não veio: ' + rotulo);
    assert.ok(original.media_data, 'pré-condição: o valor original é verdadeiro em JS');
    assert.equal(mascarado.media_data, '1', `não mascarou (${rotulo}): ${JSON.stringify(mascarado.media_data)}`);
    assert.ok(mascarado.media_data, 'e continua verdadeiro');
  });
}

test('chave ausente continua ausente (jsonb_set a CRIARIA)', async () => {
  const { par } = await lerAmbos();
  const { original, mascarado } = par('chave ausente');
  assert.ok(original && mascarado, 'a linha sem a chave não veio');
  assert.ok(!('media_data' in original), 'pré-condição: a chave não existe');
  assert.ok(!('media_data' in mascarado), 'a máscara CRIOU a chave');
});

// ══ O CONTRATO ═════════════════════════════════════════════════════════════
// As listas acima são AMOSTRA; esta é a REGRA. Para qualquer forma de valor:
//
//     !!mascarado === !!original
//
// É exatamente o que `media_data ? m.id : null` consome. Se alguém acrescentar
// uma forma nova (ao grupo acima ou ao banco), é esta asserção que acusa.
// Complementos: valor falso sai IDÊNTICO; valor verdadeiro sai "1".
test('CONTRATO: !!mascarado === !!original, para toda forma', async () => {
  const { normal, mascarado } = await lerAmbos();
  assert.ok(normal.length >= FALSAS.length + VERDADEIRAS.length + ZEROS_DE_SQL.length + 1,
    'a massa de formas não veio inteira: ' + normal.length);
  const violacoes = [];
  for (const o of normal) {
    const m = mascarado.find((x) => x.id === o.id);
    if (!m) { violacoes.push({ id: o.id, erro: 'sumiu no caminho mascarado' }); continue; }
    if (Boolean(m.media_data) !== Boolean(o.media_data)) {
      violacoes.push({ id: o.id, original: o.media_data, mascarado: m.media_data, erro: 'verdade mudou' });
    } else if (o.media_data && m.media_data !== '1') {
      violacoes.push({ id: o.id, mascarado: m.media_data, erro: 'verdadeiro e não mascarado' });
    } else if (!o.media_data && m.media_data !== o.media_data) {
      violacoes.push({ id: o.id, original: o.media_data, mascarado: m.media_data, erro: 'falso e alterado' });
    }
  }
  assert.deepEqual(violacoes, [], 'violações do contrato: ' + JSON.stringify(violacoes).slice(0, 600));
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
