// Compressão das respostas da API (@fastify/compress), e a metade que fica
// DESLIGADA de propósito.
//
// Por que existe: a API respondia sem compressão nenhuma, e o navegador fala
// DIRETO com ela (NEXT_PUBLIC_ARARA_API_URL), então o nginx dos fronts não
// entra neste caminho. A lista de conversas do portal são ~620 KiB a cada 10 s
// por atendente.
//
// O QUE ESTE TESTE PROVA, e o que ele NÃO prova: ele sobe um Fastify de
// brinquedo com as MESMAS opções do server.ts e mede a resposta. Isso prova que
// o plugin funciona nesta versão do Fastify e que as opções fazem o que eu digo
// que fazem. NÃO prova que o servidor real responde comprimido em produção —
// essa medição é na ponta, depois do deploy.
//
// A segunda metade compara as opções com o que está escrito no server.ts, para
// as duas não divergirem em silêncio.
//
// Roda com: node --test scripts/testes/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import Fastify from 'fastify';
import compress from '@fastify/compress';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const SERVER_TS = fs.readFileSync(path.join(RAIZ, 'src/server.ts'), 'utf8');

/**
 * As opções LIDAS DO server.ts, não copiadas.
 *
 * Copiá-las aqui faria os casos abaixo medirem a minha própria cópia: mudar o
 * server.ts não quebraria teste nenhum, e o verde não diria nada sobre o que
 * vai a produção. Lendo do arquivo, toda mutação lá se reflete aqui.
 *
 * O literal é do nosso próprio repositório e só tem valores constantes.
 */
function opcoesDoServidor() {
  const m = /register\(compress,\s*(\{[\s\S]*?\n {2}\})\)/.exec(SERVER_TS);
  if (!m) throw new Error('não achei o registro do compress no server.ts');
  return new Function('return (' + m[1] + ')')();
}
const OPCOES = opcoesDoServidor();

/** Corpo grande o suficiente para passar do limiar, e compressível. */
const GRANDE = { conversas: Array.from({ length: 200 }, (_, i) => ({
  id: 'c' + i, status: 'open', contact_name: 'Cliente de Teste', phase: 'em_atendimento',
})) };

async function servidor() {
  const app = Fastify({ logger: false });
  await app.register(compress, OPCOES);
  app.get('/grande', async () => GRANDE);
  app.get('/pequeno', async () => ({ ok: true }));
  app.get('/ja-codificado', async (_req, reply) => {
    // Rota que já devolve codificado: não pode ser comprimida de novo.
    const bruto = zlib.gzipSync(Buffer.from(JSON.stringify(GRANDE)));
    reply.header('content-encoding', 'gzip').type('application/json');
    return bruto;
  });
  app.post('/eco', async (req) => ({ tipo: typeof req.body, temChave: !!(req.body && req.body.oi) }));
  await app.ready();
  return app;
}

test('resposta grande vem comprimida quando o cliente aceita', async () => {
  const app = await servidor();
  try {
    const r = await app.inject({
      method: 'GET', url: '/grande', headers: { 'accept-encoding': 'gzip' },
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-encoding'], 'gzip');
    assert.match(String(r.headers.vary || ''), /accept-encoding/i);

    // E o conteúdo sobrevive à ida e volta: comprimir não pode corromper.
    const devolvido = JSON.parse(zlib.gunzipSync(r.rawPayload).toString('utf8'));
    assert.deepEqual(devolvido, GRANDE);

    // E comprimiu de verdade, não só pôs o cabeçalho.
    const cru = Buffer.byteLength(JSON.stringify(GRANDE));
    assert.ok(r.rawPayload.length < cru / 2,
      `esperava menos da metade: ${r.rawPayload.length} de ${cru}`);
  } finally { await app.close(); }
});

test('cliente que não aceita compressão recebe cru', async () => {
  const app = await servidor();
  try {
    const r = await app.inject({ method: 'GET', url: '/grande' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-encoding'], undefined);
    assert.deepEqual(JSON.parse(r.payload), GRANDE);
  } finally { await app.close(); }
});

test('resposta pequena não é comprimida (limiar de 1 KiB)', async () => {
  const app = await servidor();
  try {
    const r = await app.inject({
      method: 'GET', url: '/pequeno', headers: { 'accept-encoding': 'gzip' },
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-encoding'], undefined,
      'corpo minúsculo comprimido gasta processador e cabeçalho para nada');
    assert.deepEqual(JSON.parse(r.payload), { ok: true });
  } finally { await app.close(); }
});

test('resposta que já vem codificada não é comprimida de novo', async () => {
  const app = await servidor();
  try {
    const r = await app.inject({
      method: 'GET', url: '/ja-codificado', headers: { 'accept-encoding': 'gzip' },
    });
    assert.equal(r.statusCode, 200);
    // Uma só camada de gzip: descomprimir uma vez tem de dar o JSON.
    const devolvido = JSON.parse(zlib.gunzipSync(r.rawPayload).toString('utf8'));
    assert.deepEqual(devolvido, GRANDE);
  } finally { await app.close(); }
});

test('descompressão de REQUISIÇÃO fica desligada', async () => {
  // A metade que o plugin liga por padrão e que este PR desliga de propósito:
  // aceitar corpo comprimido muda a superfície de entrada da plataforma.
  const app = await servidor();
  try {
    const corpo = zlib.gzipSync(Buffer.from(JSON.stringify({ oi: 1 })));
    const r = await app.inject({
      method: 'POST', url: '/eco', payload: corpo,
      headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
    });
    assert.ok(r.statusCode >= 400,
      `corpo gzip devia ser recusado, veio ${r.statusCode}: ${r.payload}`);
  } finally { await app.close(); }
});

test('requisição normal continua funcionando', async () => {
  const app = await servidor();
  try {
    const r = await app.inject({
      method: 'POST', url: '/eco', payload: { oi: 1 },
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(JSON.parse(r.payload), { tipo: 'object', temChave: true });
  } finally { await app.close(); }
});

test('as opções do teste não divergiram do server.ts', () => {
  // Sem isto, alguém muda o server.ts e o teste segue verde medindo outra
  // configuração — o erro que mais custou nesta sessão.
  assert.match(SERVER_TS, /globalCompression:\s*true/,
    'server.ts precisa ligar a compressão explicitamente');
  assert.match(SERVER_TS, /globalDecompression:\s*false/,
    'server.ts precisa DESLIGAR a descompressão de requisição explicitamente');
  assert.match(SERVER_TS, /threshold:\s*1024/, 'o limiar mudou no server.ts');
  assert.match(SERVER_TS, /encodings:\s*\['gzip',\s*'deflate'\]/,
    'a lista de codificações mudou no server.ts');
  // `global: true` sozinho ligaria as DUAS metades — é o engano a evitar.
  assert.doesNotMatch(SERVER_TS, /register\(compress,\s*\{[^}]*\bglobal:\s*true/s,
    '`global: true` ligaria também a descompressão de requisição');
});
