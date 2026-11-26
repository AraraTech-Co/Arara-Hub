// scripts/central-gestao/registrar.mjs com um Prisma falso: simula sem gravar, aplica, não duplica.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const { registrar, validarPessoas, lerModels } = await import(path.resolve(AQUI, '../registrar.mjs'));

function bancoFalso(usuarios) {
  const t = { apps: [], defs: [], membros: [], registros: [], escritas: 0 };
  let n = 0;
  const id = (p) => p + ++n;
  const db = {
    t,
    user: { async findFirst({ where }) { return usuarios.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) || null; } },
    app: {
      async findUnique({ where }) { return t.apps.find((a) => a.slug === where.slug) || null; },
      async create({ data }) { t.escritas++; const a = { id: id('app'), status: 'active', ...data }; t.apps.push(a); return a; },
    },
    modelDef: {
      async findUnique({ where }) { return t.defs.find((d) => d.appId === where.appId_name.appId && d.name === where.appId_name.name) || null; },
      async create({ data }) { t.escritas++; t.defs.push({ id: id('def'), ...data }); },
      async update({ where, data }) { t.escritas++; Object.assign(t.defs.find((d) => d.id === where.id), data); },
    },
    appMembership: {
      async findUnique({ where }) { return t.membros.find((m) => m.userId === where.userId_appId.userId && m.appId === where.userId_appId.appId) || null; },
      async upsert({ where, create, update }) {
        t.escritas++;
        const m = t.membros.find((x) => x.userId === where.userId_appId.userId && x.appId === where.userId_appId.appId);
        if (m) Object.assign(m, update); else t.membros.push({ ...create });
      },
    },
    modelRecord: {
      async findFirst({ where }) { return t.registros.find((r) => r.appId === where.appId && r.modelName === where.modelName && r.data.id === where.data.equals) || null; },
      async create({ data }) { t.escritas++; t.registros.push({ id: id('rec'), ...data }); },
      async update({ where, data }) { t.escritas++; Object.assign(t.registros.find((r) => r.id === where.id), data); },
    },
  };
  return db;
}

const USUARIOS = [{ id: 'u-dono', email: 'dono@exemplo.test', name: 'Dono' }, { id: 'u-b', email: 'B@exemplo.test', name: 'B' }];
const PESSOAS = validarPessoas([
  { email: 'dono@exemplo.test', name: 'Pessoa Dona', role: 'admin', dono: true },
  { email: 'b@exemplo.test', name: 'Pessoa B', role: 'membro' },
  { email: 'sem.conta@exemplo.test', name: 'Sem Conta', role: 'membro' },
]);

test('simulação: só lê, não grava nada', async () => {
  const db = bancoFalso(USUARIOS);
  const log = await registrar(db, PESSOAS, false);
  assert.equal(db.t.escritas, 0);
  assert.ok(log.some((l) => l.startsWith('app central-gestao: faria criar')));
  assert.ok(log.some((l) => l.startsWith('SEM CONTA: sem.conta@exemplo.test')));
  assert.ok(log.at(-1).startsWith('SIMULAÇÃO'));
});

test('aplicar: cria app, 4 models, memberships e Profiles; pula quem não tem conta', async () => {
  const db = bancoFalso(USUARIOS);
  await registrar(db, PESSOAS, true);
  assert.deepEqual(db.t.apps.map((a) => [a.slug, a.name, a.ownerId]), [['central-gestao', 'Central de Gestão', 'u-dono']]);
  assert.deepEqual(db.t.defs.map((d) => d.name).sort(), lerModels().map((m) => 'central-gestao-' + m.name).sort());
  assert.equal(db.t.defs.length, 4);
  assert.deepEqual(db.t.membros.map((m) => [m.userId, m.role]).sort(), [['u-b', 'user'], ['u-dono', 'admin']]);
  assert.deepEqual(db.t.registros.map((r) => [r.modelName, r.data]).sort((x, y) => x[1].id.localeCompare(y[1].id)), [
    ['central-gestao-Profile', { id: 'u-b', name: 'Pessoa B', role: 'membro', active: true }],
    ['central-gestao-Profile', { id: 'u-dono', name: 'Pessoa Dona', role: 'admin', active: true }],
  ]);
});

test('rodar de novo não duplica nada', async () => {
  const db = bancoFalso(USUARIOS);
  await registrar(db, PESSOAS, true);
  const antes = JSON.stringify({ a: db.t.apps.length, d: db.t.defs.length, m: db.t.membros.length, r: db.t.registros.length });
  const log = await registrar(db, PESSOAS, true);
  assert.equal(JSON.stringify({ a: db.t.apps.length, d: db.t.defs.length, m: db.t.membros.length, r: db.t.registros.length }), antes);
  assert.ok(log.some((l) => l.startsWith('app central-gestao: já existe')));
  assert.ok(log.some((l) => l === 'membership dono@exemplo.test: já existe'));
});

test('Profile existente é atualizado, não duplicado, e mantém campos que já tinha', async () => {
  const db = bancoFalso(USUARIOS);
  await registrar(db, PESSOAS, true);
  db.t.registros[0].data.extra = 'x';
  db.t.registros[0].data.active = false;
  await registrar(db, PESSOAS, true);
  assert.equal(db.t.registros.length, 2);
  assert.equal(db.t.registros[0].data.active, true);
  assert.equal(db.t.registros[0].data.extra, 'x');
});

test('dono sem conta: para sem gravar', async () => {
  const db = bancoFalso([{ id: 'u-b', email: 'b@exemplo.test', name: 'B' }]);
  const log = await registrar(db, PESSOAS, true);
  assert.equal(db.t.escritas, 0);
  assert.ok(log.some((l) => l.startsWith('PARADO')));
});

test('validação do pessoas.json', () => {
  assert.throws(() => validarPessoas([]), /não vazia/);
  assert.throws(() => validarPessoas([{ email: 'x', name: 'X', role: 'admin', dono: true }]), /e-mail/);
  assert.throws(() => validarPessoas([{ email: 'a@b.co', name: 'A', role: 'chefe', dono: true }]), /role/);
  assert.throws(() => validarPessoas([{ email: 'a@b.co', name: 'A', role: 'admin' }]), /exatamente uma/);
  assert.throws(() => validarPessoas([{ email: 'a@b.co', name: 'A', role: 'membro', dono: true }]), /dono precisa/);
  assert.throws(() => validarPessoas([{ email: 'a@b.co', name: 'A', role: 'admin', dono: true }, { email: 'A@b.co', name: 'B', role: 'membro' }]), /repetido/);
});
