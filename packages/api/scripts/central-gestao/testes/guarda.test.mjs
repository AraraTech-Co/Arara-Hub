// A guarda de sessão em TODAS as rotas, chamando o handler exportado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mundo, A, INATIVO, ESTRANHO } from './_camada.mjs';
import { ROTAS } from '../gerar-rotas.mjs';

const ID = 'cartao-qualquer';
function entrada(r) {
  return {
    params: r.path.includes(':id') ? { id: ID } : {},
    body: r.method === 'GET' ? undefined : { chave_criacao: 'chave-guarda-0001', titulo: 'X', versao: 1 },
  };
}

for (const r of ROTAS) {
  const nome = `${r.method} ${r.path}`;

  test(`guarda ${nome}: chave de app sem pessoa → 401 e não grava`, async () => {
    const w = mundo();
    const res = await w.chamar(r.method, r.path, { ...entrada(r), user: { type: 'apiKey', appSlug: 'central-gestao', scopes: [] } });
    assert.equal(res.status, 401);
    assert.equal(res.body.erro, 'sem_sessao');
    assert.equal(w.gravacoes(), 0);
    assert.equal(w.models.Cartao.chamadas.findMany.length + w.models.Cartao.chamadas.findById.length, 0, 'não leu cartões');
  });

  test(`guarda ${nome}: sem ctx.user → 401`, async () => {
    const w = mundo();
    const res = await w.chamar(r.method, r.path, { ...entrada(r), user: null });
    assert.equal(res.status, 401);
  });

  test(`guarda ${nome}: pessoa sem Profile (mesmo admin global) → 403 e não grava`, async () => {
    const w = mundo();
    const res = await w.chamar(r.method, r.path, { ...entrada(r), user: { id: ESTRANHO, email: 'x@exemplo.test', roles: ['admin'] } });
    assert.equal(res.status, 403);
    assert.equal(res.body.erro, 'sem_acesso');
    assert.equal(w.gravacoes(), 0);
  });

  test(`guarda ${nome}: Profile inativo → 403`, async () => {
    const w = mundo();
    const res = await w.chamar(r.method, r.path, { ...entrada(r), user: { id: INATIVO, roles: [] } });
    assert.equal(res.status, 403);
    assert.equal(w.gravacoes(), 0);
  });

  test(`guarda ${nome}: leitura do Profile falhou → 503`, async () => {
    const w = mundo();
    w.models.Profile.falhar.findById = true;
    const res = await w.chamar(r.method, r.path, { ...entrada(r) });
    assert.equal(res.status, 503);
    assert.equal(res.body.erro, 'perfil_indisponivel');
    assert.equal(w.gravacoes(), 0);
  });

  test(`guarda ${nome}: contraste — membro ativo passa da guarda`, async () => {
    const w = mundo();
    const res = await w.chamar(r.method, r.path, { ...entrada(r), user: { id: A, roles: [] } });
    assert.ok(![401, 403, 503].includes(res.status), `status ${res.status}`);
  });
}

test('guarda: Profile achado pelo PK mas com data.id de outra pessoa → 403', async () => {
  const w = mundo();
  w.models.Profile.inserirCru(ESTRANHO, { id: 'outra-pessoa', name: 'Outra', role: 'admin', active: true });
  const res = await w.chamar('GET', '/me', { user: { id: ESTRANHO, roles: [] } });
  assert.equal(res.status, 403);
});

test('guarda: Profile com active "true" (texto) não vale', async () => {
  const w = mundo();
  w.models.Profile.inserirCru('pkT', { id: ESTRANHO, name: 'Texto', active: 'true' });
  const res = await w.chamar('GET', '/me', { user: { id: ESTRANHO, roles: [] } });
  assert.equal(res.status, 403);
});

test('GET /me devolve id, name e role do Profile', async () => {
  const w = mundo();
  const res = await w.chamar('GET', '/me');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: A, name: 'Pessoa A', role: 'admin' });
});

test('GET /membros: só ativos, {id,name}, por nome', async () => {
  const w = mundo();
  const res = await w.chamar('GET', '/membros');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    { id: 'usr-a-0001', name: 'Pessoa A' },
    { id: 'usr-b-0002', name: 'Pessoa B' },
  ]);
});

test('model Cartao ausente → 503 nao_configurado (não 500)', async () => {
  const w = mundo({ semModel: ['Cartao'] });
  const res = await w.chamar('GET', '/cartoes');
  assert.equal(res.status, 503);
  assert.equal(res.body.erro, 'nao_configurado');
});

test('model Profile ausente → 503 nao_configurado', async () => {
  const w = mundo({ semModel: ['Profile'] });
  const res = await w.chamar('GET', '/me');
  assert.equal(res.status, 503);
  assert.equal(res.body.erro, 'nao_configurado');
});
