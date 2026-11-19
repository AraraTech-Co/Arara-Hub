// Fatias 4–6: Tickets, Vendas e Horas no resumo, com as rotas de resumo REAIS de cada fonte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mundo, A, B } from './_camada.mjs';
import { fontes } from './_fontes.mjs';

const TODOS = { 'portal-suporte': [A, B], 'portal-crm': [A, B], 'portal-horas': [A, B] };
const area = (r, k) => r.body.areas.find((a) => a.area_key === k);
const v = (r, k) => {
  const [a] = k.split('.');
  return area(r, a === 'horas' ? 'horas' : a).indicadores.find((i) => i.metric_key === k);
};
const MES = '2026-11';
const resumo = (w, user) => w.chamar('GET', '/resumo', { query: { mes: MES }, user });

function tk(id, status, extra = {}) {
  return { id, status, created_at: '2026-10-01T12:00:00.000Z', ...extra };
}
function massa() {
  return {
    membros: TODOS,
    suporte: {
      perfis: [{ id: A, role: 'admin' }, { id: B, role: 'user' }],
      tickets: [
        tk('t1', 'novos_chamados', { assigned_to: 'x', created_at: '2026-11-03T12:00:00.000Z' }),
        tk('t2', 'em_atendimento'),
        tk('t3', 'pendencia_dev', { assigned_to: 'y', created_at: '2026-12-01T02:00:00.000Z' }), // 30/11 em SP
        tk('t4', 'resolvido', { created_at: '2026-11-20T12:00:00.000Z' }),
        tk('t5', 'triagem', { is_archived: true, created_at: '2026-11-20T12:00:00.000Z' }),
        tk('t6', 'triagem', { quadro: 'dev', created_at: '2026-11-20T12:00:00.000Z' }),
        tk('t7', 'aguardando_cliente', { assignedTo: 'z' }),
        tk('t8', 'fechado', { created_at: '2026-12-01T12:00:00.000Z' }),
      ],
    },
    crm: {
      deals: [
        { id: 'd1', status: 'won', value: 1000.5, closedAt: '2026-11-10T12:00:00.000Z' },
        { id: 'd2', status: 'won', value: 2000, closedAt: '2026-12-01T02:30:00.000Z' }, // 30/11 em SP
        { id: 'd3', status: 'won', value: 999, closedAt: '2026-12-01T12:00:00.000Z' },
        { id: 'd4', status: 'lost', value: 500, closedAt: '2026-11-10T12:00:00.000Z' },
        { id: 'd5', status: 'open', value: 700, closedAt: null },
        { id: 'd6', status: 'won', value: null, closedAt: '2026-11-11T12:00:00.000Z' },
      ],
      // inserção: mais antiga primeiro; a camada devolve a mais nova primeiro
      goals: [
        { id: 'g1', userId: 'v1', periodMonth: 11, periodYear: 2026, targetValue: 9999 },
        { id: 'g2', userId: 'v1', periodMonth: 11, periodYear: 2026, targetValue: 5000 },
        { id: 'g3', userId: 'v2', periodMonth: 11, periodYear: 2026, targetValue: 1000 },
        { id: 'g4', userId: 'v3', periodMonth: 10, periodYear: 2026, targetValue: 7777 },
      ],
    },
    horas: {
      perfis: [{ id: A, role: 'admin', active: true }, { id: B, role: 'analyst', active: true }, { id: 'adm2', role: 'admin', active: true }],
      lancamentos: [
        { id: 'h1', user_id: 'u1', date: '2026-11-03', duration_minutes: 120, status: 'APPROVED' },
        { id: 'h2', user_id: 'u1', date: '2026-11-04', duration_minutes: 60, status: 'ADJUSTED' },
        { id: 'h3', user_id: 'u2', date: '2026-11-05', duration_minutes: 30, status: 'PENDING' },
        { id: 'h4', user_id: 'u3', date: '2026-11-06', duration_minutes: 45, status: 'REJECTED' },
        { id: 'h5', user_id: 'u1', date: '2026-10-31', duration_minutes: 600, status: 'APPROVED' },
        { id: 'h6', user_id: 'adm2', date: '2026-11-07', duration_minutes: 480, status: 'APPROVED' },
      ],
    },
  };
}

test('resumo com fontes: tickets, vendas e horas a partir das rotas reais', async () => {
  const f = fontes(massa());
  const w = mundo({ fetch: f.fetch });
  const r = await resumo(w);
  assert.equal(r.status, 200);
  // Tickets: ativos = t1, t2, t3, t7 (t5 arquivado, t6 quadro dev, t4/t8 resolvidos)
  assert.equal(area(r, 'tickets').state, 'ok');
  assert.equal(v(r, 'tickets.ativos').value, 4);
  assert.equal(v(r, 'tickets.sem_responsavel').value, 1, 't2; assignedTo também vale');
  assert.equal(v(r, 'tickets.criados_periodo').value, 3, 't1, t3 (virada), t4; não t5/t6/t8');
  assert.equal(v(r, 'tickets.resolvidos_periodo').value, null);
  assert.equal(v(r, 'tickets.resolvidos_periodo').state, 'definicao_pendente');
  // Vendas: d1 + d2 (virada) + d6 (sem valor)
  assert.equal(v(r, 'vendas.vendido').value, 3000.5);
  assert.equal(v(r, 'vendas.ganhos').value, 3);
  assert.equal(v(r, 'vendas.meta').value, 6000, 'v1 = 5000 (a mais recente), v2 = 1000; v3 é de outubro');
  assert.equal(v(r, 'vendas.atingimento').value, 50);
  // Horas: sem admin; outubro fora
  assert.equal(v(r, 'horas.aprovadas').value, 180);
  assert.equal(v(r, 'horas.pendentes').value, 30);
  assert.equal(v(r, 'horas.analistas').value, 3, 'u1, u2, u3 (rejeitado também conta)');
  assert.equal(v(r, 'horas.media').value, 60);
  assert.equal(v(r, 'horas.custo').value, null);
  assert.equal(v(r, 'horas.custo').state, 'definicao_pendente');
  for (const k of ['tickets.ativos', 'vendas.vendido', 'horas.aprovadas']) {
    assert.equal(v(r, k).state, 'ok');
    assert.ok(v(r, k).last_success_at);
  }
  assert.equal(v(r, 'tickets.ativos').tipo, 'agora');
  assert.equal(v(r, 'vendas.vendido').tipo, 'periodo');
  assert.equal(v(r, 'vendas.vendido').unit, 'BRL');
});

test('resumo com fontes: chama só com o JWT de quem consulta, no mês pedido', async () => {
  const f = fontes(massa());
  const w = mundo({ fetch: f.fetch });
  await resumo(w);
  assert.deepEqual(f.chamadas.map((c) => c.url).sort(), [
    'https://api.arara-tech.com/v1/r/portal-crm/vendas/resumo-gestao?mes=2026-11',
    'https://api.arara-tech.com/v1/r/portal-horas/hour-entries/resumo?month=2026-11',
    'https://api.arara-tech.com/v1/r/portal-suporte/tickets/resumo-gestao?mes=2026-11',
  ]);
  for (const c of f.chamadas) {
    assert.deepEqual(Object.keys(c.init.headers).sort(), ['accept', 'authorization']);
    assert.equal(c.init.headers.authorization, 'Bearer ' + A);
  }
});

test('resumo com fontes: resposta não traz nenhum dado individual', async () => {
  const f = fontes(massa());
  const w = mundo({ fetch: f.fetch });
  const txt = JSON.stringify((await resumo(w)).body);
  for (const proibido of ['u1', 'u2', 'adm2', 'v1', 'd1', 't1', 'g1']) assert.ok(!txt.includes(`"${proibido}"`), proibido);
});

test('resumo com fontes: sem membership numa fonte → só aquela área "sem permissão"', async () => {
  const m = massa();
  m.membros = { ...TODOS, 'portal-crm': [A] };
  const f = fontes(m);
  const w = mundo({ fetch: f.fetch });
  const r = await resumo(w, { id: B, roles: [] });
  assert.equal(area(r, 'vendas').state, 'sem_permissao');
  assert.ok(area(r, 'vendas').indicadores.every((i) => i.value === null));
  assert.equal(area(r, 'tickets').state, 'ok', 'contraste: a mesma pessoa vê tickets');
});

test('resumo com fontes: Horas para quem não é admin lá → sem permissão, nunca o total de uma pessoa', async () => {
  const f = fontes(massa());
  const w = mundo({ fetch: f.fetch });
  const r = await resumo(w, { id: B, roles: [] });
  assert.equal(area(r, 'horas').state, 'sem_permissao');
  assert.ok(area(r, 'horas').indicadores.filter((i) => i.metric_key !== 'horas.custo').every((i) => i.value === null));
  const ra = await resumo(w);
  assert.equal(area(ra, 'horas').state, 'ok', 'contraste: admin vê');
});

test('resumo com fontes: suporte sem Profile → sem permissão (a guarda do portal decide)', async () => {
  const m = massa();
  m.suporte.perfis = [{ id: B, role: 'user' }];
  const f = fontes(m);
  const r = await resumo(mundo({ fetch: f.fetch }));
  assert.equal(area(r, 'tickets').state, 'sem_permissao');
});

test('resumo com fontes: falha, truncado e allowlist são tratados por área', async () => {
  const f = fontes({ ...massa(), falhar: { 'portal-suporte': 'throw', 'portal-crm': 'truncated', 'portal-horas': 'allowlist' } });
  const r = await resumo(mundo({ fetch: f.fetch }));
  assert.deepEqual([area(r, 'tickets').state, area(r, 'tickets').reason_code], ['erro', 'falha_leitura']);
  assert.deepEqual([area(r, 'vendas').state, area(r, 'vendas').reason_code], ['erro', 'falha_leitura']);
  assert.deepEqual([area(r, 'horas').state, area(r, 'horas').reason_code], ['sem_configuracao', 'fonte_nao_configurada']);
  assert.equal(area(r, 'kanban').state, 'ok', 'as áreas próprias continuam');
  for (const k of ['tickets', 'vendas', 'horas']) assert.ok(area(r, k).indicadores.every((i) => i.value === null), k);
});

test('resumo com fontes: rota da fonte ainda não publicada (404) → fonte não configurada', async () => {
  const f = fontes(massa());
  const fetch404 = async (url, init) => (url.includes('portal-crm') ? { status: 404, headers: {}, body: '{"error":"App not found"}' } : f.fetch(url, init));
  const r = await resumo(mundo({ fetch: fetch404 }));
  assert.equal(area(r, 'vendas').state, 'sem_configuracao');
});

test('resumo com fontes: leitura incompleta na fonte → erro sem número', async () => {
  const f = fontes(massa());
  const fetchInc = async (url, init) => (url.includes('portal-horas') ? { status: 200, headers: {}, body: '{"month":"2026-11","complete":false}' } : f.fetch(url, init));
  const r = await resumo(mundo({ fetch: fetchInc }));
  assert.deepEqual([area(r, 'horas').state, area(r, 'horas').reason_code], ['erro', 'leitura_incompleta']);
});

test('resumo com fontes: sem meta no mês → "meta não cadastrada" e sem percentual', async () => {
  const m = massa();
  m.crm.goals = [{ id: 'g9', userId: 'v1', periodMonth: 11, periodYear: 2026, targetValue: 0 }];
  const r = await resumo(mundo({ fetch: fontes(m).fetch }));
  assert.deepEqual([v(r, 'vendas.meta').state, v(r, 'vendas.meta').reason_code, v(r, 'vendas.meta').value], ['sem_configuracao', 'meta_nao_cadastrada', null]);
  assert.equal(v(r, 'vendas.atingimento').value, null);
  assert.equal(v(r, 'vendas.vendido').value, 3000.5, 'vendido continua');
});

test('resumo com fontes: mês sem analistas → média sem número, não 0', async () => {
  const m = massa();
  m.horas.lancamentos = [];
  const r = await resumo(mundo({ fetch: fontes(m).fetch }));
  assert.equal(v(r, 'horas.analistas').value, 0);
  assert.equal(v(r, 'horas.media').value, null);
  assert.equal(v(r, 'horas.media').reason_code, 'sem_analistas', 'diz por que não há número');
});

test('resumo com fontes: acima de 500 registros nas fontes as contagens são inteiras', async () => {
  const m = massa();
  m.suporte.tickets = Array.from({ length: 1301 }, (_, i) => tk('x' + i, 'triagem', { assigned_to: 'a' }));
  m.crm.deals = Array.from({ length: 777 }, (_, i) => ({ id: 'd' + i, status: 'won', value: 1, closedAt: '2026-11-02T12:00:00.000Z' }));
  m.horas.lancamentos = Array.from({ length: 1203 }, (_, i) => ({ id: 'h' + i, user_id: 'u' + (i % 7), date: '2026-11-02', duration_minutes: 1, status: 'APPROVED' }));
  const r = await resumo(mundo({ fetch: fontes(m).fetch }));
  assert.equal(v(r, 'tickets.ativos').value, 1301);
  assert.equal(v(r, 'vendas.ganhos').value, 777);
  assert.equal(v(r, 'horas.aprovadas').value, 1203);
  assert.equal(v(r, 'horas.analistas').value, 7);
});
