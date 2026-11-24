// Trava de mês fechado nas rotas que gravam lançamentos. Handlers carregados do
// routes.generated.ts; models falsos fiéis à camada (_fakes.mjs). Massa SINTÉTICA.
// Outubro/2026 fechado, novembro/2026 aberto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarHandler, todosHandlers, compilar } from './_carregar.mjs';
import { tabela, contexto, lanc, PERFIS } from './_fakes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRECHO = fs.readFileSync(path.resolve(__dirname, '../mes-fechado.js'), 'utf8');

const OUT = '2026-10-15';
const NOV = '2026-11-16';

function mundo({ fechados = ['2026-10'], lancamentos, falharFechamento = false } = {}) {
  return {
    HourEntries: tabela(
      lancamentos || [
        lanc('out1', OUT),
        lanc('nov1', NOV),
        lanc('out-aprovado', OUT, { status: 'APPROVED' }),
      ],
    ),
    MonthClosures: tabela(
      fechados.map((m) => ({ id: m, month: m, status: 'fechado', history: [] })),
      { falharLeitura: falharFechamento },
    ),
    StaffProfile: tabela(PERFIS),
  };
}

const ROTAS = {
  criar: { m: 'POST', p: '/hour-entries', ctx: (d) => ({ body: { date: d, start_time: '09:00', end_time: '10:00' } }) },
  editar: { m: 'PATCH', p: '/hour-entries/:id', ctx: (_d, id) => ({ params: { id }, body: { description: 'x' } }) },
  excluir: { m: 'DELETE', p: '/hour-entries/:id', ctx: (_d, id) => ({ params: { id } }) },
  aprovar: { m: 'POST', p: '/hour-entries/:id/approve', ctx: (_d, id) => ({ params: { id }, body: { action: 'approve' } }) },
  ajustar: {
    m: 'POST',
    p: '/hour-entries/:id/approve',
    ctx: (_d, id) => ({ params: { id }, body: { action: 'adjust', justification: 'ok' } }),
  },
  rejeitar: {
    m: 'POST',
    p: '/hour-entries/:id/approve',
    ctx: (_d, id) => ({ params: { id }, body: { action: 'reject', justification: 'não' } }),
  },
};

async function chamar(nome, { data, id, models, user = 'adm' }) {
  const r = ROTAS[nome];
  const h = carregarHandler(r.m, r.p);
  return h(contexto({ method: r.m, user, models, ...r.ctx(data, id) }));
}

for (const nome of Object.keys(ROTAS)) {
  test(`${nome}: mês fechado recusa com 409 e não grava; mês aberto grava`, async () => {
    const fechado = mundo();
    const r = await chamar(nome, { data: OUT, id: 'out1', models: fechado });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body, { error: 'mes_fechado', month: '2026-10' });
    assert.deepEqual(fechado.HourEntries.gravacoes, []);

    const aberto = mundo();
    const ok = await chamar(nome, { data: NOV, id: 'nov1', models: aberto });
    assert.ok(ok.status < 300, `${nome} em mês aberto respondeu ${ok.status}`);
    assert.equal(aberto.HourEntries.gravacoes.length, 1);
  });

  test(`${nome}: falha ao ler o fechamento responde 503 e não grava`, async () => {
    const w = mundo({ falharFechamento: true });
    const r = await chamar(nome, { data: NOV, id: 'nov1', models: w });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'leitura_fechamento');
    assert.deepEqual(w.HourEntries.gravacoes, []);
  });

  test(`${nome}: sem o model MonthClosures nenhum mês está fechado`, async () => {
    const w = mundo();
    const r = ROTAS[nome];
    const h = carregarHandler(r.m, r.p);
    const res = await h(
      contexto({ method: r.m, user: 'adm', models: { HourEntries: w.HourEntries, StaffProfile: w.StaffProfile }, ausentes: ['MonthClosures'], ...r.ctx(OUT, 'out1') }),
    );
    assert.ok(res.status < 300, `respondeu ${res.status}`);
    assert.equal(w.HourEntries.gravacoes.length, 1);
  });
}

test('dono também é recusado em mês fechado (não só admin)', async () => {
  const w = mundo();
  const r = await chamar('editar', { id: 'out1', models: w, user: 'u' });
  assert.equal(r.status, 409);
  const c = await chamar('criar', { data: OUT, models: w, user: 'u' });
  assert.equal(c.status, 409);
  assert.deepEqual(w.HourEntries.gravacoes, []);
});

test('PATCH que move lançamento de mês aberto para mês fechado é recusado', async () => {
  const w = mundo();
  const h = carregarHandler('PATCH', '/hour-entries/:id');
  const r = await h(contexto({ method: 'PATCH', params: { id: 'nov1' }, body: { date: '2026-10-20' }, models: w }));
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: 'mes_fechado', month: '2026-10' });
  assert.deepEqual(w.HourEntries.gravacoes, []);
});

test('aprovar em lote: aprova os meses abertos e lista os de mês fechado', async () => {
  const w = mundo({
    lancamentos: [lanc('o1', OUT), lanc('o2', '2026-10-02'), lanc('n1', NOV), lanc('n2', '2026-11-03')],
  });
  const h = carregarHandler('POST', '/hour-entries/bulk-approve');
  const r = await h(contexto({ method: 'POST', body: { user_id: 'u' }, models: w }));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.approvedCount, 2);
  assert.deepEqual(
    r.body.data.closedMonth.map((x) => x.id).sort(),
    ['o1', 'o2'],
  );
  assert.ok(r.body.data.closedMonth.every((x) => x.month === '2026-10'));
  assert.deepEqual(w.HourEntries.gravacoes.map((g) => g.id).sort(), ['n1', 'n2']);
});

test('aprovar em lote: falha ao ler o fechamento não aprova nada', async () => {
  const w = mundo({ falharFechamento: true });
  const h = carregarHandler('POST', '/hour-entries/bulk-approve');
  const r = await h(contexto({ method: 'POST', body: { user_id: 'u' }, models: w }));
  assert.equal(r.status, 503);
  assert.deepEqual(w.HourEntries.gravacoes, []);
});

test('aprovar em lote lê todas as páginas da pessoa, além dos 500 mais recentes de todos', async () => {
  // 30 pendentes da pessoa criados primeiro; depois 900 de outra pessoa
  const linhas = [];
  for (let i = 0; i < 30; i += 1) linhas.push(lanc('u' + i, NOV));
  for (let i = 0; i < 900; i += 1) linhas.push(lanc('x' + i, NOV, { user_id: 'outra' }));
  const w = mundo({ fechados: [], lancamentos: linhas });
  const h = carregarHandler('POST', '/hour-entries/bulk-approve');
  const r = await h(contexto({ method: 'POST', body: { user_id: 'u' }, models: w }));
  assert.equal(r.body.data.approvedCount, 30);
  // e mais de 500 pendentes da própria pessoa
  const muitos = [];
  for (let i = 0; i < 1200; i += 1) muitos.push(lanc('m' + i, NOV));
  const w2 = mundo({ fechados: [], lancamentos: muitos });
  const r2 = await h(contexto({ method: 'POST', body: { user_id: 'u' }, models: w2 }));
  assert.equal(r2.body.data.approvedCount, 1200);
});

test('PUT /hour-entries/:id responde 405 e não grava', async () => {
  const w = mundo({ fechados: [] });
  const h = carregarHandler('PUT', '/hour-entries/:id');
  const r = await h(contexto({ method: 'PUT', params: { id: 'nov1' }, body: { status: 'APPROVED' }, models: w }));
  assert.equal(r.status, 405);
  assert.deepEqual(w.HourEntries.gravacoes, []);
});

// Pega rota nova (ou antiga) que grave lançamento sem a trava: chama TODAS as
// rotas do app com o lançamento e a data de outubro (fechado). Nenhuma pode
// gravar em HourEntries. O controle (mês aberto) prova que o teste alcança as
// gravações das rotas conhecidas, para não passar no vazio.
test('nenhuma rota do app grava lançamento de mês fechado', async () => {
  const gravamComMesAberto = new Set();
  for (const r of todosHandlers()) {
    const h = compilar(r.code);
    for (const [data, id, fechados] of [
      [OUT, 'out1', ['2026-10']],
      [NOV, 'nov1', []],
    ]) {
      for (const acao of ['approve', 'adjust', 'reject']) {
        // no cenário fechado só existem lançamentos de outubro: qualquer
        // gravação é gravação em mês fechado
        const w = fechados.length
          ? mundo({ fechados, lancamentos: [lanc('out1', OUT), lanc('out-aprovado', OUT, { status: 'APPROVED' })] })
          : mundo({ fechados });
        const ctx = contexto({
          method: r.method,
          params: { id, month: data.slice(0, 7), acao: 'close' },
          body: {
            date: data,
            start_time: '09:00',
            end_time: '10:00',
            user_id: 'u',
            action: acao,
            justification: 'teste',
            status: 'APPROVED',
            description: 'x',
          },
          query: { month: data.slice(0, 7) },
          models: w,
        });
        try {
          await h(ctx);
        } catch {
          /* rota que lança erro com este corpo não gravou nada que interesse */
        }
        if (fechados.length) {
          assert.deepEqual(w.HourEntries.gravacoes, [], `${r.method} ${r.path} gravou lançamento de mês fechado`);
        } else if (w.HourEntries.gravacoes.length) {
          gravamComMesAberto.add(`${r.method} ${r.path}`);
        }
      }
    }
  }
  for (const esperado of [
    'POST /hour-entries',
    'PATCH /hour-entries/:id',
    'DELETE /hour-entries/:id',
    'POST /hour-entries/:id/approve',
    'POST /hour-entries/bulk-approve',
  ]) {
    assert.ok(gravamComMesAberto.has(esperado), `o teste não alcançou a gravação de ${esperado}`);
  }
});

test('o trecho da trava é o mesmo em todas as rotas que o usam, e igual à fonte', () => {
  const comTrecho = todosHandlers().filter((h) => h.code.includes('<mes-fechado>'));
  assert.deepEqual(
    comTrecho.map((h) => `${h.method} ${h.path}`).sort(),
    [
      'DELETE /hour-entries/:id',
      'PATCH /hour-entries/:id',
      'POST /hour-entries',
      'POST /hour-entries/:id/approve',
      'POST /hour-entries/bulk-approve',
    ],
  );
  for (const h of comTrecho) assert.ok(h.code.includes(TRECHO), `${h.method} ${h.path} tem cópia diferente`);
});
