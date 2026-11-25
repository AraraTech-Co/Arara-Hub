// Guarda nas rotas de CRUD do app (desenho 2026-11-25). Handlers carregados do
// routes.generated.ts; models falsos fiéis à camada (_fakes.mjs). Massa SINTÉTICA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarHandler, todosHandlers, compilar } from './_carregar.mjs';
import { tabela, contexto } from './_fakes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELO_CRUD = fs.readFileSync(path.resolve(__dirname, '../crud-guardado.js'), 'utf8');

const MODELS = [
  'BipSchedules', 'Clients', 'CsvExports', 'Holidays', 'Notifications', 'RecurringHourEntries',
  'Reminders', 'Squads', 'Squad', 'SystemRules', 'Tasks', 'TimeOffs', 'UserSettings', 'HourEntries',
  'MonthClosures',
];
const PERFIS = [
  { id: 'adm', role: 'admin', email: 'adm@x', full_name: 'Admin Teste' },
  { id: 'u', role: 'user', email: 'u@x', full_name: 'Pessoa Teste' },
  { id: 'outra', role: 'user', email: 'o@x', full_name: 'Outra Teste' },
  { id: 'x1', role: 'user', email: 'x1@x', full_name: 'Registro Teste' },
];

/** Todas as tabelas com um registro 'x1' de outra pessoa. */
function mundo() {
  const w = { StaffProfile: tabela(PERFIS) };
  for (const m of MODELS) {
    w[m] = tabela([
      { id: 'x1', user_id: 'outra', generated_by_id: 'outra', date: '2026-11-10', start_time: '09:00', end_time: '10:00', status: 'PENDING', title: 'de outra pessoa' },
    ]);
  }
  return w;
}
const CORPO = {
  user_id: 'outra', userId: 'outra', role: 'admin', monthly_rate: 1, date: '2026-11-11', start_time: '09:00',
  end_time: '10:00', name: 'n', title: 't', status: 'APPROVED', action: 'approve', justification: 'j',
  generatedById: 'outra', generated_by_id: 'outra',
};
function chamar(r, user, w) {
  const h = compilar(r.code);
  return h(contexto({ method: r.method, user, params: { id: 'x1', month: '2026-10', acao: 'close' }, body: { ...CORPO }, query: {}, models: w }));
}
const gravacoes = (w) =>
  Object.entries(w).flatMap(([nome, t]) => (t.gravacoes || []).map((g) => ({ nome, ...g, row: t.rows.find((r) => String(r.id) === String(g.id)) })));
const escreve = (r) => r.method !== 'GET';

test('pessoa comum: nenhuma rota grava em registro de outra pessoa nem cria em nome de outra', async () => {
  for (const r of todosHandlers().filter(escreve)) {
    const w = mundo();
    try {
      await chamar(r, 'u', w);
    } catch {
      /* erro sem gravação não interessa aqui */
    }
    for (const g of gravacoes(w)) {
      assert.equal(g.op, 'create', `${r.method} ${r.path} fez ${g.op} em ${g.nome} como pessoa comum`);
      const dono = g.row && (g.nome === 'CsvExports' ? g.row.generated_by_id : g.row.user_id);
      assert.equal(dono, 'u', `${r.method} ${r.path} criou em ${g.nome} com dono ${dono}`);
      assert.ok(['HourEntries', 'Reminders', 'Tasks', 'UserSettings', 'CsvExports'].includes(g.nome), `${r.method} ${r.path} criou em ${g.nome}`);
    }
  }
});

test('chave sem pessoa: nenhuma rota grava nada', async () => {
  for (const r of todosHandlers().filter(escreve)) {
    const w = mundo();
    try {
      await chamar(r, null, w);
    } catch {
      /* idem */
    }
    assert.deepEqual(gravacoes(w), [], `${r.method} ${r.path} gravou sem pessoa`);
  }
});

test('controle: como admin o teste alcança as gravações de configuração', async () => {
  const gravou = new Set();
  for (const r of todosHandlers().filter(escreve)) {
    const w = mundo();
    try {
      await chamar(r, 'adm', w);
    } catch {
      /* idem */
    }
    if (gravacoes(w).length) gravou.add(`${r.method} ${r.path}`);
  }
  for (const k of [
    'POST /holidays', 'PUT /holidays/:id', 'DELETE /holidays/:id', 'POST /clients', 'PATCH /system-rules/:id',
    'POST /bip-schedules', 'PATCH /bip-schedules/:id', 'DELETE /bip-schedules/:id', 'PUT /squads/:id', 'DELETE /squads/:id',
    'POST /time-offs', 'DELETE /notifications/:id', 'PUT /recurring-hour-entries/:id', 'DELETE /csv-exports/:id',
  ]) {
    assert.ok(gravou.has(k), `controle não alcançou ${k}`);
  }
});

test('PUT e DELETE de /users/:id respondem 405 até para admin', async () => {
  for (const m of ['PUT', 'DELETE']) {
    const w = mundo();
    const h = carregarHandler(m, '/users/:id');
    const r = await h(contexto({ method: m, user: 'adm', params: { id: 'u' }, body: { role: 'admin' }, models: w }));
    assert.equal(r.status, 405);
    assert.deepEqual(w.StaffProfile.gravacoes, []);
  }
});

test('configuração: logado lê; só admin grava', async () => {
  const w = mundo();
  const lista = carregarHandler('GET', '/holidays');
  const r = await lista(contexto({ user: 'u', models: w }));
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
  const criar = carregarHandler('POST', '/holidays');
  assert.equal((await criar(contexto({ method: 'POST', user: 'u', body: { date: '2026-12-25' }, models: w }))).status, 403);
  const ok = await criar(contexto({ method: 'POST', user: 'adm', body: { date: '2026-12-25' }, models: w }));
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.date, '2026-12-25');
  const semPessoa = await lista(contexto({ user: null, models: w }));
  assert.equal(semPessoa.status, 401);
});

test('papel de plataforma admin também é admin; gestor (manager_role) não é', async () => {
  const w = mundo();
  w.StaffProfile = tabela([...PERFIS, { id: 'ger', role: 'user', manager_role: true }]);
  const criar = carregarHandler('POST', '/bip-schedules');
  assert.equal((await criar(contexto({ method: 'POST', user: 'ger', body: {}, models: w }))).status, 403);
  const c = contexto({ method: 'POST', user: 'u', body: {}, models: w });
  c.user = { id: 'u', roles: ['admin'] };
  assert.equal((await criar(c)).status, 201);
});

test('só admin: pessoa comum não lê nem grava férias, notificações e recorrentes', async () => {
  for (const p of ['/time-offs', '/notifications', '/recurring-hour-entries']) {
    const w = mundo();
    assert.equal((await carregarHandler('GET', p)(contexto({ user: 'u', models: w }))).status, 403, p);
    assert.equal((await carregarHandler('GET', p + '/:id')(contexto({ user: 'u', params: { id: 'x1' }, models: w }))).status, 403, p);
    assert.equal((await carregarHandler('GET', p)(contexto({ user: 'adm', models: w }))).status, 200, p);
  }
});

test('pessoal: criar grava o dono de quem pede; alterar e apagar só o próprio', async () => {
  for (const p of ['/reminders', '/tasks', '/user-settings']) {
    const w = mundo();
    const nome = { '/reminders': 'Reminders', '/tasks': 'Tasks', '/user-settings': 'UserSettings' }[p];
    const c = await carregarHandler('POST', p)(contexto({ method: 'POST', user: 'u', body: { title: 'meu', user_id: 'outra', userId: 'outra' }, models: w }));
    assert.equal(c.status, 201);
    assert.equal(c.body.data.user_id, 'u');
    assert.equal(c.body.data.userId, undefined);
    const meu = c.body.data.id;
    const alt = await carregarHandler('PATCH', p + '/:id')(contexto({ method: 'PATCH', user: 'u', params: { id: meu }, body: { title: 'novo', user_id: 'outra' }, models: w }));
    assert.equal(alt.status, 200);
    assert.equal(w[nome].rows.find((r) => r.id === meu).user_id, 'u', 'trocar o dono pelo corpo');
    // registro de outra pessoa: nem a própria pessoa comum nem o admin alteram
    for (const user of ['u', 'adm']) {
      for (const m of ['PATCH', 'PUT', 'DELETE']) {
        const r = await carregarHandler(m, p + '/:id')(contexto({ method: m, user, params: { id: 'x1' }, body: { title: 'x' }, models: w }));
        assert.equal(r.status, 403, `${m} ${p} como ${user}`);
      }
    }
    assert.equal((await carregarHandler('DELETE', p + '/:id')(contexto({ method: 'DELETE', user: 'u', params: { id: meu }, models: w }))).status, 200);
    assert.equal((await carregarHandler('PATCH', p + '/:id')(contexto({ method: 'PATCH', user: 'u', params: { id: 'nao-existe' }, models: w }))).status, 404);
  }
});

test('CSV: o autor é sempre quem gera; alterar e apagar só admin', async () => {
  const w = mundo();
  const c = await carregarHandler('POST', '/csv-exports')(
    contexto({ method: 'POST', user: 'u', body: { fileName: 'a.csv', generated_by_id: 'outra', generatedById: 'outra', generatedByName: 'Outra' }, models: w }),
  );
  assert.equal(c.status, 201);
  assert.equal(c.body.data.generated_by_id, 'u');
  assert.equal(c.body.data.generated_by_name, 'Pessoa Teste');
  assert.equal(c.body.data.generatedById, undefined);
  assert.equal(c.body.data.user_id, undefined);
  assert.equal(c.body.data.fileName, 'a.csv');
  for (const m of ['PATCH', 'PUT', 'DELETE']) {
    assert.equal((await carregarHandler(m, '/csv-exports/:id')(contexto({ method: m, user: 'u', params: { id: 'x1' }, models: w }))).status, 403);
  }
  assert.equal((await carregarHandler('DELETE', '/csv-exports/:id')(contexto({ method: 'DELETE', user: 'adm', params: { id: 'x1' }, models: w }))).status, 200);
});

test('as rotas de CRUD usam o mesmo texto (crud-guardado.js), só com modelo e política no topo', () => {
  const corpo = MODELO_CRUD.replace('// <config/>\n', '');
  const crud = todosHandlers().filter((h) => h.code.includes('CRUD com guarda (desenho 2026-11-25'));
  assert.equal(crud.length, 71);
  for (const h of crud) {
    const m = /^var MODELO = '(\w+)';\nvar POLITICA = '([a-z-]+)';\n/.exec(h.code);
    assert.ok(m, `${h.method} ${h.path} sem cabeçalho`);
    assert.equal(h.code.slice(m[0].length), corpo, `${h.method} ${h.path} com texto diferente`);
  }
});

test('buscar um registro pelo id devolve o registro; id inexistente dá 404', async () => {
  const w = mundo();
  w.Clients.rows.push({ id: 'x2', name: 'outro', _criado: 9 });
  const um = carregarHandler('GET', '/clients/:id');
  const r = await um(contexto({ user: 'u', params: { id: 'x1' }, models: w }));
  assert.equal(r.status, 200);
  assert.ok(!Array.isArray(r.body.data));
  assert.equal(r.body.data.id, 'x1');
  const n = await um(contexto({ user: 'u', params: { id: 'nao-existe' }, models: w }));
  assert.equal(n.status, 404);
});
