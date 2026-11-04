// Tipo de contrato PJ/CLT — handlers carregados do routes.generated.ts (o que vai
// a produção). CLT: meta fixa de 200 h e valor hora = salário ÷ 200 quando o
// valor hora não está gravado. PJ (ou sem campo): regra de antes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarHandler } from './_carregar.mjs';

const finance = carregarHandler('GET', '/finance/investment-calculator');
const gravar = carregarHandler('PATCH', '/users/:id'); // mesmo código do POST /users

function mkReply() {
  let status = 200;
  return {
    status(c) {
      status = c;
      return this;
    },
    send(b) {
      return { status, body: b };
    },
  };
}

/** Fake de findMany: igualdade exata nos campos que não são meta (como a camada). */
function fakeFindMany(rows) {
  return async (filtro = {}) => {
    const campos = Object.entries(filtro).filter(([k]) => k !== 'limit' && k !== 'offset');
    return rows
      .filter((r) => campos.every(([k, v]) => r[k] === v))
      .slice(0, Math.min(500, Number(filtro.limit) || 500));
  };
}

// ── Financeiro ──────────────────────────────────────────────────────────────
const MES = '2026-11';
const lanc = (userId, tipo, minutos, status = 'APPROVED') => ({
  user_id: userId,
  date: '2026-11-10',
  hour_type: tipo,
  duration_minutes: minutos,
  status,
});

function financeCtx(perfis, user = { id: 'adm', roles: ['admin'] }) {
  const entradas = [];
  for (const p of perfis) {
    if (p.role === 'admin') continue;
    entradas.push(lanc(p.id, 'NORMAL', 480), lanc(p.id, 'EXTRA', 120), lanc(p.id, 'BIP_STANDBY', 600));
  }
  return {
    query: { month: MES },
    user,
    models: {
      StaffProfile: {
        async findById(id) {
          return perfis.find((p) => p.id === id) || null;
        },
        findMany: fakeFindMany(perfis),
      },
      HourEntries: { findMany: fakeFindMany(entradas) },
      Holidays: { findMany: fakeFindMany([]) },
    },
    reply: mkReply(),
  };
}

const ADMIN = { id: 'adm', role: 'admin', email: 'a@x' };
const linha = (res, id) => res.body.rows.find((r) => r.userId === id);

test('finance: PJ sem campo mantém a regra antiga (meta = dias úteis × 8, salário ÷ 168)', async () => {
  const res = await finance(
    financeCtx([ADMIN, { id: 'pj', role: 'user', email: 'pj@x', monthly_rate: 3360 }]),
  );
  assert.equal(res.status, 200);
  const r = linha(res, 'pj');
  assert.equal(r.contractType, 'PJ');
  assert.equal(r.expectedHours, res.body.expectedHoursDefault);
  assert.notEqual(r.expectedHours, 200);
  assert.equal(r.referenceHourlyRate, 20); // 3360 / 168
  assert.equal(r.extraAndAttendanceValue, 40); // 2 h × 20
  assert.equal(r.standbyAndBackupValue, 60); // 10 h × 20 × 0,3
  assert.equal(r.totalCost, 3460);
});

test('finance: CLT → meta 200 fixa e valor hora = salário ÷ 200', async () => {
  const res = await finance(
    financeCtx([
      ADMIN,
      { id: 'clt', role: 'user', email: 'c@x', monthly_rate: 5000, contract_type: 'CLT' },
    ]),
  );
  const r = linha(res, 'clt');
  assert.equal(r.contractType, 'CLT');
  assert.equal(r.expectedHours, 200);
  assert.equal(r.referenceHourlyRate, 25); // 5000 / 200
  assert.equal(r.extraAndAttendanceValue, 50); // 2 h × 25
  assert.equal(r.standbyAndBackupValue, 75); // 10 h × 25 × 0,3
  assert.equal(r.totalCost, 5125);
  // O topo continua sendo o padrão PJ.
  assert.notEqual(res.body.expectedHoursDefault, 200);
});

test('finance: grafia " clt " (minúscula/espaço) e camelCase contam como CLT', async () => {
  const res = await finance(
    financeCtx([
      ADMIN,
      { id: 'a', role: 'user', email: 'a1@x', monthly_rate: 5000, contract_type: ' clt ' },
      { id: 'b', role: 'user', email: 'b1@x', monthly_rate: 5000, contractType: 'CLT' },
    ]),
  );
  assert.equal(linha(res, 'a').expectedHours, 200);
  assert.equal(linha(res, 'b').referenceHourlyRate, 25);
});

test('finance: CLT com valor hora gravado usa o gravado (meta continua 200)', async () => {
  const res = await finance(
    financeCtx([
      ADMIN,
      {
        id: 'h',
        role: 'user',
        email: 'h@x',
        monthly_rate: 5000,
        hourly_rate: 30,
        contract_type: 'CLT',
      },
    ]),
  );
  const r = linha(res, 'h');
  assert.equal(r.referenceHourlyRate, 30);
  assert.equal(r.expectedHours, 200);
});

test('finance: contraste PJ × CLT com o mesmo salário', async () => {
  const res = await finance(
    financeCtx([
      ADMIN,
      { id: 'p', role: 'user', email: 'p@x', monthly_rate: 5000, contract_type: 'PJ' },
      { id: 'c', role: 'user', email: 'c2@x', monthly_rate: 5000, contract_type: 'CLT' },
    ]),
  );
  assert.equal(linha(res, 'p').referenceHourlyRate, 29.76); // 5000 / 168
  assert.equal(linha(res, 'c').referenceHourlyRate, 25);
});

test('finance: chave sem pessoa → 401', async () => {
  const res = await finance(financeCtx([ADMIN], { type: 'apiKey' }));
  assert.equal(res.status, 401);
});

// ── Gravação (POST /users e PATCH /users/:id) ──────────────────────────────
function gravarCtx({ method, id, body, admin = true, user, perfis = [] }) {
  const calls = { create: [], update: [], setPassword: 0 };
  const todos = [{ id: 'adm', role: admin ? 'admin' : 'user', email: 'adm@x' }, ...perfis];
  return {
    calls,
    ctx: {
      method,
      params: id ? { id } : {},
      body,
      headers: {},
      user: user || { id: 'adm', roles: admin ? ['admin'] : [] },
      users: {
        async findByEmail() {
          return { id: 'u-novo' };
        },
        async setPassword() {
          calls.setPassword += 1;
        },
      },
      models: {
        StaffProfile: {
          async findById(pid) {
            return todos.find((p) => p.id === pid) || null;
          },
          findMany: fakeFindMany(todos),
          async create(row) {
            calls.create.push(row);
            return row;
          },
          async update(pid, patch) {
            calls.update.push(patch);
            return { id: pid, ...patch };
          },
        },
      },
      reply: mkReply(),
    },
  };
}

const NOVO = { email: 'novo@arara-tech.com', fullName: 'Novo' };
const SENHA_DE_TESTE = 'x'.repeat(12); // só precisa ter 8+ caracteres

test('POST: contractType "clt" grava contract_type "CLT"', async () => {
  const { ctx, calls } = gravarCtx({ method: 'POST', body: { ...NOVO, contractType: 'clt' } });
  const res = await gravar(ctx);
  assert.equal(res.status, 201);
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].contract_type, 'CLT');
});

test('POST: sem contrato grava contract_type null (vale como PJ)', async () => {
  const { ctx, calls } = gravarCtx({ method: 'POST', body: { ...NOVO } });
  const res = await gravar(ctx);
  assert.equal(res.status, 201);
  assert.equal(calls.create[0].contract_type, null);
});

test('POST: contrato inválido → 400 antes de qualquer efeito (nem senha, nem perfil)', async () => {
  // ['CLT'] vira "CLT" com String(): só a checagem de tipo recusa.
  for (const contractType of ['CLTX', 123, { v: 'CLT' }, ['CLT']]) {
    const { ctx, calls } = gravarCtx({
      method: 'POST',
      body: { ...NOVO, contractType, trocar_senha: true, password: SENHA_DE_TESTE },
    });
    const res = await gravar(ctx);
    assert.equal(res.status, 400, 'valor ' + JSON.stringify(contractType));
    assert.equal(res.body.codigo, 'contrato_invalido');
    assert.equal(calls.create.length, 0);
    assert.equal(calls.setPassword, 0);
  }
  // Contraste: a mesma massa com contrato válido grava e troca a senha.
  const { ctx, calls } = gravarCtx({
    method: 'POST',
    body: { ...NOVO, contractType: 'PJ', trocar_senha: true, password: SENHA_DE_TESTE },
  });
  assert.equal((await gravar(ctx)).status, 201);
  assert.equal(calls.create.length, 1);
  assert.equal(calls.setPassword, 1);
});

const ALVO = { id: 'p1', role: 'user', email: 'p1@x', monthly_rate: 5000 };

test('PATCH: "CLT" grava; "" volta a null; ausente não mexe no campo', async () => {
  let r = gravarCtx({ method: 'PATCH', id: 'p1', body: { contractType: 'CLT' }, perfis: [ALVO] });
  assert.equal((await gravar(r.ctx)).status, 200);
  assert.equal(r.calls.update[0].contract_type, 'CLT');

  r = gravarCtx({ method: 'PATCH', id: 'p1', body: { contract_type: '' }, perfis: [ALVO] });
  assert.equal((await gravar(r.ctx)).status, 200);
  assert.ok('contract_type' in r.calls.update[0]);
  assert.equal(r.calls.update[0].contract_type, null);

  r = gravarCtx({ method: 'PATCH', id: 'p1', body: { fullName: 'Outro' }, perfis: [ALVO] });
  assert.equal((await gravar(r.ctx)).status, 200);
  assert.equal('contract_type' in r.calls.update[0], false);
});

test('PATCH: contrato inválido → 400 sem gravar', async () => {
  const { ctx, calls } = gravarCtx({
    method: 'PATCH',
    id: 'p1',
    body: { contractType: 'estagio', fullName: 'X' },
    perfis: [ALVO],
  });
  const res = await gravar(ctx);
  assert.equal(res.status, 400);
  assert.equal(calls.update.length, 0);
});

test('PATCH: não-admin → 403 sem gravar; contraste admin grava', async () => {
  let r = gravarCtx({
    method: 'PATCH',
    id: 'p1',
    body: { contractType: 'CLT' },
    admin: false,
    perfis: [ALVO],
  });
  assert.equal((await gravar(r.ctx)).status, 403);
  assert.equal(r.calls.update.length, 0);

  r = gravarCtx({ method: 'PATCH', id: 'p1', body: { contractType: 'CLT' }, perfis: [ALVO] });
  assert.equal((await gravar(r.ctx)).status, 200);
  assert.equal(r.calls.update.length, 1);
});

test('PATCH: chave sem pessoa → 401 sem gravar', async () => {
  const { ctx, calls } = gravarCtx({
    method: 'PATCH',
    id: 'p1',
    body: { contractType: 'CLT' },
    user: { type: 'apiKey' },
    perfis: [ALVO],
  });
  assert.equal((await gravar(ctx)).status, 401);
  assert.equal(calls.update.length, 0);
});
