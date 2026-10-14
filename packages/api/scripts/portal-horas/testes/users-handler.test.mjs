// Testes do handler POST /users do Gestão de Horas — carregado do
// routes.generated.ts (o que vai a produção). node --test, sem dependência nova.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { carregarHandler, codigoHandler, FONTE_LEGIVEL } from './_carregar.mjs';

const handler = carregarHandler('POST', '/users');

/** Monta um ctx falso. Captura chamadas de create/update/setPassword. */
function mkCtx(opts = {}) {
  const {
    body = {},
    admin = true,
    profiles = [],
    findByEmail = async () => null,
  } = opts;
  const calls = { create: 0, update: 0, setPassword: 0, lastPassword: null };
  let status = 200;
  const reply = {
    status(c) {
      status = c;
      return this;
    },
    send(b) {
      return { status, body: b };
    },
  };
  const Profile = {
    async findById(id) {
      return profiles.find((p) => String(p.id) === String(id)) || null;
    },
    async findMany() {
      return profiles;
    },
    async create(row) {
      calls.create += 1;
      return row;
    },
    async update(id, patch) {
      calls.update += 1;
      return { id, ...patch };
    },
  };
  const users = {
    findByEmail,
    async setPassword(id, pw) {
      calls.setPassword += 1;
      calls.lastPassword = pw;
    },
  };
  const ctx = {
    models: { StaffProfile: Profile },
    user: { id: 'admin-1', roles: admin ? ['admin'] : [] },
    users,
    method: 'POST',
    params: {},
    headers: {},
    body,
    reply,
  };
  return { ctx, calls };
}

test('(a) conta inexistente → 409 sem_conta, nada gravado', async () => {
  const { ctx, calls } = mkCtx({
    body: { email: 'zzz-nao-existe-xyz@arara-tech.com', fullName: 'Fulano' },
    findByEmail: async () => null,
  });
  const res = await handler(ctx);
  assert.equal(res.status, 409);
  assert.equal(res.body.codigo, 'sem_conta');
  assert.equal(calls.create, 0);
  assert.equal(calls.setPassword, 0);
});

test('(b) conta existe, sem trocar_senha → perfil criado e setPassword NÃO chamado', async () => {
  const { ctx, calls } = mkCtx({
    body: { email: 'joao@arara-tech.com', fullName: 'Joao' },
    findByEmail: async () => ({ id: 'u-joao' }),
  });
  const res = await handler(ctx);
  assert.equal(res.status, 201);
  assert.equal(calls.create, 1);
  assert.equal(calls.setPassword, 0);
  assert.equal(res.body.senha_definida, false);
  assert.equal(res.body.perfil_existia, false);
  assert.equal(res.body.user_id, 'u-joao');
});

test('(c) conta existe, trocar_senha + senha → setPassword chamado uma vez', async () => {
  const { ctx, calls } = mkCtx({
    body: {
      email: 'joao@arara-tech.com',
      fullName: 'Joao',
      trocar_senha: true,
      password: 'segredo123',
    },
    findByEmail: async () => ({ id: 'u-joao' }),
  });
  const res = await handler(ctx);
  assert.equal(res.status, 201);
  assert.equal(calls.setPassword, 1);
  assert.equal(calls.lastPassword, 'segredo123');
  assert.equal(res.body.senha_definida, true);
});

test('(d) perfil já existe → 409 perfil_existe com user_id, create/update NÃO chamados', async () => {
  const { ctx, calls } = mkCtx({
    body: { email: 'dup@arara-tech.com', fullName: 'Duplicado' },
    profiles: [{ id: 'u-dup', email: 'dup@arara-tech.com' }],
  });
  const res = await handler(ctx);
  assert.equal(res.status, 409);
  assert.equal(res.body.codigo, 'perfil_existe');
  assert.equal(res.body.user_id, 'u-dup');
  assert.equal(calls.create, 0);
  assert.equal(calls.update, 0);
});

test('(e) não-admin → 403', async () => {
  const { ctx } = mkCtx({
    admin: false,
    body: { email: 'alguem@arara-tech.com', fullName: 'Alguem' },
    findByEmail: async () => ({ id: 'u-x' }),
  });
  const res = await handler(ctx);
  assert.equal(res.status, 403);
});

test('(f) fonte legível e gerado concordam (exceto o PLATFORM_USER_MAP)', async () => {
  const codigoGerado = codigoHandler('POST', '/users');
  const legivel = fs.readFileSync(FONTE_LEGIVEL, 'utf8');
  const PREFIX = 'var PLATFORM_USER_MAP = ';
  const PLACEHOLDER = PREFIX + '__PLATFORM_USER_MAP__;';
  // Re-normaliza o MAP inlined do gerado para o placeholder e compara.
  const gerNorm = codigoGerado
    .split('\n')
    .map((l) => (l.startsWith(PREFIX) ? PLACEHOLDER : l))
    .join('\n');
  assert.equal(gerNorm, legivel);
});

test('(g) perfil existe com id legado → user_id = id da plataforma, sem create/update', async () => {
  const { ctx, calls } = mkCtx({
    body: { email: 'legado@arara-tech.com', fullName: 'Legado' },
    profiles: [{ id: 'sp-legacy-antigo', email: 'legado@arara-tech.com' }],
    // resolvePlatformUserId cai no findByEmail e devolve o users.id correto.
    findByEmail: async () => ({ id: 'u-plataforma-nova' }),
  });
  const res = await handler(ctx);
  assert.equal(res.status, 409);
  assert.equal(res.body.codigo, 'perfil_existe');
  assert.equal(res.body.user_id, 'u-plataforma-nova'); // NÃO o id do perfil (sp-legacy-antigo)
  assert.equal(calls.create, 0);
  assert.equal(calls.update, 0);
});
