// Precisão do Financeiro (GET /finance/investment-calculator), handler carregado
// do routes.generated.ts. Massa SINTÉTICA; valores esperados calculados à parte
// com decimal (Python), não com o código testado:
//   CLT, mensal 6543.21 → hora exata 32.71605
//   extra 1049 min, atendimento 326, prontidão 6673, backup 94, normal 9587
//   rubricas (meio para cima, uma vez cada): 571.99 / 177.76 / 1091.57 / 15.38
//   incremental 1856.70; total 8399.91
// Regras de fator NÃO mudam nesta fase: extra e atendimento 1×; prontidão e backup 0,3×.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarHandler } from './_carregar.mjs';

const finance = carregarHandler('GET', '/finance/investment-calculator');
const MES = '2026-11';

function fakeFindMany(rows) {
  return async (filtro = {}) => {
    const campos = Object.entries(filtro).filter(([k]) => k !== 'limit' && k !== 'offset');
    return rows
      .filter((r) => campos.every(([k, v]) => r[k] === v))
      .slice(0, Math.min(500, Number(filtro.limit) || 500));
  };
}
const lanc = (userId, tipo, minutos, status = 'APPROVED', date = '2026-11-10') => ({
  user_id: userId,
  date,
  hour_type: tipo,
  duration_minutes: minutos,
  status,
});
function rodar(perfis, entradas, user = { id: 'adm', roles: ['admin'] }) {
  let s = 200;
  return finance({
    query: { month: MES },
    user,
    models: {
      StaffProfile: {
        findById: async (id) => perfis.find((p) => p.id === id) || null,
        findMany: fakeFindMany(perfis),
      },
      HourEntries: { findMany: fakeFindMany(entradas) },
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
const MINUTOS = { EXTRA: 1049, BIP_ATTENDANCE: 326, BIP_STANDBY: 6673, BIP_BACKUP: 94, NORMAL: 9587 };
function entradasDe(id, minutos = MINUTOS) {
  return Object.entries(minutos).map(([tipo, m]) => lanc(id, tipo, m));
}
const perfil = (extra = {}) => ({
  id: 's1',
  role: 'user',
  email: 's1@x',
  contract_type: 'CLT',
  monthly_rate: 6543.21,
  ...extra,
});
const linha = (res, id = 's1') => res.body.rows.find((r) => r.userId === id);

test('origem mensal: rubricas exatas, cada uma arredondada uma vez', async () => {
  const res = await rodar([ADMIN, perfil({ rate_type: 'monthly' })], entradasDe('s1'));
  assert.equal(res.status, 200);
  const r = linha(res);
  assert.equal(r.rateOrigin, 'monthly');
  assert.equal(r.rateOriginPending, false);
  assert.equal(r.extraMinutes, 1049);
  assert.equal(r.extraValue, 571.99);
  assert.equal(r.attendanceMinutes, 326);
  assert.equal(r.attendanceValue, 177.76);
  assert.equal(r.standbyMinutes, 6673);
  assert.equal(r.standbyValue, 1091.57);
  assert.equal(r.backupMinutes, 94);
  assert.equal(r.backupValue, 15.38);
  assert.equal(r.incrementalTotal, 1856.7);
  assert.equal(r.totalCost, 8399.91);
  assert.equal(r.basePayment, 6543.21);
  assert.equal(r.referenceHourlyRate, 32.72); // exibição
});

test('agregados legados = soma das rubricas arredondadas; horas pela soma de minutos', async () => {
  const r = linha(await rodar([ADMIN, perfil({ rate_type: 'monthly' })], entradasDe('s1')));
  assert.equal(r.extraAndAttendanceValue, 749.75); // 571.99 + 177.76
  assert.equal(r.standbyAndBackupValue, 1106.95); // 1091.57 + 15.38
  assert.equal(r.extraAndAttendanceHours, 22.92); // 1375 min
  assert.equal(r.standbyAndBackupHours, 112.78); // 6767 min
  assert.equal(r.incrementalHours, 135.7); // 8142 min
  assert.equal(r.normalHours, 159.78); // 9587 min
  const cents = (v) => Math.round(v * 100);
  assert.equal(
    cents(r.incrementalTotal),
    cents(r.extraValue) + cents(r.attendanceValue) + cents(r.standbyValue) + cents(r.backupValue),
  );
});

test('origem mensal ignora a hora arredondada que a tela grava (32,72)', async () => {
  const r = linha(
    await rodar([ADMIN, perfil({ rate_type: 'monthly', hourly_rate: 32.72 })], entradasDe('s1')),
  );
  assert.equal(r.incrementalTotal, 1856.7);
  assert.equal(r.rateOriginPending, false);
});

test('origem hora: a hora gravada é preservada (não troca pelo mensal ÷ divisor)', async () => {
  const r = linha(
    await rodar([ADMIN, perfil({ rate_type: 'hourly', hourly_rate: 32.72 })], entradasDe('s1')),
  );
  assert.equal(r.rateOrigin, 'hourly');
  assert.equal(r.incrementalTotal, 1856.91); // decimal: 32.72 exata, minutos exatos
  assert.equal(r.rateOriginPending, false);
});

test('origem hora com mais de 2 casas (gravada pela API) não perde precisão', async () => {
  // 32.71605 = mesma hora exata do mensal 6543.21 ÷ 200 → mesmo incremental.
  const r = linha(
    await rodar([ADMIN, perfil({ rate_type: 'hourly', hourly_rate: 32.71605 })], entradasDe('s1')),
  );
  assert.equal(r.incrementalTotal, 1856.7);
});

test('legado sem origem com os dois valores: regra de antes (hora gravada) e pendente', async () => {
  const r = linha(await rodar([ADMIN, perfil({ hourly_rate: 32.72 })], entradasDe('s1')));
  assert.equal(r.rateOrigin, null);
  assert.equal(r.rateOriginPending, true);
  assert.equal(r.incrementalTotal, 1856.91);
});

test('legado só com mensal: mensal ÷ divisor exato, sem pendência', async () => {
  const r = linha(await rodar([ADMIN, perfil()], entradasDe('s1')));
  assert.equal(r.rateOriginPending, false);
  assert.equal(r.incrementalTotal, 1856.7);
});

test('origem definida sem o valor dela: cadastro inconsistente → pendente', async () => {
  const r = linha(
    await rodar(
      [ADMIN, perfil({ rate_type: 'hourly', hourly_rate: null })],
      entradasDe('s1'),
    ),
  );
  assert.equal(r.rateOriginPending, true);
  assert.equal(r.incrementalTotal, 1856.7); // caiu no mensal ÷ divisor
});

test('meio para cima exato: 5,005 → 5,01 (float daria 5,00)', async () => {
  const r = linha(
    await rodar(
      [ADMIN, perfil({ monthly_rate: 1001, rate_type: 'monthly' })],
      [lanc('s1', 'EXTRA', 60)],
    ),
  );
  assert.equal(r.extraValue, 5.01);
});

test('fracionamento: 30 + 30 + 60 min = 120 min numa entrada só', async () => {
  const p = perfil({ rate_type: 'monthly' });
  const a = linha(
    await rodar([ADMIN, p], [lanc('s1', 'EXTRA', 30), lanc('s1', 'EXTRA', 30), lanc('s1', 'EXTRA', 60)]),
  );
  const b = linha(await rodar([ADMIN, p], [lanc('s1', 'EXTRA', 120)]));
  assert.equal(a.extraValue, 65.43);
  // Compara o cálculo oficial; a simulação conta avisos por lançamento (sem horário).
  const { simulacao: _sa, ...oficialA } = a;
  const { simulacao: _sb, ...oficialB } = b;
  assert.deepEqual(oficialA, oficialB);
});

test('status: APPROVED e ADJUSTED entram; PENDING à parte; REJECTED fora', async () => {
  const r = linha(
    await rodar(
      [ADMIN, perfil({ rate_type: 'monthly' })],
      [
        lanc('s1', 'EXTRA', 60, 'APPROVED'),
        lanc('s1', 'EXTRA', 60, 'ADJUSTED'),
        lanc('s1', 'EXTRA', 60, 'PENDING'),
        lanc('s1', 'EXTRA', 600, 'REJECTED'),
      ],
    ),
  );
  assert.equal(r.extraMinutes, 120);
  assert.equal(r.extraValue, 65.43);
  assert.equal(r.pendingIncrementalCost, 32.72); // 60 min × 32.71605
});

test('duração inválida fica fora da conta e é contada', async () => {
  const r = linha(
    await rodar(
      [ADMIN, perfil({ rate_type: 'monthly' })],
      [
        lanc('s1', 'EXTRA', 120),
        lanc('s1', 'EXTRA', -30),
        lanc('s1', 'EXTRA', 12.5),
        lanc('s1', 'EXTRA', 'abc'),
        lanc('s1', 'EXTRA', 45, 'PENDING'),
        lanc('s1', 'EXTRA', -1, 'PENDING'),
      ],
    ),
  );
  assert.equal(r.extraMinutes, 120);
  assert.equal(r.ignoredEntries, 4);
  // Contraste: sem as inválidas, nada é ignorado.
  const ok = linha(
    await rodar([ADMIN, perfil({ rate_type: 'monthly' })], [lanc('s1', 'EXTRA', 120)]),
  );
  assert.equal(ok.ignoredEntries, 0);
});

test('sem minutos → rubricas zero; sem valor → aviso de valor hora', async () => {
  const r = linha(await rodar([ADMIN, perfil({ rate_type: 'monthly' })], []));
  assert.equal(r.incrementalTotal, 0);
  assert.equal(r.totalCost, 6543.21);
  const semValor = linha(
    await rodar([ADMIN, perfil({ monthly_rate: null })], entradasDe('s1')),
  );
  assert.equal(semValor.hasRateWarning, true);
  assert.equal(semValor.incrementalTotal, 0);
});

test('totais = soma das linhas, em centavos; pessoas isoladas', async () => {
  const p1 = perfil({ rate_type: 'monthly' });
  const p2 = { id: 's2', role: 'user', email: 's2@x', monthly_rate: 3360, rate_type: 'monthly' };
  const res = await rodar(
    [ADMIN, p1, p2],
    [...entradasDe('s1'), lanc('s2', 'EXTRA', 60), lanc('s2', 'BIP_STANDBY', 600)],
  );
  const a = linha(res, 's1');
  const b = linha(res, 's2');
  assert.equal(a.incrementalTotal, 1856.7); // não muda com a presença de s2
  assert.equal(b.extraValue, 20); // 3360 / 168 = 20
  assert.equal(b.standbyValue, 60); // 10 h × 20 × 0,3
  const cents = (v) => Math.round(v * 100);
  assert.equal(cents(res.body.totals.incrementalTotal), cents(a.incrementalTotal) + cents(b.incrementalTotal));
  assert.equal(cents(res.body.totals.totalCost), cents(a.totalCost) + cents(b.totalCost));
  assert.equal(res.body.totals.incrementalHours, 146.7); // (8142 + 660) min = 8802 min
});

test('não-admin vê só a própria linha; chave sem pessoa → 401', async () => {
  const eu = perfil({ rate_type: 'monthly' });
  const outro = { id: 's2', role: 'user', email: 's2@x', monthly_rate: 3360 };
  const res = await rodar([eu, outro], [...entradasDe('s1'), lanc('s2', 'EXTRA', 60)], {
    id: 's1',
    roles: [],
  });
  assert.equal(res.status, 200);
  assert.deepEqual(
    res.body.rows.map((r) => r.userId),
    ['s1'],
  );
  const semPessoa = await rodar([ADMIN], [], { type: 'apiKey' });
  assert.equal(semPessoa.status, 401);
});
