// Fatores por contrato e vigência (GET /finance/investment-calculator), handler
// carregado do routes.generated.ts. Regra decidida pelo Leonardo em 05/11/2026:
// CLT, a partir de 2026-10: extra e atendimento 2×; prontidão e backup 0,3×
// (acumulam). PJ e meses anteriores: extra e atendimento 1×.
// Massa SINTÉTICA; esperados calculados à parte com decimal (Python):
//   CLT mensal 6543.21 (hora 32.71605), extra 1049 min, atend. 326, prontidão 6673, backup 94
//   2×: extra 1143.97, atend. 355.51, prontidão 1091.57, backup 15.38 → 2606.43
//   1× (set/2026): 571.99 / 177.76 / 1091.57 / 15.38 → 1856.70
//   PJ (hora 38.947...), out/2026: 680.94 / 211.62 / 1299.49 / 18.31 → 2210.36
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarHandler } from './_carregar.mjs';

const finance = carregarHandler('GET', '/finance/investment-calculator');

function fakeFindMany(rows) {
  return async (filtro = {}) => {
    const campos = Object.entries(filtro).filter(([k]) => k !== 'limit' && k !== 'offset');
    return rows
      .filter((r) => campos.every(([k, v]) => r[k] === v))
      .slice(0, Math.min(500, Number(filtro.limit) || 500));
  };
}
const MINUTOS = { EXTRA: 1049, BIP_ATTENDANCE: 326, BIP_STANDBY: 6673, BIP_BACKUP: 94 };
function entradas(id, mes, status = 'APPROVED') {
  return Object.entries(MINUTOS).map(([tipo, m]) => ({
    user_id: id,
    date: mes + '-10',
    hour_type: tipo,
    duration_minutes: m,
    status,
  }));
}
async function rodar(mes, perfis, lancamentos) {
  let s = 200;
  return finance({
    query: { month: mes },
    user: { id: 'adm', roles: ['admin'] },
    models: {
      StaffProfile: {
        findById: async (id) => perfis.find((p) => p.id === id) || null,
        findMany: fakeFindMany(perfis),
      },
      HourEntries: { findMany: fakeFindMany(lancamentos) },
      Holidays: { findMany: fakeFindMany([]) },
    },
    reply: {
      status(c) {
        s = c;
        return this;
      },
      send(b) {
        return { status: s, body: b };
      },
    },
  });
}
const ADMIN = { id: 'adm', role: 'admin', email: 'adm@x' };
const clt = { id: 'c', role: 'user', email: 'c@x', contract_type: 'CLT', monthly_rate: 6543.21, rate_type: 'monthly' };
const pj = { id: 'p', role: 'user', email: 'p@x', contract_type: 'PJ', monthly_rate: 6543.21, rate_type: 'monthly' };
const linha = (res, id) => res.body.rows.find((r) => r.userId === id);

for (const mes of ['2026-10', '2026-11']) {
  test(`CLT em ${mes}: extra e atendimento 2×, prontidão e backup 0,3×`, async () => {
    const r = linha(await rodar(mes, [ADMIN, clt], entradas('c', mes)), 'c');
    assert.equal(r.ruleId, 'clt-2026-10');
    assert.deepEqual(r.factors, { extra: 2, attendance: 2, standby: 0.3, backup: 0.3 });
    assert.equal(r.extraValue, 1143.97); // arredonda depois do fator, não 2 × 571.99
    assert.equal(r.attendanceValue, 355.51);
    assert.equal(r.standbyValue, 1091.57);
    assert.equal(r.backupValue, 15.38);
    assert.equal(r.incrementalTotal, 2606.43);
    assert.equal(r.extraAndAttendanceValue, 1499.48);
    assert.equal(r.totalCost, 9149.64);
  });
}

test('CLT em setembro/2026 (antes da vigência): 1×', async () => {
  const r = linha(await rodar('2026-09', [ADMIN, clt], entradas('c', '2026-09')), 'c');
  assert.equal(r.ruleId, 'padrao');
  assert.deepEqual(r.factors, { extra: 1, attendance: 1, standby: 0.3, backup: 0.3 });
  assert.equal(r.extraValue, 571.99);
  assert.equal(r.incrementalTotal, 1856.7);
});

test('PJ em outubro/2026: continua 1×', async () => {
  const r = linha(await rodar('2026-10', [ADMIN, pj], entradas('p', '2026-10')), 'p');
  assert.equal(r.ruleId, 'padrao');
  assert.equal(r.extraValue, 680.94);
  assert.equal(r.attendanceValue, 211.62);
  assert.equal(r.standbyValue, 1299.49);
  assert.equal(r.backupValue, 18.31);
  assert.equal(r.incrementalTotal, 2210.36);
});

test('PJ e CLT no mesmo mês: cada um com a sua regra', async () => {
  const res = await rodar('2026-10', [ADMIN, clt, pj], [...entradas('c', '2026-10'), ...entradas('p', '2026-10')]);
  assert.equal(linha(res, 'c').incrementalTotal, 2606.43);
  assert.equal(linha(res, 'p').incrementalTotal, 2210.36);
  const cents = (v) => Math.round(v * 100);
  assert.equal(cents(res.body.totals.incrementalTotal), cents(2606.43) + cents(2210.36));
});

test('pendente usa o mesmo fator do mês (CLT 60 min em outubro → 65,43)', async () => {
  const r = linha(
    await rodar('2026-10', [ADMIN, clt], [
      { user_id: 'c', date: '2026-10-10', hour_type: 'EXTRA', duration_minutes: 60, status: 'PENDING' },
    ]),
    'c',
  );
  assert.equal(r.pendingIncrementalCost, 65.43);
  assert.equal(r.extraValue, 0);
});

test('contrato gravado em minúscula também é CLT para a regra', async () => {
  const r = linha(
    await rodar('2026-10', [ADMIN, { ...clt, contract_type: ' clt ' }], entradas('c', '2026-10')),
    'c',
  );
  assert.equal(r.ruleId, 'clt-2026-10');
  assert.equal(r.incrementalTotal, 2606.43);
});

test('sem contrato (vale como PJ) em outubro: 1×', async () => {
  const { contract_type, ...semContrato } = clt;
  const r = linha(await rodar('2026-10', [ADMIN, semContrato], entradas('c', '2026-10')), 'c');
  assert.equal(r.ruleId, 'padrao');
  assert.equal(r.factors.extra, 1);
});
