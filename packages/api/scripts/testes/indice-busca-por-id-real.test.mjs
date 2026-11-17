// O índice de prisma/manual/2026-11-17-indice-model-records-data-id.sql é o que `findById` e
// `update` da camada REAL usam para achar um registro pelo `id` do JSON.
//
// Roda a camada (`buildModelsApi`) contra um Postgres de verdade, com registros cujo id só
// existe no JSON (como as mensagens do WhatsApp) e anexos em base64, e confere:
//   - controle: sem o índice, a busca acha o registro, e o índice não existe;
//   - com o índice criado pelo PRÓPRIO arquivo manual, `findById` e `update` passam pelo índice
//     (contador `idx_scan` do índice sobe) e o plano do SQL que o Prisma gerou é Index Scan;
//   - a resposta de `findById` é IDÊNTICA à de antes do índice, e o `update` grava no registro certo;
//   - id inexistente continua devolvendo null.
//
// Sem banco, o arquivo se declara PENDENTE e sai: nunca passa por verde sem ter rodado.
//
// Roda com:
//   DATABASE_URL=postgresql://... npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://... npx tsx scripts/testes/indice-busca-por-id-real.test.mjs
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { buildModelsApi } from '../../src/lib/models.ts';

const p = process.env.DATABASE_URL ? new PrismaClient({ log: [{ emit: 'event', level: 'query' }] }) : null;
let vivo = false;
if (p) { try { await p.$queryRaw`SELECT 1`; vivo = true; } catch { /* sem banco */ } }
if (!vivo) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: o índice de busca por id NÃO foi exercitado.');
  process.exit(0);
}

let falhas = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhas++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};

const sqls = [];
p.$on('query', (e) => sqls.push({ q: e.query, params: e.params }));

// O índice sai do arquivo que vai para produção, não de uma cópia.
const ARQ_SQL = new URL('../../prisma/manual/2026-11-17-indice-model-records-data-id.sql', import.meta.url);
const semComentarios = fs.readFileSync(ARQ_SQL, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const CRIAR = (semComentarios.match(/CREATE INDEX[\s\S]*?;/) || [])[0];
const NOME = CRIAR && (CRIAR.match(/IF NOT EXISTS\s+(\w+)/) || [])[1];
ok('o arquivo manual tem um CREATE INDEX com nome', !!(CRIAR && NOME), CRIAR);

const SLUG = 'real-idx-id';
const EMAIL = `${SLUG}@teste.local`;
await p.app.deleteMany({ where: { slug: SLUG } });
await p.$executeRawUnsafe(`DROP INDEX IF EXISTS ${NOME}`);
const dono = await p.user.upsert({ where: { email: EMAIL }, update: {}, create: { email: EMAIL, passwordHash: 'x' } });
const app = await p.app.create({ data: { slug: SLUG, name: 'indice busca por id', ownerId: dono.id } });
const idxScan = async () => {
  const r = await p.$queryRawUnsafe(`SELECT idx_scan::int AS n FROM pg_stat_user_indexes WHERE indexrelname = '${NOME}'`);
  return r.length ? r[0].n : null;
};
// As estatísticas de outro processo chegam com atraso: espera o contador passar de `de`.
const esperarScan = async (de) => {
  for (let i = 0; i < 40; i++) {
    const n = await idxScan();
    if (n !== null && n > de) return n;
    await new Promise((r) => setTimeout(r, 100));
  }
  return idxScan();
};
try {
  await p.modelDef.create({ data: { appId: app.id, name: `${SLUG}_Msg`, schema: { type: 'object' } } });
  const nome = `${SLUG}_Msg`;
  const anexo = 'data:image/jpeg;base64,' + Buffer.alloc(30 * 1024).fill(7).toString('base64');
  const linhas = [];
  for (let i = 0; i < 5000; i++) {
    linhas.push({
      appId: app.id, modelName: nome, createdAt: new Date(Date.UTC(2026, 9, 1) + i * 1000),
      data: { id: 'wam_' + i, conversation_id: 'wac_' + (i % 50), body: 'm' + i, media_data: i % 10 === 0 ? anexo : null },
    });
  }
  for (let i = 0; i < linhas.length; i += 1000) await p.modelRecord.createMany({ data: linhas.slice(i, i + 1000) });
  await p.$executeRawUnsafe('ANALYZE model_records');
  const apis = await buildModelsApi(p, app.id, SLUG);
  const Msg = apis[nome] || apis['Msg'];
  ok('TRAVA: o model do teste existe na camada', !!Msg, Object.keys(apis));

  // ── controle: sem índice ──────────────────────────────────────────────────
  const ALVO = 'wam_4200';
  const antes = await Msg.findById(ALVO);
  ok('controle: sem o índice, a busca acha o registro pelo id do JSON', antes && antes.id === ALVO && antes.body === 'm4200', antes && antes.id);
  ok('controle: o índice ainda não existe', (await idxScan()) === null);

  // ── com o índice do arquivo manual ────────────────────────────────────────
  await p.$executeRawUnsafe(CRIAR);
  await p.$executeRawUnsafe('ANALYZE model_records');
  const valido = await p.$queryRawUnsafe(`SELECT indisvalid AS v FROM pg_index WHERE indexrelid = '${NOME}'::regclass`);
  ok('o índice foi criado e está válido', valido.length === 1 && valido[0].v === true, valido);

  const base = (await idxScan()) || 0;
  sqls.length = 0;
  let depois = null;
  for (let k = 0; k < 12; k++) depois = await Msg.findById(ALVO);
  const aposBusca = await esperarScan(base);
  ok('findById passa pelo índice (idx_scan subiu)', aposBusca >= base + 12, { base, aposBusca });
  ok('findById devolve o MESMO registro de antes do índice', JSON.stringify(depois) === JSON.stringify(antes));

  // O plano do SQL exato que o Prisma gerou, com os parâmetros dele.
  const consulta = sqls.find((s) => s.q.includes('#>'));
  ok('TRAVA: o Prisma gerou a busca por caminho do JSON', !!consulta, sqls.map((s) => s.q.slice(0, 80)));
  if (consulta) {
    const params = JSON.parse(consulta.params);
    // O valor comparado ao JSON vai como jsonb: o log mostra o texto cru, o banco recebe '"..."'.
    const nJson = Number((consulta.q.match(/::jsonb = \$(\d+)/) || [])[1]);
    if (nJson) params[nJson - 1] = JSON.stringify(params[nJson - 1]);
    const sqlLiteral = consulta.q.replace(/\$(\d+)/g, (_, n) => {
      const v = params[Number(n) - 1];
      return typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
    });
    const plano = await p.$queryRawUnsafe('EXPLAIN (FORMAT JSON) ' + sqlLiteral);
    const txt = JSON.stringify(plano);
    ok('o plano do SQL do Prisma usa o índice (Index Scan)', txt.includes(NOME) && !txt.includes('Seq Scan'), txt.slice(0, 300));
  }

  const nulo = await Msg.findById('wam_naoexiste');
  ok('id inexistente continua null', nulo === null, nulo);

  const antesUpd = await esperarScan(-1);
  await Msg.update(ALVO, { body: 'editada' });
  const aposUpd = await esperarScan(antesUpd);
  const relido = await Msg.findById(ALVO);
  ok('update acha pelo índice e grava no registro certo', aposUpd > antesUpd && relido && relido.body === 'editada' && relido.conversation_id === antes.conversation_id, { antesUpd, aposUpd, body: relido && relido.body });
  const vizinho = await Msg.findById('wam_4201');
  ok('o update não tocou outro registro', vizinho && vizinho.body === 'm4201', vizinho && vizinho.body);
} finally {
  await p.app.deleteMany({ where: { slug: SLUG } });
  await p.$executeRawUnsafe(`DROP INDEX IF EXISTS ${NOME}`);
  await p.$disconnect();
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntodos os casos passaram');
if (falhas) process.exit(1);
