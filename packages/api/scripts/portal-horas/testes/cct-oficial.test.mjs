// Regra da CCT SINDPD-SP 2026/2027 no cálculo oficial dos CLT (a partir de
// outubro/2026). Handler carregado do routes.generated.ts. Massa SINTÉTICA;
// esperados feitos à mão: valor = minutos ÷ 60 × H × fator, arredondado uma vez
// por rubrica. Out/2026: dia 4 domingo, 6 terça, 9 sexta, 10 sábado, 12 segunda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarHandler } from './_carregar.mjs';

const finance = carregarHandler('GET', '/finance/investment-calculator');
const REGRA = 'cct-sindpd-sp-2026';

function fakeFindMany(rows) {
  return async (filtro = {}) => {
    const campos = Object.entries(filtro).filter(([k]) => k !== 'limit' && k !== 'offset');
    return rows
      .filter((r) => campos.every(([k, v]) => r[k] === v))
      .slice(0, Math.min(500, Number(filtro.limit) || 500));
  };
}
const min = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
// Lançamento com horário; duração = fim − início (atravessa a meia-noite se fim < início).
function lanc(tipo, date, ini, fim, extra = {}) {
  const d = min(fim) > min(ini) ? min(fim) - min(ini) : min(fim) + 1440 - min(ini);
  return {
    user_id: 'c',
    date,
    start_time: ini,
    end_time: fim,
    hour_type: tipo,
    duration_minutes: d,
    status: 'APPROVED',
    ...extra,
  };
}
function semHora(tipo, date, duracao, extra = {}) {
  return { user_id: 'c', date, hour_type: tipo, duration_minutes: duracao, status: 'APPROVED', ...extra };
}
async function calc(lancamentos, { hora = 22, perfil = {}, feriados = [], mes = '2026-10' } = {}) {
  const perfis = [
    { id: 'adm', role: 'admin', email: 'adm@x' },
    {
      id: 'c',
      role: 'user',
      email: 'c@x',
      contract_type: 'CLT',
      rate_type: 'hourly',
      hourly_rate: hora,
      monthly_rate: hora * 200,
      ...perfil,
    },
  ];
  let s = 200;
  const res = await finance({
    query: { month: mes },
    user: { id: 'adm', roles: ['admin'] },
    models: {
      StaffProfile: {
        findById: async (id) => perfis.find((p) => p.id === id) || null,
        findMany: fakeFindMany(perfis),
      },
      HourEntries: { findMany: fakeFindMany(lancamentos) },
      Holidays: { findMany: fakeFindMany(feriados.map((date) => ({ date }))) },
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
  assert.equal(s, 200);
  const row = res.body.rows.find((r) => r.userId === 'c');
  return Object.assign(row, { _totals: res.body.totals });
}

test('domingo, escala 12h, atendimento 2h, H = 30 → 1/3 nas 12h (120) + 2× no atendimento (120) = 240', async () => {
  const r = await calc(
    [
      lanc('BIP_STANDBY', '2026-10-04', '08:00', '20:00'),
      lanc('BIP_ATTENDANCE', '2026-10-04', '10:00', '12:00'),
    ],
    { hora: 30 },
  );
  assert.equal(r.regraCalculo, REGRA);
  assert.equal(r.cct.regra, REGRA);
  assert.equal(r.cct.sobreavisoMinutes, 720); // acumula: não abate as 2h atendidas
  assert.equal(r.cct.sobreavisoValue, 120);
  assert.equal(r.cct.fimDeSemanaMinutes, 120);
  assert.equal(r.cct.fimDeSemanaValue, 120);
  assert.equal(r.extraAndAttendanceValue, 120);
  assert.equal(r.standbyAndBackupValue, 120);
  assert.equal(r.incrementalTotal, 240);
  assert.equal(r.totalCost, 6240); // 6.000 + 240
  assert.equal(r.attendanceValue, null); // a faixa é do dia, não do tipo
  assert.equal(r.attendanceMinutes, 120);
  assert.equal(r.standbyValue, 120);
  assert.equal(r.simulacao, undefined);
});

test('dia útil: 3h seguidas → 120 min a 1,75 (77,00) + 60 min a 2 (44,00); totais somam a linha', async () => {
  const r = await calc([lanc('EXTRA', '2026-10-06', '18:00', '21:00')]);
  assert.equal(r.cct.faixaMinutes, 120);
  assert.equal(r.cct.faixaValue, 77);
  assert.equal(r.cct.excedenteMinutes, 60);
  assert.equal(r.cct.excedenteValue, 44);
  assert.equal(r.extraAndAttendanceHours, 3);
  assert.equal(r.extraAndAttendanceValue, 121);
  assert.equal(r.incrementalTotal, 121);
  assert.equal(r.extraValue, null);
  assert.equal(r.extraMinutes, 180);
  assert.equal(r._totals.extraAndAttendanceValue, 121);
  assert.equal(r._totals.incrementalTotal, 121);
  assert.equal(r._totals.totalCost, 4400 + 121);
});

test('fronteira exata: 120 min fica todo na faixa; 121 min põe 1 min a 2×', async () => {
  const a = (await calc([lanc('EXTRA', '2026-10-06', '18:00', '20:00')])).cct;
  assert.equal(a.faixaMinutes, 120);
  assert.equal(a.excedenteMinutes, 0);
  const b = (await calc([lanc('EXTRA', '2026-10-06', '18:00', '20:01')])).cct;
  assert.equal(b.faixaMinutes, 120);
  assert.equal(b.excedenteMinutes, 1);
  assert.equal(b.excedenteValue, 0.73); // 1/60 × 22 × 2 = 0,7333
});

test('dois blocos no mesmo dia dividem a faixa do dia', async () => {
  const c = (
    await calc([
      lanc('EXTRA', '2026-10-06', '18:00', '19:30'),
      lanc('BIP_ATTENDANCE', '2026-10-06', '22:00', '23:30'),
    ])
  ).cct;
  assert.equal(c.faixaMinutes, 120);
  assert.equal(c.faixaValue, 77);
  assert.equal(c.excedenteMinutes, 60);
  assert.equal(c.excedenteValue, 44);
});

test('faixa por dia de calendário: o que passa da meia-noite entra na faixa do dia seguinte', async () => {
  // Terça 23:00–quarta 01:00 (60 min em cada dia) + quarta 18:00–20:00.
  const c = (
    await calc([
      lanc('BIP_ATTENDANCE', '2026-10-06', '23:00', '01:00'),
      lanc('EXTRA', '2026-10-07', '18:00', '20:00'),
    ])
  ).cct;
  // Terça: 60 na faixa. Quarta: 180 no dia → 120 na faixa, 60 a 2×.
  assert.equal(c.faixaMinutes, 180);
  assert.equal(c.excedenteMinutes, 60);
});

test('feriado em dia útil → 2× desde o primeiro minuto', async () => {
  const c = (await calc([lanc('EXTRA', '2026-10-12', '18:00', '19:00')], { feriados: ['2026-10-12'] })).cct;
  assert.equal(c.fimDeSemanaMinutes, 60);
  assert.equal(c.fimDeSemanaValue, 44);
  const sem = (await calc([lanc('EXTRA', '2026-10-12', '18:00', '19:00')])).cct;
  assert.equal(sem.fimDeSemanaMinutes, 0);
  assert.equal(sem.faixaMinutes, 60);
});

test('atravessa a meia-noite de sexta para sábado: cada pedaço no seu dia', async () => {
  const c = (await calc([lanc('BIP_ATTENDANCE', '2026-10-09', '23:00', '01:00')])).cct;
  assert.equal(c.faixaMinutes, 60);
  assert.equal(c.faixaValue, 38.5);
  assert.equal(c.fimDeSemanaMinutes, 60);
  assert.equal(c.fimDeSemanaValue, 44);
});

test('sobreaviso a 1/3 exato: 3h = H; 1h = 7,33', async () => {
  const tres = await calc([lanc('BIP_STANDBY', '2026-10-06', '09:00', '12:00')]);
  assert.equal(tres.cct.sobreavisoValue, 22);
  assert.equal(tres.standbyAndBackupValue, 22);
  const uma = (await calc([lanc('BIP_STANDBY', '2026-10-06', '09:00', '10:00')])).cct;
  assert.equal(uma.sobreavisoValue, 7.33);
});

test('acumula: atendimento dentro da escala não tira minutos do 1/3', async () => {
  const c = (
    await calc([
      lanc('BIP_STANDBY', '2026-10-06', '10:00', '12:00'),
      lanc('BIP_ATTENDANCE', '2026-10-06', '11:30', '12:30'),
    ])
  ).cct;
  assert.equal(c.sobreavisoMinutes, 120);
  assert.equal(c.sobreavisoValue, 14.67); // 120 min × 22 ÷ 3 = 14,666…
  assert.equal(c.faixaValue, 38.5);
});

test('backup mantém 1/3 em rubrica própria e soma com o sobreaviso', async () => {
  const r = await calc([lanc('BIP_BACKUP', '2026-10-06', '09:00', '12:00')]);
  assert.equal(r.cct.backupMinutes, 180);
  assert.equal(r.cct.backupValue, 22); // 1/3, não 0,3 (19,80)
  assert.equal(r.cct.sobreavisoMinutes, 0);
  assert.equal(r.backupValue, 22);
  assert.equal(r.standbyAndBackupValue, 22);
  const ambos = await calc([
    lanc('BIP_BACKUP', '2026-10-06', '09:00', '12:00'),
    lanc('BIP_STANDBY', '2026-10-06', '09:00', '12:00'),
  ]);
  assert.equal(ambos.standbyAndBackupValue, 44);
  assert.equal(ambos.cct.avisos.minutosSobrepostos, 0); // grupos diferentes não se cruzam
});

test('sobreposição no mesmo grupo conta uma vez e aparece no aviso', async () => {
  const c = (
    await calc([
      lanc('BIP_ATTENDANCE', '2026-10-06', '10:30', '11:30'),
      lanc('BIP_ATTENDANCE', '2026-10-06', '11:00', '12:00'),
      lanc('BIP_STANDBY', '2026-10-06', '09:00', '11:00'),
      lanc('BIP_STANDBY', '2026-10-06', '10:00', '12:00'),
    ])
  ).cct;
  assert.equal(c.faixaMinutes, 90);
  assert.equal(c.faixaValue, 57.75);
  assert.equal(c.sobreavisoMinutes, 180);
  assert.equal(c.sobreavisoValue, 22);
  assert.equal(c.avisos.minutosSobrepostos, 30 + 60);
});

test('pausa: intervalo encurtado pela duração gravada e sinalizado', async () => {
  const c = (
    await calc([lanc('EXTRA', '2026-10-06', '18:00', '21:00', { duration_minutes: 150, break_minutes: 30 })])
  ).cct;
  assert.equal(c.faixaMinutes, 120);
  assert.equal(c.excedenteMinutes, 30);
  assert.equal(c.avisos.comPausa, 1);
});

test('sem horário: a duração conta inteira no dia da data e soma na faixa do dia', async () => {
  const util = (await calc([semHora('EXTRA', '2026-10-06', 60)])).cct;
  assert.equal(util.faixaMinutes, 60);
  assert.equal(util.faixaValue, 38.5);
  assert.equal(util.avisos.semHorario, 1);
  const domingo = (await calc([semHora('BIP_ATTENDANCE', '2026-10-04', 60)])).cct;
  assert.equal(domingo.fimDeSemanaValue, 44);
  // 60 sem horário + 120 com horário na mesma terça = 180 no dia.
  const misto = (
    await calc([semHora('EXTRA', '2026-10-06', 60), lanc('EXTRA', '2026-10-06', '18:00', '20:00')])
  ).cct;
  assert.equal(misto.faixaMinutes, 120);
  assert.equal(misto.excedenteMinutes, 60);
  // Início igual ao fim não é intervalo de 24h: cai na regra do sem horário.
  const igual = (await calc([lanc('EXTRA', '2026-10-06', '18:00', '18:00', { duration_minutes: 45 })])).cct;
  assert.equal(igual.faixaMinutes, 45);
  assert.equal(igual.avisos.semHorario, 1);
});

test('duração maior que o horário: vale o horário e a diferença aparece no aviso', async () => {
  const c = (await calc([lanc('EXTRA', '2026-10-06', '18:00', '19:00', { duration_minutes: 90 })])).cct;
  assert.equal(c.faixaMinutes, 60);
  assert.equal(c.avisos.duracaoMaiorQueHorario, 1);
  assert.equal(c.avisos.minutosForaPorHorario, 30);
});

test('duração inválida fica fora da conta e conta em ignoredEntries', async () => {
  const r = await calc([
    lanc('EXTRA', '2026-10-06', '18:00', '19:00', { duration_minutes: -5 }),
    lanc('EXTRA', '2026-10-08', '18:00', '19:00', { duration_minutes: 30.5 }),
    lanc('EXTRA', '2026-10-07', '18:00', '19:00'),
  ]);
  assert.equal(r.ignoredEntries, 2);
  assert.equal(r.cct.faixaMinutes, 60);
});

test('pendente usa a mesma regra no custo pendente e não entra no aprovado', async () => {
  const r = await calc([lanc('BIP_ATTENDANCE', '2026-10-04', '18:00', '19:00', { status: 'PENDING' })]);
  assert.equal(r.incrementalTotal, 0);
  assert.equal(r.pendingIncrementalCost, 44); // domingo: 2×, não 1×
});

test('PJ em outubro continua no cálculo de hoje', async () => {
  const r = await calc(
    [lanc('EXTRA', '2026-10-06', '18:00', '21:00'), lanc('BIP_BACKUP', '2026-10-06', '09:00', '12:00')],
    { perfil: { contract_type: 'PJ' } },
  );
  assert.equal(r.regraCalculo, 'padrao');
  assert.equal(r.cct, null);
  assert.equal(r.extraValue, 66); // 3 h × 22 × 1
  assert.equal(r.backupValue, 19.8); // 3 h × 22 × 0,3
  assert.equal(r.incrementalTotal, 85.8);
});

test('CLT antes da vigência (setembro/2026) continua no cálculo de hoje', async () => {
  const r = await calc(
    [lanc('EXTRA', '2026-09-01', '18:00', '21:00'), lanc('BIP_STANDBY', '2026-09-06', '09:00', '12:00')],
    { mes: '2026-09' },
  );
  assert.equal(r.regraCalculo, 'padrao');
  assert.equal(r.cct, null);
  assert.equal(r.extraValue, 66);
  assert.equal(r.standbyValue, 19.8);
  assert.equal(r.incrementalTotal, 85.8);
});
