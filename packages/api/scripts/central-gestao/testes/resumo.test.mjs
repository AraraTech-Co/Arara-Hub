// GET /resumo: envelope do PRD 6.1, áreas sem fonte sem número, contagens do Kanban (RF-KI01–03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mundo, A, hojeSP } from './_camada.mjs';

const resumo = (w, query = {}) => w.chamar('GET', '/resumo', { query });
const kanban = (r) => r.body.areas.find((a) => a.area_key === 'kanban');
const val = (r, k) => kanban(r).indicadores.find((i) => i.metric_key === 'kanban.' + k).value;

function cru(w, id, campos) {
  w.models.Cartao.inserirCru('pk-' + id, {
    id, chave_criacao: 'chave-' + id, titulo: id, descricao: null, status: 'para_decidir', responsavel_id: null,
    prazo: null, origem_tipo: null, origem_texto: null, referencia_url: null, decisao: null, criado_por: A,
    criado_em: '2026-01-01T00:00:00.000Z', alterado_por: A, alterado_em: '2026-01-01T00:00:00.000Z',
    concluido_em: null, arquivado: false, arquivado_em: null, versao: 1, ...campos,
  });
}

test('resumo: formato, ordem das áreas e áreas sem fonte sem número', async () => {
  const w = mundo({ semModel: ['RegistroMarketing'] });
  const r = await resumo(w);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['areas', 'gerado_em', 'periodo', 'timezone']);
  assert.equal(r.body.timezone, 'America/Sao_Paulo');
  assert.deepEqual(r.body.areas.map((a) => a.area_key), ['tickets', 'marketing', 'vendas', 'horas', 'kanban']);
  assert.deepEqual(r.body.areas.slice(0, 4).map((a) => [a.state, a.reason_code, a.indicadores.length]), [
    ['definicao_pendente', 'universo_a_definir', 0],
    ['sem_configuracao', 'base_nao_cadastrada', 0],
    ['sem_configuracao', 'fonte_nao_configurada', 0],
    ['sem_configuracao', 'fonte_nao_configurada', 0],
  ]);
  const k = kanban(r);
  assert.equal(k.state, 'ok');
  assert.deepEqual(k.indicadores.map((i) => i.metric_key), [
    'kanban.para_decidir', 'kanban.em_andamento', 'kanban.aguardando', 'kanban.concluidos_periodo', 'kanban.vencidos',
  ]);
  assert.deepEqual(Object.keys(k.indicadores[0]).sort(), [
    'fetched_at', 'label', 'last_success_at', 'metric_key', 'period_end', 'period_start', 'reason_code', 'snapshot_at',
    'source_key', 'source_label', 'state', 'timezone', 'tipo', 'unit', 'universe', 'value',
  ]);
  const agora = k.indicadores[0];
  assert.equal(agora.tipo, 'agora');
  assert.equal(agora.period_start, null);
  assert.ok(agora.snapshot_at);
  const per = k.indicadores[3];
  assert.equal(per.tipo, 'periodo');
  assert.equal(per.period_start, r.body.periodo.inicio);
  assert.equal(per.snapshot_at, null);
  assert.equal(k.indicadores.every((i) => i.value === 0), true, 'zero real com base vazia');
  assert.equal(w.gravacoes(), 0, 'resumo não grava');
});

test('resumo: contagens por status, vencidos e arquivado fora', async () => {
  const w = mundo();
  await w.criar({ titulo: 'pd1' });
  await w.criar({ titulo: 'pd2-vencido', prazo: hojeSP(-1) });
  await w.criar({ titulo: 'and-vencido', status: 'em_andamento', prazo: hojeSP(-5) });
  await w.criar({ titulo: 'and-hoje', status: 'em_andamento', prazo: hojeSP(0) });
  await w.criar({ titulo: 'ag', status: 'aguardando' });
  await w.criar({ titulo: 'conc-atrasado', status: 'concluido', prazo: hojeSP(-9) });
  const arq = await w.criar({ titulo: 'arq', status: 'aguardando', prazo: hojeSP(-3) });
  await w.chamar('POST', '/cartoes/:id/arquivar', { params: { id: arq.id } });
  const r = await resumo(w);
  assert.equal(val(r, 'para_decidir'), 2);
  assert.equal(val(r, 'em_andamento'), 2);
  assert.equal(val(r, 'aguardando'), 1, 'arquivado não conta');
  assert.equal(val(r, 'vencidos'), 2, 'ontem conta, hoje não, concluído e arquivado não');
  assert.equal(val(r, 'concluidos_periodo'), 1);
});

test('resumo: concluídos no período — mês, mês anterior, reaberto e virada de fuso', async () => {
  const w = mundo();
  cru(w, 'nov', { status: 'concluido', concluido_em: '2026-11-10T15:00:00.000Z' });
  cru(w, 'out', { status: 'concluido', concluido_em: '2026-10-31T12:00:00.000Z' });
  cru(w, 'virada', { status: 'concluido', concluido_em: '2026-12-01T02:00:00.000Z' }); // 30/11 23h em SP
  cru(w, 'reaberto', { status: 'em_andamento', concluido_em: null });
  cru(w, 'dez1', { status: 'concluido', concluido_em: '2026-12-01T12:00:00.000Z' }); // 1º/12 em SP: fim exclusivo
  cru(w, 'inconsistente', { status: 'aguardando', concluido_em: '2026-11-15T12:00:00.000Z' }); // só conta se concluído
  cru(w, 'invalido', { status: 'concluido', concluido_em: 'não é data' });
  cru(w, 'nov-arquivado', { status: 'concluido', concluido_em: '2026-11-11T12:00:00.000Z', arquivado: true });
  const nov = await resumo(w, { mes: '2026-11' });
  assert.equal(val(nov, 'concluidos_periodo'), 2, 'nov + virada');
  assert.deepEqual(nov.body.periodo, { inicio: '2026-11-01', fim: '2026-12-01', mes: '2026-11' });
  const dez = await resumo(w, { mes: '2026-12' });
  assert.equal(val(dez, 'concluidos_periodo'), 1, 'virada é novembro em SP; 1º/12 é dezembro');
  assert.deepEqual(dez.body.periodo, { inicio: '2026-12-01', fim: '2027-01-01', mes: '2026-12' });
  const out = await resumo(w, { mes: '2026-10' });
  assert.equal(val(out, 'concluidos_periodo'), 1);
  assert.equal(val(out, 'em_andamento'), 1, 'estoque não muda com o período');
  assert.equal(val(nov, 'em_andamento'), 1);
});

test('resumo: mês padrão é o mês corrente em SP', async () => {
  const w = mundo();
  const r = await resumo(w);
  assert.equal(r.body.periodo.mes, hojeSP(0).slice(0, 7));
});

test('resumo: período inválido → 400', async () => {
  const w = mundo();
  for (const mes of ['2026-13', '2026-00', '26-11', 'abc', '1999-12', '2026-1']) {
    assert.equal((await resumo(w, { mes })).status, 400, mes);
  }
});

test('resumo: leitura falhou → Kanban em erro sem número, demais áreas presentes', async () => {
  const w = mundo();
  await w.criar();
  w.models.Cartao.falhar.findMany = true;
  const r = await resumo(w);
  assert.equal(r.status, 200);
  const k = kanban(r);
  assert.equal(k.state, 'erro');
  assert.equal(k.reason_code, 'falha_leitura');
  assert.ok(k.indicadores.every((i) => i.value === null && i.state === 'erro' && i.last_success_at === null));
  assert.equal(r.body.areas.length, 5);
});

test('resumo: model Cartao ausente → Kanban em erro, não 500', async () => {
  const w = mundo({ semModel: ['Cartao'] });
  const r = await resumo(w);
  assert.equal(r.status, 200);
  assert.equal(kanban(r).state, 'erro');
});

test('resumo: acima de 500 cartões a contagem é inteira', async () => {
  const w = mundo();
  for (let i = 0; i < 1234; i++) cru(w, 'c' + i, {});
  const r = await resumo(w);
  assert.equal(val(r, 'para_decidir'), 1234);
});

test('resumo: leitura que bate no teto não publica número parcial', async () => {
  const w = mundo();
  for (let i = 0; i < 10000; i++) cru(w, 'c' + i, {});
  const r = await resumo(w);
  const k = kanban(r);
  assert.equal(k.state, 'erro');
  assert.equal(k.reason_code, 'leitura_incompleta');
  assert.ok(k.indicadores.every((i) => i.value === null));
});
