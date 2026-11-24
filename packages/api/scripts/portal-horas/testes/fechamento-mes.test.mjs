// Rotas de fechar e reabrir mês (month-closures). Handler carregado do
// routes.generated.ts; models falsos fiéis à camada (_fakes.mjs). Massa SINTÉTICA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarHandler } from './_carregar.mjs';
import { tabela, contexto, lanc, PERFIS } from './_fakes.mjs';

const listar = carregarHandler('GET', '/month-closures');
const ver = carregarHandler('GET', '/month-closures/:month');
const agir = carregarHandler('POST', '/month-closures/:month/:acao');

// mês corrente em São Paulo, do mesmo jeito que o handler calcula
function mesAtual() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return p.find((x) => x.type === 'year').value + '-' + p.find((x) => x.type === 'month').value;
}
function somaMes(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
const PASSADO = somaMes(mesAtual(), -1);
const ATUAL = mesAtual();
const FUTURO = somaMes(mesAtual(), 1);

function mundo({ fechamentos = [], lancamentos = [], falhar = false } = {}) {
  return {
    MonthClosures: tabela(fechamentos, { falharLeitura: falhar }),
    HourEntries: tabela(lancamentos),
    StaffProfile: tabela(PERFIS),
  };
}
const fechar = (w, mes, user = 'adm', body = {}) =>
  agir(contexto({ method: 'POST', params: { month: mes, acao: 'close' }, body, user, models: w }));
const reabrir = (w, mes, body = { reason: 'correção de lançamento' }, user = 'adm') =>
  agir(contexto({ method: 'POST', params: { month: mes, acao: 'reopen' }, body, user, models: w }));

test('fechar mês terminado, sem pendentes: grava o registro e a trilha', async () => {
  const w = mundo({ lancamentos: [lanc('a', PASSADO + '-10', { status: 'APPROVED' })] });
  const r = await fechar(w, PASSADO, 'adm', { reason: 'folha enviada' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'fechado');
  assert.equal(r.body.data.closedBy, 'adm');
  assert.equal(r.body.data.closedByName, 'Admin Teste');
  assert.equal(r.body.data.history.length, 1);
  assert.equal(r.body.data.history[0].action, 'FECHAR');
  assert.equal(r.body.data.history[0].reason, 'folha enviada');
  const reg = w.MonthClosures.rows.find((x) => x.id === PASSADO);
  assert.ok(reg, 'registro com id = mês');
  assert.equal(reg.status, 'fechado');
});

test('só admin fecha e reabre: gestor e pessoa comum recebem 403', async () => {
  for (const user of ['ger', 'u']) {
    const w = mundo();
    assert.equal((await fechar(w, PASSADO, user)).status, 403);
    const w2 = mundo({ fechamentos: [{ id: PASSADO, month: PASSADO, status: 'fechado', history: [] }] });
    assert.equal((await reabrir(w2, PASSADO, { reason: 'x' }, user)).status, 403);
    assert.deepEqual(w.MonthClosures.gravacoes, []);
    assert.deepEqual(w2.MonthClosures.gravacoes, []);
  }
});

test('sem login: 401', async () => {
  const w = mundo();
  const r = await agir(contexto({ method: 'POST', params: { month: PASSADO, acao: 'close' }, user: null, models: w }));
  assert.equal(r.status, 401);
  const l = await listar(contexto({ user: null, models: w }));
  assert.equal(l.status, 401);
});

test('mês corrente ou futuro não fecha', async () => {
  for (const mes of [ATUAL, FUTURO]) {
    const w = mundo();
    const r = await fechar(w, mes);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'mes_nao_terminou');
    assert.deepEqual(w.MonthClosures.gravacoes, []);
  }
});

test('mês inválido: 400', async () => {
  for (const mes of ['2026-13', '2026-1', 'abc', '2026-00']) {
    const r = await fechar(mundo(), mes);
    assert.equal(r.status, 400, mes);
    assert.equal(r.body.error, 'mes_invalido');
  }
});

test('com lançamento pendente no mês: 409 com a contagem; pendente de outro mês não impede', async () => {
  const w = mundo({
    lancamentos: [
      lanc('p1', PASSADO + '-03'),
      lanc('p2', PASSADO + '-20', { user_id: 'outra' }),
      lanc('ok', PASSADO + '-05', { status: 'APPROVED' }),
      lanc('outro-mes', ATUAL + '-01'),
    ],
  });
  const r = await fechar(w, PASSADO);
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: 'pendentes', count: 2 });
  assert.deepEqual(w.MonthClosures.gravacoes, []);

  const w2 = mundo({ lancamentos: [lanc('outro-mes', ATUAL + '-01'), lanc('r', PASSADO + '-02', { status: 'REJECTED' })] });
  assert.equal((await fechar(w2, PASSADO)).status, 200);
});

test('pendente do mês além dos 500 mais recentes também impede', async () => {
  const linhas = [lanc('antigo', PASSADO + '-02')];
  for (let i = 0; i < 1100; i += 1) linhas.push(lanc('n' + i, ATUAL + '-01'));
  const r = await fechar(mundo({ lancamentos: linhas }), PASSADO);
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: 'pendentes', count: 1 });
});

test('mês já fechado: 409', async () => {
  const w = mundo({ fechamentos: [{ id: PASSADO, month: PASSADO, status: 'fechado', history: [] }] });
  const r = await fechar(w, PASSADO);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'ja_fechado');
});

test('reabrir: motivo obrigatório; só reabre o que está fechado', async () => {
  const w = mundo({ fechamentos: [{ id: PASSADO, month: PASSADO, status: 'fechado', history: [] }] });
  for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
    const r = await reabrir(w, PASSADO, body);
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'motivo_obrigatorio');
  }
  const aberto = await reabrir(mundo(), PASSADO);
  assert.equal(aberto.status, 409);
  assert.equal(aberto.body.error, 'nao_fechado');
});

test('fechar, reabrir e fechar de novo: a trilha só cresce e o registro nunca some', async () => {
  const w = mundo();
  assert.equal((await fechar(w, PASSADO)).status, 200);
  const r = await reabrir(w, PASSADO, { reason: 'ajuste do Juda' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, 'aberto');
  assert.deepEqual(r.body.data.history.map((h) => h.action), ['FECHAR', 'REABRIR']);
  assert.equal(r.body.data.history[1].reason, 'ajuste do Juda');
  const r2 = await fechar(w, PASSADO);
  assert.equal(r2.status, 200);
  assert.deepEqual(r2.body.data.history.map((h) => h.action), ['FECHAR', 'REABRIR', 'FECHAR']);
  assert.equal(w.MonthClosures.rows.length, 1);
  assert.ok(w.MonthClosures.gravacoes.every((g) => g.op !== 'delete'));
});

test('sem o model MonthClosures: leitura diz aberto, fechar responde 503', async () => {
  const base = { HourEntries: tabela([]), StaffProfile: tabela(PERFIS) };
  const um = await ver(contexto({ params: { month: PASSADO }, models: base, ausentes: ['MonthClosures'] }));
  assert.equal(um.status, 200);
  assert.equal(um.body.data.status, 'aberto');
  const todos = await listar(contexto({ models: base, ausentes: ['MonthClosures'] }));
  assert.deepEqual(todos.body, { data: [] });
  const f = await agir(contexto({ method: 'POST', params: { month: PASSADO, acao: 'close' }, models: base, ausentes: ['MonthClosures'] }));
  assert.equal(f.status, 503);
  assert.equal(f.body.error, 'modelo_ausente');
});

test('falha ao ler o fechamento: 503 e nada gravado', async () => {
  const w = mundo({ falhar: true });
  const f = await fechar(w, PASSADO);
  assert.equal(f.status, 503);
  assert.deepEqual(w.MonthClosures.gravacoes, []);
  const v = await ver(contexto({ params: { month: PASSADO }, models: w }));
  assert.equal(v.status, 503);
});

test('leitura: qualquer pessoa logada vê; lista do mais novo ao mais velho', async () => {
  const w = mundo({
    fechamentos: [
      { id: '2026-09', month: '2026-09', status: 'fechado', closed_at: 'x', closed_by: 'adm', closed_by_name: 'Admin Teste', history: [{ action: 'FECHAR' }] },
      { id: '2026-10', month: '2026-10', status: 'aberto', history: [{ action: 'FECHAR' }, { action: 'REABRIR' }] },
    ],
  });
  const l = await listar(contexto({ user: 'u', models: w }));
  assert.equal(l.status, 200);
  assert.deepEqual(l.body.data.map((x) => [x.month, x.status]), [
    ['2026-10', 'aberto'],
    ['2026-09', 'fechado'],
  ]);
  const um = await ver(contexto({ user: 'u', params: { month: '2026-09' }, models: w }));
  assert.equal(um.body.data.closedByName, 'Admin Teste');
  const sem = await ver(contexto({ user: 'u', params: { month: '2026-08' }, models: w }));
  assert.equal(sem.body.data.status, 'aberto');
});

test('depois de fechar pela rota, as rotas de lançamento recusam aquele mês', async () => {
  const w = mundo({ lancamentos: [lanc('a', PASSADO + '-10', { status: 'APPROVED' })] });
  assert.equal((await fechar(w, PASSADO)).status, 200);
  const criar = carregarHandler('POST', '/hour-entries');
  const r = await criar(contexto({ method: 'POST', user: 'u', body: { date: PASSADO + '-11', start_time: '09:00', end_time: '10:00' }, models: w }));
  assert.equal(r.status, 409);
  await reabrir(w, PASSADO);
  const r2 = await criar(contexto({ method: 'POST', user: 'u', body: { date: PASSADO + '-11', start_time: '09:00', end_time: '10:00' }, models: w }));
  assert.equal(r2.status, 201);
});
