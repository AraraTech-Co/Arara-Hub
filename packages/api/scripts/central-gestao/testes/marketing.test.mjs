// Fatia 3 — Marketing: cadastro próprio (RF-M01–M05) e a área no resumo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mundo, A, B, INATIVO } from './_camada.mjs';

const criar = async (w, campos = {}, user) => {
  const r = await w.chamar('POST', '/marketing', { user, body: { chave_criacao: crypto.randomUUID(), titulo: 'Ação', ...campos } });
  if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return r.body.registro;
};
const area = async (w, mes) => (await w.chamar('GET', '/resumo', { query: mes ? { mes } : {} })).body.areas.find((a) => a.area_key === 'marketing');
const val = (a, k) => a.indicadores.find((i) => i.metric_key === 'marketing.' + k).value;

test('marketing: criar, listar, editar e recarregar; formato exato', async () => {
  const w = mundo();
  const r = await criar(w, { titulo: '  Campanha de fim de ano ', descricao: 'Posts e e-mail', responsavel_id: B, data_referencia: '2026-12-01' });
  assert.equal(r.titulo, 'Campanha de fim de ano');
  assert.equal(r.status, 'planejado', 'status inicial');
  assert.deepEqual(Object.keys(r).sort(), ['alterado_em', 'alterado_por', 'criado_em', 'criado_por', 'data_referencia', 'descricao', 'id', 'responsavel_id', 'status', 'titulo', 'versao']);
  const e = await w.chamar('PATCH', '/marketing/:id', { params: { id: r.id }, body: { versao: 1, status: 'em_andamento' } });
  assert.equal(e.status, 200);
  assert.equal(e.body.registro.versao, 2);
  const l = await w.chamar('GET', '/marketing');
  assert.deepEqual(Object.keys(l.body).sort(), ['itens', 'proximo_offset', 'total']);
  assert.equal(l.body.itens[0].status, 'em_andamento');
  assert.equal(l.body.itens[0].data_referencia, '2026-12-01');
});

test('marketing: validação — título, status, data, responsável; nada gravado', async () => {
  const w = mundo();
  const casos = [
    { titulo: '   ' }, { titulo: { x: 1 } }, { titulo: 'T', status: 'apagado' }, { titulo: 'T', data_referencia: '2026-02-30' },
    { titulo: 'T', responsavel_id: INATIVO }, { titulo: 'T', descricao: 'd'.repeat(5001) }, { titulo: 'linha\u0000nula' },
  ];
  for (const c of casos) {
    const r = await w.chamar('POST', '/marketing', { body: { chave_criacao: 'chave-mkt-00001', ...c } });
    assert.equal(r.status, 400, JSON.stringify(c).slice(0, 50));
  }
  assert.equal(w.gravacoes(), 0);
});

test('marketing: conflito de versão → 409 com o atual, sem gravar', async () => {
  const w = mundo();
  const r = await criar(w);
  await w.chamar('PATCH', '/marketing/:id', { params: { id: r.id }, body: { versao: 1, titulo: 'De A' } });
  const c = await w.chamar('PATCH', '/marketing/:id', { params: { id: r.id }, body: { versao: 1, titulo: 'De B' }, user: { id: B, roles: [] } });
  assert.equal(c.status, 409);
  assert.equal(c.body.atual.titulo, 'De A');
  assert.equal(w.models.RegistroMarketing.chamadas.update.length, 1);
});

test('marketing: mesma chave não duplica; chave de outra pessoa → 409', async () => {
  const w = mundo();
  const body = { chave_criacao: 'chave-mkt-repete', titulo: 'Uma vez' };
  const r1 = await w.chamar('POST', '/marketing', { body });
  const r2 = await w.chamar('POST', '/marketing', { body });
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 200);
  assert.equal(r2.body.registro.id, r1.body.registro.id);
  const r3 = await w.chamar('POST', '/marketing', { body, user: { id: B, roles: [] } });
  assert.equal(r3.status, 409);
  assert.equal(w.models.RegistroMarketing.linhas.length, 1);
});

test('marketing: PATCH ignora campo desconhecido e não grava sem mudança', async () => {
  const w = mundo();
  const r = await criar(w, { titulo: 'Igual' });
  const s = await w.chamar('PATCH', '/marketing/:id', { params: { id: r.id }, body: { versao: 1, titulo: 'Igual' } });
  assert.equal(s.body.registro.versao, 1);
  assert.equal(w.models.RegistroMarketing.chamadas.update.length, 0);
  await w.chamar('PATCH', '/marketing/:id', { params: { id: r.id }, body: { versao: 1, titulo: 'Novo', criado_por: 'x', id: 'y' } });
  assert.deepEqual(Object.keys(w.models.RegistroMarketing.chamadas.update[0].data).sort(), ['alterado_em', 'alterado_por', 'titulo', 'versao']);
});

test('marketing: lista filtra por status e busca, e lê acima de 500', async () => {
  const w = mundo();
  for (let i = 0; i < 620; i++) {
    w.models.RegistroMarketing.inserirCru('m' + i, { id: 'm' + i, chave_criacao: 'chave-m' + i, titulo: 'Post ' + i, status: i === 0 ? 'concluido' : 'planejado', criado_por: A, criado_em: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), alterado_por: A, alterado_em: '2026-01-01T00:00:00.000Z', versao: 1 });
  }
  const c = await w.chamar('GET', '/marketing', { query: { status: 'concluido' } });
  assert.deepEqual(c.body.itens.map((x) => x.id), ['m0'], 'o mais antigo, fora da janela de 500, é achado');
  const t = await w.chamar('GET', '/marketing');
  assert.equal(t.body.total, 620);
  assert.equal(t.body.proximo_offset, 200);
  const q = await w.chamar('GET', '/marketing', { query: { q: 'POST 61' } });
  assert.equal(q.body.total, 11, 'Post 61 e Post 610–619');
  assert.equal((await w.chamar('GET', '/marketing', { query: { status: 'x' } })).status, 400);
});

test('resumo/marketing: criados no período e não concluídos agora; zero real com base vazia', async () => {
  const w = mundo();
  const vazio = await area(w);
  assert.equal(vazio.state, 'ok');
  assert.equal(val(vazio, 'criados_periodo'), 0, 'base configurada e vazia = 0');
  const reg = (id, status, criado_em) => w.models.RegistroMarketing.inserirCru(id, { id, chave_criacao: 'chave-' + id, titulo: id, status, criado_por: A, criado_em, alterado_por: A, alterado_em: criado_em, versao: 1 });
  reg('nov-plan', 'planejado', '2026-11-05T12:00:00.000Z');
  reg('nov-canc', 'cancelado', '2026-11-06T12:00:00.000Z');
  reg('out-and', 'em_andamento', '2026-10-20T12:00:00.000Z');
  reg('virada', 'concluido', '2026-12-01T02:00:00.000Z'); // 30/11 em SP
  reg('dez1', 'concluido', '2026-12-01T12:00:00.000Z');
  const nov = await area(w, '2026-11');
  assert.equal(val(nov, 'criados_periodo'), 3, 'nov-plan, nov-canc e virada');
  assert.equal(val(nov, 'nao_concluidos'), 2, 'planejado + em andamento, sem cancelado/concluído');
  const out = await area(w, '2026-10');
  assert.equal(val(out, 'criados_periodo'), 1);
  assert.equal(val(out, 'nao_concluidos'), 2, 'estoque não muda com o período');
  const i = nov.indicadores.find((x) => x.metric_key === 'marketing.criados_periodo');
  assert.equal(i.tipo, 'periodo');
  assert.equal(i.unit, 'registros');
});

test('resumo/marketing: edição não conta de novo no período', async () => {
  const w = mundo();
  const r = await criar(w);
  const antes = val(await area(w), 'criados_periodo');
  await w.chamar('PATCH', '/marketing/:id', { params: { id: r.id }, body: { versao: 1, status: 'concluido' } });
  await w.chamar('PATCH', '/marketing/:id', { params: { id: r.id }, body: { versao: 2, status: 'em_andamento' } });
  assert.equal(val(await area(w), 'criados_periodo'), antes);
  assert.equal(antes, 1);
});

test('resumo/marketing: sem base → "não cadastrada" sem número; falha → erro sem número', async () => {
  const w = mundo({ semModel: ['RegistroMarketing'] });
  const a = await area(w);
  assert.deepEqual([a.state, a.reason_code, a.indicadores.length], ['sem_configuracao', 'base_nao_cadastrada', 0]);
  const w2 = mundo();
  w2.models.RegistroMarketing.falhar.findMany = true;
  const b = await area(w2);
  assert.equal(b.state, 'erro');
  assert.ok(b.indicadores.every((x) => x.value === null));
  const k = (await w2.chamar('GET', '/resumo')).body.areas.find((x) => x.area_key === 'kanban');
  assert.equal(k.state, 'ok', 'falha no marketing não derruba o Kanban');
});
