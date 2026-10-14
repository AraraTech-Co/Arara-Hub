// Testes da lib de cadastro em 3 passos — fetch interceptado, sem rede nem
// bundler. node --test. ARARA_URL fica vazio fora do Vite, então as URLs são
// relativas (/v1/...); o roteador do mock casa por substring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cadastrarUsuario, mensagemSucesso } from './cadastro-usuario.js';

function instalarLocalStorage(inicial = {}) {
  const mapa = new Map(Object.entries(inicial));
  global.localStorage = {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k),
  };
  return mapa;
}

function resposta(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Instala global.fetch com um roteador; devolve o log de chamadas. */
function instalarFetch(rotear) {
  const chamadas = [];
  global.fetch = async (url, opts = {}) => {
    const reg = { url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers || {} };
    chamadas.push(reg);
    const r = rotear(reg, chamadas);
    if (r === null) return Promise.reject(new Error('rede'));
    return r;
  };
  return chamadas;
}

const base = {
  nome: 'Fulano de Tal',
  role: 'user',
  managerRole: false,
  active: true,
  canLogProject: true,
};

test('conta nova: cria conta, grava perfil, libera acesso (sem reenviar senha no passo 2)', async () => {
  instalarLocalStorage({ token: 'JWT' });
  const chamadas = instalarFetch((req) => {
    if (req.url.includes('/v1/auth/register')) return resposta(201, { token: 'da-pessoa-nova' });
    if (req.url.includes('/v1/r/portal-horas/users')) return resposta(201, { user_id: 'u1' });
    if (req.url.includes('/members') && req.method === 'GET') return resposta(200, { members: [] });
    if (req.url.includes('/members') && req.method === 'POST') return resposta(200, { ok: true });
    throw new Error('rota inesperada ' + req.method + ' ' + req.url);
  });
  const r = await cadastrarUsuario({ ...base, email: 'novo@arara-tech.com', senha: 'segredo123' });
  assert.equal(r.contaCriada, true);
  assert.equal(r.perfilExistia, false);
  assert.equal(r.acessoLiberado, true);
  assert.equal(r.senhaDefinida, false);
  assert.equal(r.senhaIgnorada, false);
  // passo 2 não reenvia a senha de conta nova
  const perfil = chamadas.find((c) => c.url.includes('/users'));
  const corpo = JSON.parse(perfil.body);
  assert.equal(corpo.trocar_senha, false);
  assert.equal(corpo.password, undefined);
});

test('conta existente + senha + caixa DESMARCADA: senha não é aplicada e o aviso é obrigatório', async () => {
  instalarLocalStorage({ token: 'JWT' });
  const chamadas = instalarFetch((req) => {
    if (req.url.includes('/v1/auth/register')) return resposta(409, { error: 'exists' });
    if (req.url.includes('/v1/r/portal-horas/users')) return resposta(201, { user_id: 'u2' });
    if (req.url.includes('/members') && req.method === 'GET') return resposta(200, { members: [] });
    if (req.url.includes('/members') && req.method === 'POST') return resposta(200, { ok: true });
    throw new Error('rota inesperada');
  });
  const r = await cadastrarUsuario({
    ...base,
    email: 'ja-existe@arara-tech.com',
    senha: 'digitada123',
    trocarSenha: false,
  });
  assert.equal(r.contaCriada, false);
  assert.equal(r.senhaDefinida, false);
  assert.equal(r.senhaIgnorada, true);
  const corpo = JSON.parse(chamadas.find((c) => c.url.includes('/users')).body);
  assert.equal(corpo.trocar_senha, false);
  assert.equal(corpo.password, undefined);
  assert.match(mensagemSucesso(r), /NÃO foi aplicada/);
});

test('conta existente + caixa MARCADA: grava a nova senha no passo 2', async () => {
  instalarLocalStorage({ token: 'JWT' });
  const chamadas = instalarFetch((req) => {
    if (req.url.includes('/v1/auth/register')) return resposta(409, { error: 'exists' });
    if (req.url.includes('/v1/r/portal-horas/users')) return resposta(201, { user_id: 'u2b' });
    if (req.url.includes('/members') && req.method === 'GET') return resposta(200, { members: [] });
    if (req.url.includes('/members') && req.method === 'POST') return resposta(200, { ok: true });
    throw new Error('rota inesperada');
  });
  const r = await cadastrarUsuario({
    ...base,
    email: 'troca@arara-tech.com',
    senha: 'novasenha123',
    trocarSenha: true,
  });
  assert.equal(r.senhaDefinida, true);
  assert.equal(r.senhaIgnorada, false);
  const corpo = JSON.parse(chamadas.find((c) => c.url.includes('/users')).body);
  assert.equal(corpo.trocar_senha, true);
  assert.equal(corpo.password, 'novasenha123');
});

test('já é membro: NÃO faz POST em /members', async () => {
  instalarLocalStorage({ token: 'JWT' });
  const chamadas = instalarFetch((req) => {
    if (req.url.includes('/v1/r/portal-horas/users')) return resposta(201, { user_id: 'u3' });
    if (req.url.includes('/members') && req.method === 'GET')
      return resposta(200, { members: [{ userId: 'u3', role: 'admin' }] });
    if (req.url.includes('/members') && req.method === 'POST') throw new Error('não deveria postar /members');
    throw new Error('rota inesperada ' + req.method + ' ' + req.url);
  });
  const r = await cadastrarUsuario({ ...base, email: 'membro@arara-tech.com', senha: '' });
  assert.equal(r.jaEraMembro, true);
  assert.equal(r.acessoLiberado, false);
  assert.equal(chamadas.filter((c) => c.url.includes('/members') && c.method === 'POST').length, 0);
});

test('senha vazia + conta inexistente → mensagem para preencher a senha (nada gravado)', async () => {
  instalarLocalStorage({ token: 'JWT' });
  instalarFetch((req) => {
    if (req.url.includes('/v1/r/portal-horas/users')) return resposta(409, { codigo: 'sem_conta', error: 'x' });
    throw new Error('rota inesperada');
  });
  await assert.rejects(
    cadastrarUsuario({ ...base, email: 'ninguem@arara-tech.com', senha: '' }),
    /Preencha a senha inicial/,
  );
});

test('403 no passo 3 (GET members) → mensagem de que não administra o app', async () => {
  instalarLocalStorage({ token: 'JWT' });
  instalarFetch((req) => {
    if (req.url.includes('/v1/r/portal-horas/users')) return resposta(201, { user_id: 'u4' });
    if (req.url.includes('/members') && req.method === 'GET') return resposta(403, { error: 'forbidden' });
    throw new Error('rota inesperada');
  });
  await assert.rejects(
    cadastrarUsuario({ ...base, email: 'semadmin@arara-tech.com', senha: '' }),
    /não administra o Gestão de Horas/,
  );
});

test('401 com renovação: renova a sessão uma vez e repete', async () => {
  instalarLocalStorage({ token: 'T1', arara_refresh: 'REF' });
  const chamadas = instalarFetch((req) => {
    if (req.url.includes('/v1/r/portal-horas/users')) return resposta(201, { user_id: 'u5' });
    if (req.url.includes('/v1/auth/refresh')) return resposta(200, { token: 'T2' });
    if (req.url.includes('/members') && req.method === 'GET') {
      const auth = req.headers.Authorization || '';
      return auth.includes('T2') ? resposta(200, { members: [] }) : resposta(401, { error: 'expired' });
    }
    if (req.url.includes('/members') && req.method === 'POST') return resposta(200, { ok: true });
    throw new Error('rota inesperada');
  });
  const r = await cadastrarUsuario({ ...base, email: 'renova@arara-tech.com', senha: '' });
  assert.equal(r.acessoLiberado, true);
  assert.equal(chamadas.filter((c) => c.url.includes('/v1/auth/refresh')).length, 1);
  assert.equal(global.localStorage.getItem('token'), 'T2');
});

test('GET /members falhou (500): não faz POST e para com aviso de que não deu para conferir', async () => {
  instalarLocalStorage({ token: 'JWT' });
  const chamadas = instalarFetch((req) => {
    if (req.url.includes('/v1/r/portal-horas/users')) return resposta(201, { user_id: 'u6' });
    if (req.url.includes('/members') && req.method === 'GET') return resposta(500, { error: 'boom' });
    if (req.url.includes('/members') && req.method === 'POST') throw new Error('não deveria postar /members');
    throw new Error('rota inesperada');
  });
  await assert.rejects(
    cadastrarUsuario({ ...base, email: 'conferir@arara-tech.com', senha: '' }),
    /não deu para conferir/,
  );
  assert.equal(chamadas.filter((c) => c.url.includes('/members') && c.method === 'POST').length, 0);
});
