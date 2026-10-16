// As premissas sobre a camada de modelos em que o teste de handlers se apoia.
//
// `apps/portal-suporte/scripts/testes-handlers/conversa-sem-ler-tudo.test.js`
// compara o handler novo com o antigo usando um EMULADOR de `findMany` e
// `findById`. Um emulador só vale se reproduzir a camada de verdade; este arquivo
// confere, contra Postgres, cada comportamento de que aquele teste depende:
//   - `findMany({})` devolve as 500 mais recentes, em ordem decrescente;
//   - o filtro por campo é aplicado ANTES do teto;
//   - a grafia snake_case e a camelCase são chaves distintas;
//   - `findById` acha por chave de armazenamento OU por `data.id`, e devolve o
//     id de negócio.
// Sem banco alcançável ele se declara PENDENTE e sai sem falhar — nunca passa
// por verde sem ter rodado.
//
// Roda com:
//   DATABASE_URL=postgresql://... npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://... node --test scripts/testes/camada-premissas-do-emulador.test.mjs
import { PrismaClient } from '@prisma/client';
import { buildModelsApi } from '../../src/lib/models.ts';

const URL_BANCO = process.env.DATABASE_URL || '';
const p = URL_BANCO ? new PrismaClient() : null;
let vivo = false;
if (p) { try { await p.$queryRaw`SELECT 1`; vivo = true; } catch { /* sem banco */ } }
if (!vivo) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: as premissas do emulador NÃO foram conferidas.');
  process.exit(0);
}

const SLUG = 'premissas-emu';
const EMAIL = `${SLUG}@teste.local`;
let falhas = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhas++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det)));
};

await p.app.deleteMany({ where: { slug: SLUG } });
const dono = await p.user.upsert({ where: { email: EMAIL }, update: {}, create: { email: EMAIL, passwordHash: 'x' } });
const app = await p.app.create({ data: { slug: SLUG, name: 'premissas', ownerId: dono.id } });
for (const n of ['Msg', 'Tag']) {
  await p.modelDef.create({ data: { appId: app.id, name: `${SLUG}_${n}`, schema: { type: 'object' } } });
}
const apis = await buildModelsApi(p, app.id, SLUG);
const Msg = apis[`${SLUG}_Msg`];
const Tag = apis[`${SLUG}_Tag`];
const quando = (ms) => new Date(1_700_000_000_000 + ms);
const gravar = (modelName, data, ms, id) =>
  p.modelRecord.create({ data: { ...(id ? { id } : {}), appId: app.id, modelName, data, createdAt: quando(ms) } });

try {
  await gravar(`${SLUG}_Msg`, { id: 'alvo1', conversation_id: 'cv' }, 1);
  await gravar(`${SLUG}_Msg`, { id: 'alvo2', conversationId: 'cv' }, 2);
  await gravar(`${SLUG}_Msg`, { id: 'alvo3', conversation_id: 'cv' }, 3);
  await p.modelRecord.createMany({
    data: Array.from({ length: 600 }, (_, k) => ({
      appId: app.id, modelName: `${SLUG}_Msg`, data: { id: 'x' + k, conversation_id: 'outra' }, createdAt: quando(100 + k),
    })),
  });

  const inteira = await Msg.findMany({});
  ok('findMany({}) devolve 500', inteira.length === 500, inteira.length);
  ok('as 500 MAIS RECENTES: a janela exclui as 3 do alvo', !inteira.some((m) => String(m.id).startsWith('alvo')), 0);
  ok('em ordem decrescente de criação', inteira[0].id === 'x599' && inteira[499].id === 'x100', [inteira[0].id, inteira[499].id]);
  const snake = await Msg.findMany({ conversation_id: 'cv' });
  ok('o filtro vem ANTES do teto: acha o que a leitura inteira não enxerga', snake.map((m) => m.id).join() === 'alvo3,alvo1', snake.map((m) => m.id));
  const camel = await Msg.findMany({ conversationId: 'cv' });
  ok('a grafia camelCase é outra chave: só ela', camel.map((m) => m.id).join() === 'alvo2', camel.map((m) => m.id));
  ok('sem correspondência devolve vazio, não erro', (await Msg.findMany({ conversation_id: 'nao-existe' })).length === 0, 0);

  await gravar(`${SLUG}_Tag`, { id: 'g-negocio', name: 'por data.id' }, 1, 'pk_diferente');
  await gravar(`${SLUG}_Tag`, { name: 'sem data.id' }, 2, 'pk_so');
  const porDataId = await Tag.findById('g-negocio');
  ok('findById acha por data.id e devolve o id de negócio', porDataId && porDataId.id === 'g-negocio', porDataId);
  const porPk = await Tag.findById('pk_diferente');
  ok('findById acha pela chave de armazenamento; devolve o id de negócio, não o pedido', porPk && porPk.id === 'g-negocio', porPk);
  const semDataId = await Tag.findById('pk_so');
  ok('sem data.id o id é a chave de armazenamento', semDataId && semDataId.id === 'pk_so', semDataId);
  ok('id inexistente devolve null', (await Tag.findById('zzz')) === null, 0);
} finally {
  await p.modelRecord.deleteMany({ where: { appId: app.id } });
  await p.modelDef.deleteMany({ where: { appId: app.id } });
  await p.app.delete({ where: { id: app.id } });
  await p.user.deleteMany({ where: { email: EMAIL } });
  await p.$disconnect();
}
if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\ntodas as premissas conferem');
