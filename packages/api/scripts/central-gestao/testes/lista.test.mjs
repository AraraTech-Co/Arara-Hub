// GET /cartoes: filtros, ordem, páginas de 200 e leitura acima do teto de 500 da camada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mundo, A, B, hojeSP } from './_camada.mjs';

const lista = (w, query = {}) => w.chamar('GET', '/cartoes', { query });

// Grava direto na camada (rápido) no formato que o POST grava.
function semear(w, n, extra = (i) => ({})) {
  for (let i = 0; i < n; i++) {
    const id = `cartao-${String(i).padStart(4, '0')}`;
    w.models.Cartao.inserirCru('pk-' + id, {
      id, chave_criacao: 'chave-' + id, titulo: `Cartão ${i}`, descricao: null, status: 'para_decidir',
      responsavel_id: null, prazo: null, origem_tipo: null, origem_texto: null, referencia_url: null, decisao: null,
      criado_por: A, criado_em: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), alterado_por: A,
      alterado_em: '2026-01-01T00:00:00.000Z', concluido_em: null, arquivado: false, arquivado_em: null, versao: 1,
      ...extra(i),
    });
  }
}

test('lista: formato da resposta', async () => {
  const w = mundo();
  await w.criar({ titulo: 'Um' });
  const r = await lista(w);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['itens', 'proximo_offset', 'total']);
  assert.deepEqual(Object.keys(r.body.itens[0]).sort(), [
    'alterado_em', 'alterado_por', 'arquivado', 'arquivado_em', 'concluido_em', 'criado_em', 'criado_por', 'decisao',
    'descricao', 'id', 'origem_texto', 'origem_tipo', 'prazo', 'referencia_url', 'responsavel_id', 'status', 'titulo',
    'vencido', 'versao',
  ]);
  assert.equal(r.body.proximo_offset, null);
});

test('lista: 450 cartões vêm em páginas de 200 (200, 400, fim)', async () => {
  const w = mundo();
  semear(w, 450);
  const p1 = await lista(w);
  assert.equal(p1.body.itens.length, 200);
  assert.equal(p1.body.total, 450);
  assert.equal(p1.body.proximo_offset, 200);
  const p2 = await lista(w, { offset: '200' });
  assert.equal(p2.body.proximo_offset, 400);
  const p3 = await lista(w, { offset: '400' });
  assert.equal(p3.body.itens.length, 50);
  assert.equal(p3.body.proximo_offset, null);
  const ids = new Set([...p1.body.itens, ...p2.body.itens, ...p3.body.itens].map((x) => x.id));
  assert.equal(ids.size, 450, 'nenhum repetido, nenhum perdido');
});

test('lista: acima de 500 a leitura pagina a camada e não perde o mais antigo', async () => {
  const w = mundo();
  semear(w, 1203);
  const r = await lista(w, { q: 'Cartão 0' });
  assert.equal(r.body.total, 1, 'o primeiro inserido (que cai fora da janela de 500) é achado');
  const todos = await lista(w);
  assert.equal(todos.body.total, 1203);
  assert.equal(todos.body.incompleto, undefined);
  const chamadas = w.models.Cartao.chamadas.findMany.slice(-3);
  assert.deepEqual(chamadas.map((c) => c.offset), [0, 500, 1000]);
  assert.ok(chamadas.every((c) => c.limit === 500 && c.arquivado === false));
});

test('lista: filtro por status, responsável e "nenhum"', async () => {
  const w = mundo();
  await w.criar({ titulo: 'A1', responsavel_id: A, status: 'em_andamento' });
  await w.criar({ titulo: 'B1', responsavel_id: B });
  await w.criar({ titulo: 'N1' });
  const tit = (r) => r.body.itens.map((x) => x.titulo).sort();
  assert.deepEqual(tit(await lista(w, { status: 'em_andamento' })), ['A1']);
  assert.deepEqual(tit(await lista(w, { responsavel: B })), ['B1']);
  assert.deepEqual(tit(await lista(w, { responsavel: 'nenhum' })), ['N1']);
  assert.deepEqual(tit(await lista(w)), ['A1', 'B1', 'N1']);
  assert.equal((await lista(w, { status: 'apagado' })).status, 400);
});

test('lista: busca por título ignora acento e caixa', async () => {
  const w = mundo();
  await w.criar({ titulo: 'Decisão sobre Preço' });
  await w.criar({ titulo: 'Outro assunto' });
  const r = await lista(w, { q: 'decisao preco' });
  assert.equal(r.body.total, 0, 'termo inteiro, não palavras soltas');
  const r2 = await lista(w, { q: 'DECISAO' });
  assert.deepEqual(r2.body.itens.map((x) => x.titulo), ['Decisão sobre Preço']);
});

test('lista: ordem por prazo (mais próximo primeiro), sem prazo no fim', async () => {
  const w = mundo();
  await w.criar({ titulo: 'Sem prazo' });
  await w.criar({ titulo: 'Depois', prazo: hojeSP(10) });
  await w.criar({ titulo: 'Antes', prazo: hojeSP(2) });
  const r = await lista(w);
  assert.deepEqual(r.body.itens.map((x) => x.titulo), ['Antes', 'Depois', 'Sem prazo']);
});

test('lista: offset inválido é recusado', async () => {
  const w = mundo();
  for (const offset of ['-1', 'abc', '1e3']) {
    assert.equal((await lista(w, { offset })).status, 400, offset);
  }
});

test('eventos: histórico com mais de 500 entradas vem inteiro', async () => {
  const w = mundo();
  const c = await w.criar();
  for (let i = 0; i < 620; i++) {
    w.models.CartaoEvento.inserirCru('ev' + i, { id: 'ev' + i, cartao_id: c.id, tipo: 'edicao', antes: {}, depois: {}, autor_id: A, em: new Date(Date.UTC(2027, 0, 1, 0, 0, 0, i)).toISOString() });
  }
  const r = await w.chamar('GET', '/cartoes/:id/eventos', { params: { id: c.id } });
  assert.equal(r.body.itens.length, 621);
  assert.equal(r.body.itens[0].tipo, 'criado', 'mais antigo primeiro');
});
